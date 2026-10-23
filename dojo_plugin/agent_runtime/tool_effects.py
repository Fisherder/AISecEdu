from __future__ import annotations

import pathlib
import shutil

from .commands import _admit, admit_image_pull


def prepare_course_images(action, actor, dojo):
    return [admit_image_pull(action, actor, challenge, suffix=f'image-pull:{challenge.challenge_id}').id
            for module in dojo.modules for challenge in module.challenges
            if not (challenge.image or '').startswith(('mac:', 'pwncollege-', 'pwncollege/', 'challenges.pwn.college/'))]


def admit_cleanup(action, actor, packages, workspaces, course_path):
    from ..utils import get_all_containers

    containers = {}
    for workspace in workspaces:
        if isinstance(workspace, tuple):
            dojo, module_id, challenge_id = workspace
            selected = [container for container in get_all_containers(dojo)
                        if container.labels.get('dojo.module_id') == module_id
                        and container.labels.get('dojo.challenge_id') == challenge_id]
        else:
            selected = [workspace]
        for container in selected:
            containers[container.id] = {key: container.labels.get(key) for key in
                                        ('dojo.dojo_id', 'dojo.module_id', 'dojo.challenge_id')}
    return _admit(
        command_id=f'command:{action.id}:cleanup', actor_id=actor.id,
        thread_id=action.thread_id, action_id=None, dojo_id=None, module_index=None,
        kind='agent.command.cleanup', operation={'kind': 'cleanup', 'parentActionId': action.id,
                                                'packageRoots': [str(path) for path in packages],
                                                'coursePath': str(course_path) if course_path else None,
                                                'containers': containers},
    )


def apply_cleanup(operation):
    from docker.errors import NotFound
    from CTFd.cache import clear_challenges, clear_standings
    from .. import config
    from ..learning.authoring import remove_generated_package_assets
    from ..utils import all_docker_clients
    from .jobs import PermanentJobError

    for package_root in operation['packageRoots']:
        remove_generated_package_assets(package_root)
    course_path = operation.get('coursePath')
    if course_path:
        path = pathlib.Path(course_path).resolve()
        root = (pathlib.Path(config.DOJOS_DIR) / '.learning').resolve()
        if path.parent != root or not path.name or any(c not in '0123456789abcdef' for c in path.name):
            raise PermanentJobError('Course cleanup path is outside generated course storage')
        if path.exists():
            shutil.rmtree(path)
    clients = all_docker_clients() if operation['containers'] else []
    for container_id, expected_labels in operation['containers'].items():
        for client in clients:
            try:
                container = client.containers.get(container_id)
            except NotFound:
                continue
            if any(container.labels.get(key) != value for key, value in expected_labels.items()):
                raise PermanentJobError('Workspace identity changed before cleanup')
            container.remove(force=True)
    clear_challenges()
    clear_standings()
    return {'cleaned': True, 'packageRoots': operation['packageRoots'],
            'coursePath': course_path, 'containerIds': list(operation['containers'])}
