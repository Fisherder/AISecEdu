import copy
import hashlib

from CTFd import create_app
from CTFd.models import Users

app = create_app()
with app.app_context():
    from CTFd.plugins.dojo_plugin.agent_runtime.artifacts import artifact_for_user, current_artifact_revision, create_revision

    user = Users.query.filter_by(name='teacher').one()
    artifact = artifact_for_user('artifact_834bf85621c2414db1d979f21dae8633', user)
    assert artifact.current_revision == 3 and artifact.status == 'DRAFT'
    content = copy.deepcopy(current_artifact_revision(artifact).content)
    scene = content['lesson']['artifacts'][0]['content']
    assert hashlib.sha256(scene['html'].encode()).hexdigest() == 'e83d0c98fb7324e0c4fce9f232d555541a428241c5b3ee17794be97e05cb85a3'
    previous = '''    if (state.playing){
      var dt = 1/60;
      var motion = REDUCED ? 0.35 : 1;
      state.gearPhase += dt * gearSpeed * motion;
      state.dotPhase  += dt * dotSpeed  * motion;
    }
    if (state.gearPhase > 1000) state.gearPhase %= Math.PI*2;
    if (state.dotPhase  > 1000) state.dotPhase  %= 1;'''
    assert scene['html'].count(previous) == 1
    scene['html'] = scene['html'].replace(previous, '''    var motion = REDUCED ? 0.35 : 1;
    state.gearPhase = state.t * DURATION * gearSpeed * motion;
    state.dotPhase = state.t * DURATION * dotSpeed * motion;''')
    for denominator in [300,240]:
        previous = f'performance.now()/{denominator}'
        assert scene['html'].count(previous) == 1
        scene['html'] = scene['html'].replace(previous, f'state.t * DURATION * 1000 / {denominator}')
    revision = create_revision(artifact, user, expected_revision=3, instruction='修复四阶段的统一播放时间：齿轮、光点和告警脉冲全部由时间轴确定，暂停冻结所有阶段，回拖与重置恢复同一状态；保留历史版本。', content=content)
    print('Created draft revision', revision.revision, 'with one deterministic animation clock')
