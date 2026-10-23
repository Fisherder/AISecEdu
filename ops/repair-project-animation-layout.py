import copy

from CTFd import create_app
from CTFd.models import Users

app = create_app()
with app.app_context():
    from CTFd.plugins.dojo_plugin.agent_runtime.artifacts import artifact_for_user, current_artifact_revision, create_revision

    user = Users.query.filter_by(name='teacher').one()
    artifact = artifact_for_user('artifact_594e01b1d34745f9afe267a14fa5b8cf', user)
    assert artifact.current_revision == 3 and artifact.dojo_id is None
    content = copy.deepcopy(current_artifact_revision(artifact).content)
    scene = content['lesson']['artifacts'][0]['content']
    replacements = [
        ('  <div class="stage-wrap" id="stageWrap">', '  <div class="scene-layout">\n  <div class="stage-wrap" id="stageWrap">'),
        ('    <canvas id="fallback2d" class="hidden"></canvas>', '    <canvas id="fallback2d" class="hidden"></canvas>\n  </div>\n  <div class="scene-info">'),
        ('  <div class="controls">', '  </div>\n  <div class="controls">'),
        ('</style>', '''
  .scene-layout { display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: 0; flex: 1 1 auto; }
  .stage-wrap { height: 400px; min-height: 0; overflow: hidden; }
  .scene-info { display: grid; align-content: start; gap: 10px; padding: 12px; min-width: 0; }
  .scene-info .hud, .scene-info .readouts, .scene-info .narration {
    position: static; transform: none; width: 100%; max-width: none; margin: 0; pointer-events: auto;
  }
  @media (max-width: 900px) {
    .scene-layout { grid-template-columns: minmax(0, 1fr); }
    .scene-info { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .scene-info .narration { grid-column: 1 / -1; }
  }
  @media (max-width: 420px) { .stage-wrap { height: 300px; } }
</style>'''),
    ]
    for before, after in replacements:
        assert scene['html'].count(before) == 1
        scene['html'] = scene['html'].replace(before, after)
    revision = create_revision(artifact, user, expected_revision=3, instruction='将阶段说明、读数和讲解移出画布，避免遮挡图形节点标签；保留三维和二维动画、全部交互及历史版本。', content=content)
    print('Created draft revision', revision.revision, 'with non-overlapping scene information')
