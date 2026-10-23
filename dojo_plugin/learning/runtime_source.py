import ast
import io
import pathlib
import tarfile
import uuid


MAX_IMAGE_ENTRYPOINTS = 8
MAX_IMAGE_SOURCE_BYTES = 256000
IMAGE_SOURCE_ROOTS = ('/usr/lib/', '/usr/local/lib/', '/opt/')


def image_entrypoint_diagnostics(image, paths, *, clients_factory=None):
    paths = sorted(set(paths))
    if not paths:
        return []
    if not isinstance(image, str) or not image or len(paths) > MAX_IMAGE_ENTRYPOINTS:
        return ['镜像启动入口缺少镜像引用或超出检查数量限制']
    for value in paths:
        path = pathlib.PurePosixPath(value)
        if not path.is_absolute() or '..' in value.split('/') or not value.startswith(IMAGE_SOURCE_ROOTS) or path.suffix != '.py':
            return [f'不允许的镜像启动入口 {value}']
    if clients_factory is None:
        from ..utils import all_docker_clients
        clients_factory = all_docker_clients
    clients = clients_factory()
    if not clients:
        return ['没有可检查运行镜像的节点']
    diagnostics, image_ids = [], set()
    try:
        for client in clients:
            container = None
            try:
                runtime = client.images.get(image)
                image_ids.add(runtime.id)
                container = client.containers.create(runtime.id, command=['/bin/true'], entrypoint=[],
                    name='native-source-check-' + uuid.uuid4().hex, network_disabled=True, read_only=True,
                    user='65534:65534', cap_drop=['ALL'], security_opt=['no-new-privileges'],
                    labels={'aisecedu.native-source-check': '1'})
                for value in paths:
                    stream, metadata = container.get_archive(value)
                    if int(metadata.get('size', 0)) > MAX_IMAGE_SOURCE_BYTES:
                        raise ValueError('镜像启动入口超过静态检查大小限制')
                    data = bytearray()
                    for chunk in stream:
                        data.extend(chunk)
                        if len(data) > MAX_IMAGE_SOURCE_BYTES + 65536:
                            raise ValueError('镜像启动入口归档超过大小限制')
                    with tarfile.open(fileobj=io.BytesIO(data), mode='r:') as archive:
                        members = archive.getmembers()
                        if len(members) != 1 or not members[0].isfile() or members[0].name != pathlib.PurePosixPath(value).name:
                            raise ValueError('镜像启动入口不是可独立检查的普通文件')
                        member = members[0]
                        if member.size > MAX_IMAGE_SOURCE_BYTES:
                            raise ValueError('镜像启动入口超过静态检查大小限制')
                        ast.parse(archive.extractfile(member).read().decode('utf-8'), filename=value)
            except Exception as error:
                if isinstance(error, SyntaxError):
                    diagnostics.append(f'镜像启动入口存在 Python 语法错误（第 {error.lineno or 0} 行）')
                elif isinstance(error, ValueError):
                    diagnostics.append(str(error))
                else:
                    diagnostics.append('无法从已安装运行镜像核实启动入口；请检查镜像和文件是否完整')
            finally:
                if container is not None:
                    container.remove(v=True)
    finally:
        for client in clients:
            client.close()
    if len(image_ids) > 1:
        diagnostics.append('各运行节点的镜像版本不一致，请统一镜像摘要后复验')
    return diagnostics
