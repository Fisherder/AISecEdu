#!/usr/bin/env python3
import argparse
import copy
import datetime
import fcntl
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
SERVICES = ('agent-runtime', 'courseware-inspector')
OVERLAY = 'docker-compose.generation-release.yml'


def command(args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)


def output(args):
    return subprocess.check_output(args, text=True).strip()


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def overlay(images, enabled='html-v1'):
    return {'services': {
        'agent-runtime': {'image': images['agent-runtime'], 'pull_policy': 'never',
                          'environment': {'AISECEDU_TEACHING_DEMO_ENGINE': enabled,
                                          'COURSEWARE_INSPECTOR_URL': 'http://courseware-inspector:3015',
                                          'AISECEDU_TEACHER_REQUIREMENTS_MODE': ''}},
        'courseware-inspector': {'image': images['courseware-inspector'], 'pull_policy': 'never'},
    }}


def validate_manifest(bundle):
    manifest = json.loads((bundle / 'release.json').read_text())
    if manifest.get('schema') != 'aisecedu-generation-release-v1' or not re.fullmatch(r'[a-f0-9]{40}', manifest.get('commit', '')):
        raise ValueError('Invalid generation release manifest')
    if set(manifest.get('images', {})) != set(SERVICES) or any(not re.fullmatch(r'sha256:[a-f0-9]{64}', image) for image in manifest['images'].values()):
        raise ValueError('Release must pin both image IDs')
    if sha256(bundle / 'images.tar') != manifest.get('archiveSha256'):
        raise ValueError('Release image archive checksum mismatch')
    return manifest


def build(args):
    revision = output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'])
    if output(['git', '-C', str(ROOT), 'status', '--porcelain']):
        raise ValueError('Commit and test the development branch before building an immutable release')
    command(['make', 'generation-check'], cwd=ROOT)
    bundle = args.bundle.resolve()
    bundle.mkdir(parents=True, exist_ok=False)
    try:
        images, tags = {}, []
        for service in SERVICES:
            tag = f'aisecedu/{service}:generation-{revision[:12]}'
            cmd = ['docker', 'buildx', 'build', '--platform', args.platform, '--load', '--label', f'org.opencontainers.image.revision={revision}', '-t', tag]
            if service == 'agent-runtime':
                cmd += ['--build-arg', 'AISECEDU_INTEGRATED=true', '--build-arg', 'NEXT_PUBLIC_AISECEDU_INTEGRATED=true', '--build-arg', 'NEXT_PUBLIC_BASE_PATH=/agent-runtime']
            command(cmd + [str(ROOT / 'services' / service)])
            images[service] = output(['docker', 'image', 'inspect', '--format', '{{.Id}}', tag])
            tags.append(tag)
        command(['docker', 'save', '-o', str(bundle / 'images.tar'), *tags])
        manifest = {'schema': 'aisecedu-generation-release-v1', 'commit': revision, 'platform': args.platform,
                    'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'images': images,
                    'archiveSha256': sha256(bundle / 'images.tar')}
        (bundle / 'release.json').write_text(json.dumps(manifest, indent=2) + '\n')
        (bundle / OVERLAY).write_text(json.dumps(overlay(images), indent=2) + '\n')
        print(f'Built immutable image pair: {bundle}')
    except BaseException:
        shutil.rmtree(bundle)
        raise


def engine(container, *args):
    return ['docker', 'exec', container, 'docker', *args]


def compose(container, *args):
    return ['docker', 'exec', container, 'dojo', 'compose', *args]


def installed_ids(container):
    result = {}
    for service in SERVICES:
        result[service] = output(engine(container, 'inspect', '--format', '{{.Image}}', service))
    return result


def export_running(args):
    revision = output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'])
    if output(['git', '-C', str(ROOT), 'status', '--porcelain']):
        raise ValueError('Commit the verified source before exporting its running image pair')
    bundle = args.bundle.resolve()
    bundle.mkdir(parents=True, exist_ok=False)
    images = installed_ids(args.container)
    try:
        with open(bundle / 'images.tar', 'wb') as archive:
            command(engine(args.container, 'save', *images.values()), stdout=archive)
        manifest = {'schema': 'aisecedu-generation-release-v1', 'commit': revision,
                    'platform': 'linux/amd64', 'sourceContainer': args.container,
                    'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    'images': images, 'archiveSha256': sha256(bundle / 'images.tar')}
        (bundle / 'release.json').write_text(json.dumps(manifest, indent=2) + '\n')
        print(f'Exported the exact running image pair without rebuilding: {bundle}')
    except BaseException:
        shutil.rmtree(bundle)
        raise


def read_active_override(container):
    for name in ('docker-compose.staging.yml', 'docker-compose.override.yml'):
        candidate = f'/opt/pwn.college/{name}'
        found = subprocess.run(['docker', 'exec', container, 'test', '-f', candidate],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
        if found:
            raw = output(['docker', 'exec', container, 'cat', candidate])
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                try:
                    import yaml
                except ImportError as error:
                    raise ValueError('YAML deployment files require PyYAML on the operator host') from error
                data = yaml.safe_load(raw)
            if not isinstance(data, dict) or not isinstance(data.get('services'), dict):
                raise ValueError('Existing deployment override is invalid')
            return name, data
    raise ValueError('No existing Compose override found; refusing to change an unknown deployment')


def install_override(container, file, target):
    if target not in ('docker-compose.staging.yml', 'docker-compose.override.yml'):
        raise ValueError('Invalid Compose override target')
    destination = f'/opt/pwn.college/{target}'
    command(['docker', 'cp', str(file), f'{container}:{destination}.pending'])
    command(['docker', 'exec', container, 'mv', destination + '.pending', destination])


def deploy(args):
    bundle = args.bundle.resolve()
    manifest = validate_manifest(bundle)
    if not args.apply:
        print(json.dumps({'action': 'deploy-preview', 'container': args.container, 'commit': manifest['commit'],
                          'images': manifest['images'], 'services': SERVICES, 'databaseChanges': False}, indent=2))
        return
    state = ROOT / '.local-state/generation-releases' / args.container
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    with open(state / 'deploy.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        previous = installed_ids(args.container)
        target, original = read_active_override(args.container)
        previous_override = copy.deepcopy(original)
        for service, image in previous.items():
            section = previous_override['services'].setdefault(service, {})
            section.update(image=image, pull_policy='never')
        environment = output(engine(args.container, 'inspect', '--format', '{{range .Config.Env}}{{println .}}{{end}}', 'agent-runtime'))
        flags = dict(item.split('=', 1) for item in environment.splitlines() if '=' in item)
        previous_env = previous_override['services']['agent-runtime'].setdefault('environment', {})
        if not isinstance(previous_env, dict):
            raise ValueError('Existing runtime environment must be a Compose mapping')
        for key in ('AISECEDU_TEACHING_DEMO_ENGINE', 'AISECEDU_TEACHER_REQUIREMENTS_MODE'):
            previous_env[key] = flags.get(key, '')
        previous_file = state / 'previous.json'
        previous_file.write_text(json.dumps(previous_override, indent=2))
        previous_file.chmod(0o600)
        (state / 'previous-target.json').write_text(json.dumps({'target': target}))
        with open(bundle / 'images.tar', 'rb') as archive:
            command(['docker', 'exec', '-i', args.container, 'docker', 'load'], stdin=archive)
        pending = copy.deepcopy(original)
        for service, settings in overlay(manifest['images'])['services'].items():
            section = pending['services'].setdefault(service, {})
            for key, value in settings.items():
                if key == 'environment':
                    section.setdefault('environment', {}).update(value)
                else:
                    section[key] = value
        release_file = state / 'pending.json'
        release_file.write_text(json.dumps(pending, indent=2))
        release_file.chmod(0o600)
        install_override(args.container, release_file, target)
        try:
            command(compose(args.container, 'up', '-d', '--no-deps', '--no-build', '--wait', '--wait-timeout', '180', *SERVICES))
            if installed_ids(args.container) != manifest['images']:
                raise ValueError('Running image IDs do not match the reviewed release')
            command(['docker', 'exec', args.container, 'docker', 'exec', 'agent-runtime', 'node', '-e',
                     "fetch(process.env.COURSEWARE_INSPECTOR_URL+'/health',{headers:{'X-AISecEdu-Service-Token':process.env.AISECEDU_SERVICE_SECRET}}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"])
        except BaseException:
            restore(args.container, previous_file, target)
            raise
        (state / 'current.json').write_text(json.dumps(manifest, indent=2))
        print('Applied reviewed image pair; previous pair and deployment configuration retained for rollback')


def restore(container, previous_file, target=None):
    if not previous_file.is_file():
        raise ValueError('No previous release snapshot')
    if target is None:
        target = json.loads((previous_file.parent / 'previous-target.json').read_text())['target']
    install_override(container, previous_file, target)
    command(compose(container, 'up', '-d', '--no-deps', '--no-build', '--wait', '--wait-timeout', '180', *SERVICES))
    print('Restored previous generation image pair and deployment configuration')


def main():
    parser = argparse.ArgumentParser(description='Build once, preview, promote the same AISecEdu generation image pair')
    sub = parser.add_subparsers(dest='action', required=True)
    builder = sub.add_parser('build')
    builder.add_argument('bundle', type=Path)
    builder.add_argument('--platform', default='linux/amd64')
    exporter = sub.add_parser('export')
    exporter.add_argument('bundle', type=Path)
    exporter.add_argument('--container', default='aisecedu-development')
    deployment = sub.add_parser('deploy')
    deployment.add_argument('bundle', type=Path)
    deployment.add_argument('--container', default='aisecedu-development')
    deployment.add_argument('--apply', action='store_true')
    rollback = sub.add_parser('rollback')
    rollback.add_argument('--container', default='aisecedu-development')
    rollback.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,100}', getattr(args, 'container', 'pwncollege-dojo')):
        parser.error('Invalid container name')
    if args.action == 'build':
        build(args)
    elif args.action == 'export':
        export_running(args)
    elif args.action == 'deploy':
        deploy(args)
    elif not args.apply:
        print(f'Rollback preview: restore the saved image pair on {args.container}; add --apply to execute')
    else:
        state = ROOT / '.local-state/generation-releases' / args.container
        with open(state / 'deploy.lock', 'w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            restore(args.container, state / 'previous.json')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
