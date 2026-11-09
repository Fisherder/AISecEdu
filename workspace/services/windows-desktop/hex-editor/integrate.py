import argparse
import ast
import hashlib
import json
import pathlib
import shutil
import subprocess
import tarfile


def integrate(package, source, backup):
    startup = package / 'windows/start.py'
    initializer = package / '.init'
    readme = package / 'windows/assets/README.txt'
    if not all(path.is_file() for path in (startup, initializer, readme)):
        raise ValueError('The existing lab03 runtime package is incomplete')
    startup_source = startup.read_text()
    initializer_source = initializer.read_text()
    readme_source = readme.read_text()
    provision = '        subprocess.Popen(["/usr/bin/python3", str(ROOT / "code-editor/provision-editor.py")], stdin=subprocess.DEVNULL, start_new_session=True)'
    provision_hook = '        if (ROOT / "hex-editor/provision.py").is_file():\n            subprocess.Popen(["/usr/bin/python3", str(ROOT / "hex-editor/provision.py")], stdin=subprocess.DEVNULL, start_new_session=True)'
    exec_start = 'exec /usr/bin/python3 /usr/local/lib/windows-lab/start.py'
    copy_hook = 'mkdir -p /usr/local/lib/windows-lab/hex-editor\ncp -a /challenge/windows/hex-editor/. /usr/local/lib/windows-lab/hex-editor/\ncp /usr/local/lib/windows-lab/hex-editor/tools.iso /usr/local/lib/windows-lab/code-editor/editor.iso'
    for needle, hook in ((provision, provision_hook),):
        if startup_source.count(needle) != 1:
            raise ValueError('The lab03 startup has changed; review before integrating')
        if hook not in startup_source:
            startup_source = startup_source.replace(needle, needle + '\n' + hook)
    if initializer_source.count(exec_start) != 1:
        raise ValueError('The lab03 initializer has changed; review before integrating')
    if copy_hook not in initializer_source:
        initializer_source = initializer_source.replace(exec_start, copy_hook + '\n' + exec_start)
    notice = '\n二进制编辑工具\n原 UltraEdit 试用版已到期。本实验使用免费 HxD 1.7.7.0。\n双击桌面的“HxD 十六进制编辑”，或本目录 edit-payload.cmd，打开 work\\payload.txt。\n在左侧十六进制区编辑字节，Insert 切换插入/覆盖，Ctrl+S 保存；完成后仍运行 check.cmd。\n首次安装工具可能需要等待片刻；详细说明见“十六进制编辑说明.txt”。\n'
    if notice not in readme_source:
        readme_source += notice
    ast.parse(startup_source)
    subprocess.run(['/bin/sh', '-n'], input=initializer_source, text=True, check=True)
    for name in ('HxDchs.zip', 'tools.iso', 'manifest.json', 'provision.py', 'install-guest.py'):
        if not (source / name).is_file():
            raise ValueError('Missing hex editor asset: ' + name)
    manifest = json.loads((source / 'manifest.json').read_text())
    if hashlib.sha256((source / 'HxDchs.zip').read_bytes()).hexdigest() != manifest['archiveSha256']:
        raise ValueError('Archive digest mismatch')
    if hashlib.sha256((source / 'tools.iso').read_bytes()).hexdigest() != manifest['mediaSha256']:
        raise ValueError('Installation media digest mismatch')
    backup.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(backup, 'x:gz') as archive:
        for path in (initializer, startup, readme):
            archive.add(path, arcname=str(path.relative_to(package)))
        existing = package / 'windows/hex-editor'
        if existing.exists():
            archive.add(existing, arcname='windows/hex-editor')
    shutil.copytree(source, package / 'windows/hex-editor', dirs_exist_ok=True)
    for path, content in ((startup, startup_source), (initializer, initializer_source), (readme, readme_source)):
        if path.read_text() != content:
            path.write_text(content)
    return {'backup': str(backup), 'revision': manifest['revision'], 'package': str(package)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('package', type=pathlib.Path)
    parser.add_argument('--source', type=pathlib.Path, default=pathlib.Path(__file__).resolve().parent)
    parser.add_argument('--backup', type=pathlib.Path, required=True)
    args = parser.parse_args()
    print(json.dumps(integrate(args.package, args.source, args.backup), ensure_ascii=False))
