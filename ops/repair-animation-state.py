import copy
import hashlib

from CTFd import create_app
from CTFd.models import Users

app = create_app()
with app.app_context():
    from CTFd.plugins.dojo_plugin.agent_runtime.artifacts import artifact_for_user, current_artifact_revision, create_revision

    user = Users.query.filter_by(name='teacher').one()
    artifact = artifact_for_user('artifact_3bb5c4d3bb1b4d12916988ddb6fa1f7e', user)
    assert artifact.current_revision == 6 and artifact.status == 'DRAFT'
    content = copy.deepcopy(current_artifact_revision(artifact).content)
    scene = content['lesson']['artifacts'][0]['content']
    assert hashlib.sha256(scene['html'].encode()).hexdigest() == '2ae058873a78d828e433e71c668a3b810d8f0e574df96e532603720227bf6053'
    for axis in 'xyz':
        previous = f'mesh.scale.{axis} += (tgt - mesh.scale.{axis}) * 0.25;'
        assert scene['html'].count(previous) == 1
        scene['html'] = scene['html'].replace(previous, f'mesh.scale.{axis} = tgt;')
    revision = create_revision(artifact, user, expected_revision=6, instruction='修复画布暂停与重置：取消节点缩放的跨帧缓动，使相同进度对应完全相同的图形；保留原作品和全部历史版本。', content=content)
    print('Created draft revision', revision.revision, 'with deterministic node scale')
