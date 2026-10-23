import copy
import hashlib

from CTFd import create_app
from CTFd.models import Users

app = create_app()
with app.app_context():
    from CTFd.plugins.dojo_plugin.agent_runtime.artifacts import artifact_for_user, current_artifact_revision, create_revision

    user = Users.query.filter_by(name='teacher').one()
    artifact = artifact_for_user('artifact_594e01b1d34745f9afe267a14fa5b8cf', user)
    assert artifact.current_revision == 2 and artifact.dojo_id is None
    content = copy.deepcopy(current_artifact_revision(artifact).content)
    scene = content['lesson']['artifacts'][0]['content']
    assert hashlib.sha256(scene['html'].encode()).hexdigest() == '045508bcb9147cb7270eaa8edf4552bd36b2ec7d58e5bda5e006aae8bcd6f2bc'
    previous = 'canvas: el.canvas3d, antialias: true, alpha: false'
    assert scene['html'].count(previous) == 1
    scene['html'] = scene['html'].replace(previous, 'canvas: el.canvas3d, context: testCtx, antialias: true, alpha: false')
    revision = create_revision(artifact, user, expected_revision=2, instruction='将已创建的 WebGL1 上下文传给 Three.js 渲染器，消除重复请求不同上下文类型的错误；不改变画面内容、时间轴和历史版本。', content=content)
    print('Created draft revision', revision.revision, 'with explicit WebGL context')
