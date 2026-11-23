"""Adapter from durable teacher input to the official native workshop tools."""

import json
import re
from concurrent.futures import ThreadPoolExecutor

import requests

from . import ordinary_courseware, teacher_dsh_chat

PIN = "teachingWorkshop"
CONTRACT = "teaching-workshop-v1"
_MAX_ROUNDS = 2
_PAGE_COUNT = re.compile(r"(?:共|制作|做|生成|设计|写|要|用|一份|一套|[约为：，, ])?\s*([0-9]{1,3}|十[一二]?|[一二三四五六七八九两])\s*(?:页|张)(?=课件|幻灯片|演示稿|介绍|讲|[，。！？、\s]|$)")
_PAGE_NUMBERS = {word: n for n, word in enumerate("一二三四五六七八九", 1)} | {"两": 2, "十": 10, "十一": 11, "十二": 12}


def intake(brief, context=None):
    style, clean = ordinary_courseware.brief(brief)
    answer_rows = (context or {}).get("answers") or []
    round_number = (context or {}).get("round", 0)
    if not 0 <= round_number <= _MAX_ROUNDS or len(answer_rows) > 6:
        raise ValueError("这项课件需求已完成澄清，请从新对话开始新的项目。")
    questions = [{"question": ordinary_courseware.brief(row["question"])[1][:180],
                  "answer": ordinary_courseware.brief(row["answer"])[1][:750]} for row in answer_rows]
    page_count = 0
    if style == "slides":
        for text in [clean, *(row["answer"] for row in questions)]:
            for match in _PAGE_COUNT.finditer(text):
                token = match[1]
                page_count = int(token) if token.isdecimal() else _PAGE_NUMBERS[token]
                if not 2 <= page_count <= 12:
                    raise ValueError("请选择 2 至 12 页的课件，可分成多份保存。")
    return {"phase": "intake", "kind": {"slides": "deck", "demo": "simulation", "stack-capacity": "stack"}[style],
            "brief": clean, "answers": questions, "round": round_number, "pageCount": page_count}


def _turn(root, secret, model, payload):
    from .jobs import PermanentJobError, RuntimeJobError

    try:
        with requests.Session() as client:
            client.trust_env = False
            response = client.post(root + "/v1/teaching-workshop", json=payload,
                                   headers={"Authorization": f"Bearer {secret}"},
                                   allow_redirects=False, timeout=(5, 154))
            if response.status_code == 400:
                raise PermanentJobError("创作要求未通过教学内容校验，请调整要求后重试。")
            if response.status_code == 502:
                reason = response.json().get("errorCode")
                if reason in {"QUESTION_SHAPE", "OUTPUT_SHAPE", "MODEL_CONSISTENCY", "TOOL_RESULT", "RUN_INCOMPLETE"}:
                    raise RuntimeJobError(f"智能体没有交付有效的教学内容（{reason}）。", category="quality")
            response.raise_for_status()
            receipt = response.json()
    except (requests.RequestException, ValueError):
        raise RuntimeJobError("智能体没有交付有效的教学内容，请重试。", category="service") from None
    usage = receipt.get("usage") or {}
    if (receipt.get("model") != model or not isinstance(receipt.get("submission"), dict)
            or any(type(usage.get(key)) is not int or usage[key] <= 0
                   for key in ("prompt_tokens", "completion_tokens", "total_tokens"))
            or usage["prompt_tokens"] + usage["completion_tokens"] != usage["total_tokens"]):
        raise PermanentJobError("教学创作缺少有效的模型执行回执。")
    return receipt["submission"], usage


def _ordered_nodes(rows):
    positions = ((0.18, 0.27), (0.50, 0.27), (0.82, 0.27),
                 (0.82, 0.74), (0.50, 0.74))
    nodes = [{"id": f"node-{index}", "label": row["label"], "x": x, "y": y,
              "detail": (row["detail"] + "。观察它与下一环节的关系。")[:100]}
             for index, (row, (x, y)) in enumerate(zip(rows, positions), 1)]
    edges = [{"id": f"edge-{index}", "from": left["id"], "to": right["id"]}
             for index, (left, right) in enumerate(zip(nodes, nodes[1:]), 1)]
    return {"kind": "diagram", "nodes": nodes, "edges": edges, "relationship": "按箭头说明各环节如何相互影响。"}, []


def _visual(page, chosen):
    rows = page["rows"]
    if chosen == "diagram":
        return _ordered_nodes(rows)
    if chosen == "chart" and len({row["value"] for row in rows}) > 1:
        return {"kind": "chart", "chartType": "column", "labels": [row["label"] for row in rows],
                "series": [{"name": page["chartUnit"], "values": [row["value"] for row in rows]}],
                "unit": page["chartUnit"], "basis": "课堂示例，用于观察数值的相对变化。", "illustrative": True}, []
    if chosen == "scene":
        steps = [{"label": row["label"], "detail": row["detail"]} for row in rows[:4]]
        shapes, beats = ordinary_courseware._sequence(steps, True)
        return {"kind": "scene", "description": "逐步呈现各环节的概念和关系。", "objects": shapes}, beats
    return {"kind": "comparison", "columns": ["要点", "说明"],
            "rows": [{"label": str(index), "values": [row["label"], row["detail"]]}
                     for index, row in enumerate(rows, 1)]}, []


def _slide(page, design, index):
    page_id = f"page-{index + 1}"
    visual, beats = _visual(page, design["pages"][index]["visual"])
    layout = {
        "title": {"box": {"left": 52, "top": 28, "width": 896, "height": 60}, "fontSize": 38},
        "takeaway": {"box": {"left": 52, "top": 94, "width": 896, "height": 66}, "fontSize": 22},
        "visual": {"left": 52, "top": 171, "width": 896, "height": 342}, "supporting": [],
    }
    studio = {"theme": ordinary_courseware.THEME, "assets": [], "page": {
        "schema": "courseware-page-v2", "id": page_id, "title": page["title"],
        "objective": design["objective"], "takeaway": page["takeaway"], "composition": "wide",
        "role": "opening" if index == 0 else "closing" if index == len(design["pages"]) - 1 else "explanation",
        "speakerNotes": page["notes"], "durationSeconds": 90, "visual": visual, "beats": beats, "layout": layout,
    }}
    return {"id": page_id, "type": "slide", "title": page["title"], "order": index,
            "outline": {"id": page_id, "type": "slide", "title": page["title"], "order": index},
            "content": {"studio": studio}}


def _simulation_html(data):
    document = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")
    return SIMULATION_TEMPLATE.replace("__TEACHING_DATA__", document, 1)


def _simulation_artifact(data):
    return {
        "id": "simulation-main", "type": "simulation", "title": data["title"], "order": 0,
        "outline": {"id": "simulation-main", "type": "simulation", "title": data["title"], "order": 0},
        "content": {"height": 640, "html": _simulation_html(data), "widgetType": "teaching-workshop",
                    "widgetConfig": data},
    }


def is_simulation(content):
    return isinstance(content, dict) and content.get(PIN) == CONTRACT and content.get("artifactType") == "simulation"


def revise_simulation(job, revision):
    from .jobs import PermanentJobError, heartbeat

    root, secret, model = teacher_dsh_chat._connection()
    original = revision.content
    if revision.source_refs or not is_simulation(original):
        raise PermanentJobError("这份模拟没有可继续修改的创作模型。")
    design = original["coursewareDesign"]
    current = original["lesson"]["artifacts"][0]["content"]["widgetConfig"]
    instruction = ordinary_courseware.brief(job.payload["instruction"])[1]
    prompt = (f"当前模拟：{current['title']}。调节 {current['parameter']}，观察 {current['measure']}。"
              f"{current['modelNote']}。教师修改要求：{instruction}。保留没有要求修改的教学机制，交付完整的新版本。")
    body = intake(prompt)
    body.update(phase="simulation", kind=original.get("teachingWorkshopKind", "simulation"), plan=design)
    job = heartbeat(job, stage="authoring", progress=38, message="正在修改模拟的输入、可见反馈和课堂检测")
    submitted, usage = _turn(root, secret, model, body)
    updated = submitted["simulation"]
    return {**original, "lesson": {**original["lesson"], "title": updated["title"],
                                   "description": updated["objective"], "artifacts": [_simulation_artifact(updated)]}}, usage


def invoke(job, payload):
    from .jobs import PermanentJobError, heartbeat

    root, secret, model = teacher_dsh_chat._connection()
    body = payload[PIN]
    expected = intake(payload["prompt"], (payload.get("context") or {}).get("questionReply"))
    if not model or body != expected:
        raise PermanentJobError("任务要求已变化，请重新发起教学创作。")
    checkpoint = (job.result or {}).get("_workshop")
    if checkpoint and checkpoint.get("input") != body:
        raise PermanentJobError("任务恢复时发现教学要求与已核验内容不一致。")
    plan = checkpoint["plan"] if checkpoint else None
    usage = dict(checkpoint["usage"]) if checkpoint else {}
    parts = list(checkpoint["parts"]) if checkpoint else []
    if not plan:
        job = heartbeat(job, stage="understanding", progress=18, message="理解教学目标与学生要完成的操作")
        result, usage = _turn(root, secret, model, body)
        if result.get("questions"):
            return {"answer": "我需要确认一个会影响成品的选择。", "executionMode": "ask",
                    "questions": result["questions"]}, usage
        plan = result.get("plan")
        if not plan:
            raise PermanentJobError("未能形成可执行的教学设计，请补充细节后重试。")
    stage = "deck-page" if body["kind"] == "deck" else "simulation"
    total = len(plan["pages"]) if stage == "deck-page" else 1
    while len(parts) < total:
        offset = len(parts)
        calls = [{**body, "phase": stage, "plan": plan, **({"page": i} if stage == "deck-page" else {})}
                 for i in range(offset, min(offset + 3, total))]
        job = heartbeat(job, stage="authoring", progress=32 + 48 * offset // total,
                        message=f"正在制作课件（{offset}/{total} 页已完成）" if stage == "deck-page" else "正在实现可操作的模拟和课堂检测")
        with ThreadPoolExecutor(max_workers=3) as pool:
            responses = list(pool.map(lambda request: _turn(root, secret, model, request), calls))
        for submission, counters in responses:
            parts.append(submission["page" if stage == "deck-page" else "simulation"])
            for key, count in counters.items():
                if type(count) is int:
                    usage[key] = usage.get(key, 0) + count
        job = heartbeat(job, stage="authoring", progress=32 + 48 * len(parts) // total,
                        message=f"已完成 {len(parts)}/{total} 项内容")
        job.result = {**(job.result or {}), "_workshop": {"input": body, "plan": plan, "parts": parts, "usage": usage}}
        from CTFd.models import db
        db.session.commit()
    job = heartbeat(job, stage="validating", progress=88, message="校验播放结构、内容与成品版本")
    artifact_type = "slide-deck" if stage == "deck-page" else "simulation"
    if stage == "deck-page":
        slides = [_slide(page, plan, index) for index, page in enumerate(parts)]
        artifacts = ordinary_courseware._compile_slides(root, secret, slides)
        title = plan["title"]
    else:
        artifacts = [_simulation_artifact(parts[0])]
        title = parts[0]["title"]
    return {"answer": "成品已生成，可以打开预览和继续修改。", "executionMode": "execute",
            "workshopArtifact": {"type": artifact_type, "title": title, "objective": plan["objective"],
                                 "artifacts": artifacts, "design": plan, "kind": body["kind"]}}, usage


SIMULATION_TEMPLATE = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<style>
*{box-sizing:border-box}body{margin:0;background:#edf2f8;color:#17243a;font:16px/1.58 system-ui,sans-serif}
main{max-width:980px;margin:auto;padding:24px}h1,h2,p{margin:0}h1{font-size:27px;line-height:1.22}h2{font-size:17px}
header p,.muted{color:#53657b}header p{margin-top:6px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:17px 0}
section{border:1px solid #ced9e6;background:white;padding:16px;border-radius:12px;min-width:0}
.readout{color:#214d9a;font-size:25px;font-weight:690}.bar{height:12px;margin:11px 0;background:#e5edf8;border-radius:6px;overflow:hidden}
#meter{height:100%;background:#2b64bf;width:0;transition:width .22s ease}input{width:100%;accent-color:#285dac}
.visual{margin:8px 0;background:#f4f7fc;border:1px solid #dbe5f2;border-radius:12px;width:100%;height:145px}
.visual line{stroke:#a7bad2;stroke-width:2}.visual path{stroke:#2b64bf;stroke-width:3;fill:none}
.visual circle{fill:#2b64bf}#pendulum line{stroke:#315882;stroke-width:3}
button{font:inherit;padding:6px 10px;background:#fff;border:1px solid #9db0c6;color:#193a63;border-radius:6px;cursor:pointer}
button:hover,button[aria-pressed=true]{background:#eaf2ff}button:focus-visible,input:focus-visible{outline:2px solid #2458a6;outline-offset:2px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}.row output{margin-left:auto}
#effects,#feedback,#comparison{margin-top:8px}.check h2{margin-bottom:3px}footer{margin-top:12px;font-size:13px;color:#53657b}
@media(max-width:620px){main{padding:14px}.grid{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style></head><body><main>
<header><h1 id="title"></h1><p id="objective"></p></header><div class="grid">
<section><h2><label for="setting" id="parameter"></label></h2><output class="readout" id="param-value" for="setting"></output>
<input id="setting" type="range" min="0" step="1" value="0">
<div class="row"><button type="button" id="previous">上一步</button><button type="button" id="next">下一步</button>
<button type="button" id="reset">重置</button><output id="position" for="setting"></output></div>
<p class="muted" id="observation"></p><div class="row"><button type="button" id="remember" aria-pressed="false">标记为基准</button></div></section>
<section><h2 id="measure"></h2><p class="readout" id="measurement"></p><div class="bar" aria-hidden="true"><div id="meter"></div></div>
<svg class="visual" id="chart" viewBox="0 0 320 160" role="img" aria-label="输入与观测量变化图">
<line x1="24" y1="133" x2="296" y2="133"></line><line x1="24" y1="133" x2="24" y2="16"></line>
<path id="trace"></path><circle id="point" r="6"></circle></svg>
<svg class="visual" id="pendulum" viewBox="0 0 320 160" role="img" aria-label="单摆运动示意" style="display:none">
<line x1="111" y1="17" x2="209" y2="17"></line><g id="swing"><line id="cord" x1="160" y1="19" x2="160" y2="104"></line>
<circle id="bob" cx="160" cy="104" r="10"></circle></g><circle cx="160" cy="19" r="4"></circle></svg>
<button type="button" id="motion" style="display:none" aria-pressed="false">播放摆动</button>
<h2 id="state-title"></h2><p id="effects"></p><p class="muted" id="comparison" aria-live="polite"></p></section></div>
<section class="check"><h2>检验你的判断</h2><p id="question"></p><div class="row" id="choices"></div><p id="feedback" role="status"></p></section>
<footer id="note"></footer></main>
<script type="application/json" id="teaching-data">__TEACHING_DATA__</script>
<script>
const get = id => document.getElementById(id);
const set = (id, value) => { get(id).textContent = value; };
const data = JSON.parse(get('teaching-data').textContent);
const slider = get('setting');
const last = data.states.length - 1;
const peak = Math.max(1, ...data.states.map(state => state.measurement));
let baseline;
let motionStart;
let animation;
slider.max = last;
const fmt = value => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format(value);
const physics = data.visualization === 'pendulum';
const x = i => 24 + 272 * (data.states[i].setting - data.states[0].setting) /
  (data.states[last].setting - data.states[0].setting);
const y = i => 133 - 105 * data.states[i].measurement / peak;
const attr = (id, name, value) => get(id).setAttribute(name, value);
attr('trace', 'd', data.states.map((_, i) => (i ? 'L' : 'M') + x(i) + ' ' + y(i)).join(' '));
function pause() {
  if (animation !== undefined) cancelAnimationFrame(animation);
  animation = undefined;
  motionStart = undefined;
  attr('motion', 'aria-pressed', 'false');
  attr('swing', 'transform', 'rotate(15 160 19)');
  set('motion', '播放摆动');
}
function frame(time) {
  motionStart ??= time;
  const period = Math.max(0.2, data.states[Number(slider.value)].measurement);
  const angle = 15 * Math.cos((time - motionStart) / (1000 * period) * 2 * Math.PI);
  attr('swing', 'transform', 'rotate(' + angle + ' 160 19)');
  animation = requestAnimationFrame(frame);
}
if (physics) {
  get('chart').style.display = 'none';
  get('pendulum').style.display = '';
  get('motion').style.display = '';
  get('motion').addEventListener('click', () => {
    if (animation !== undefined) return pause();
    attr('motion', 'aria-pressed', 'true');
    set('motion', '停止摆动');
    animation = requestAnimationFrame(frame);
  });
}
function update(index) {
  index = Math.max(0, Math.min(last, index));
  slider.value = index;
  const item = data.states[index];
  slider.setAttribute('aria-valuetext', fmt(item.setting) + data.unit);
  set('param-value', fmt(item.setting) + ' ' + data.unit);
  set('measurement', fmt(item.measurement) + ' ' + data.measureUnit);
  set('observation', item.observation);
  set('state-title', item.title);
  set('effects', item.explanation);
  set('position', (index + 1) + '/' + (last + 1));
  set('comparison', baseline == null ? '' : '与基准的变化 ' + fmt(item.measurement - baseline) + ' ' + data.measureUnit);
  get('meter').style.width = (100 * item.measurement / peak) + '%';
  attr('point', 'cx', x(index));
  attr('point', 'cy', y(index));
  const cord = 44 + 66 * item.setting / data.states[last].setting;
  if (physics) {
    attr('cord', 'y2', 19 + cord);
    attr('bob', 'cy', 19 + cord);
    motionStart = undefined;
  }
  get('previous').disabled = index === 0;
  get('next').disabled = index === last;
}
set('title', data.title);
set('objective', data.objective);
set('parameter', data.parameter);
set('measure', data.measure);
set('question', data.question);
set('note', data.modelNote);
slider.addEventListener('input', () => update(Number(slider.value)));
get('previous').addEventListener('click', () => update(Number(slider.value) - 1));
get('next').addEventListener('click', () => update(Number(slider.value) + 1));
get('reset').addEventListener('click', () => {
  if (physics) pause();
  baseline = undefined;
  get('remember').setAttribute('aria-pressed', 'false');
  document.querySelectorAll('#choices button').forEach(button => button.setAttribute('aria-pressed', 'false'));
  set('feedback', '');
  update(0);
});
get('remember').addEventListener('click', () => {
  baseline = data.states[Number(slider.value)].measurement;
  get('remember').setAttribute('aria-pressed', 'true');
  update(Number(slider.value));
});
data.choices.forEach((label, index) => {
  const option = document.createElement('button');
  option.type = 'button';
  option.textContent = label;
  option.setAttribute('aria-pressed', 'false');
  option.addEventListener('click', () => {
    document.querySelectorAll('#choices button').forEach(button => button.setAttribute('aria-pressed', String(option === button)));
    set('feedback', (index === data.correct ? '判断正确。' : '请结合不同输入下的观测再判断。') + data.feedback);
  });
  get('choices').append(option);
});
if (physics) pause();
update(0);
</script></body></html>"""
