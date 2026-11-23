"""Bridge the official Harness courseware tools to versioned platform slides."""

import re

import requests

from .. import config
from . import ordinary_project_queue, teacher_dsh_chat
from .artifacts import content_hash
from .scope import build_scope

CONTRACT = "teaching-courseware-v1"
PIN = "ordinaryCourseware"
ROUTES = {"plan": "teacher-dsh-courseware-plan", "author": "teacher-dsh-courseware-author"}
UNSAFE = re.compile(
    r"[<>\x00-\x1f\x7f\x60]|(?:https?|data|javascript|file):|漏洞利用|漏洞复现|缓冲区溢出|"
    r"返回地址|内存地址|构造载荷|绕过保护|偏移计算|提权|攻击步骤|\b(?:ctf|exploit|shellcode|rop|payload)\b",
    re.I,
)
STACK_EXAMPLE = re.compile(r"调用栈耗尽|栈溢出|stack overflow|递归过深", re.I)
DEMONSTRATION = re.compile(r"动态仿真|动态演示|动态模拟|交互动画|交互演示|互动演示|模拟演示|分步演示|交互课件|仿真")
STACK_ACTION = re.compile(r"利用|攻击|篡改|写入|控制流|执行代码|载荷|字节数|偏移")
THEME = {
    "name": "玄甲课堂", "background": "#ffffff", "foreground": "#17233b",
    "muted": "#556479", "accent": "#3156ca", "secondary": "#17765e", "surface": "#edf2fa",
}


class CoursewareConflict(ValueError):
    pass


def brief(value):
    value = " ".join(teacher_dsh_chat.validate_prompt(value).split())
    if UNSAFE.search(value) or (STACK_EXAMPLE.search(value) and STACK_ACTION.search(value)):
        raise ValueError("请提交概念讲解或课堂示意的课件要求。")
    if STACK_EXAMPLE.search(value):
        return "stack-capacity", STACK_EXAMPLE.sub("递归过深时的调用栈容量耗尽", value)
    return ("demo" if DEMONSTRATION.search(value) else "slides"), value


def is_courseware(job):
    return (job.payload or {}).get(ordinary_project_queue.PIN) == "slide-deck"


def _scope(job):
    from CTFd.models import Users
    from ..models import TeachingAgentThreads, TeachingCandidateSets

    if not ordinary_project_queue.enabled(job.dojo_id):
        raise ValueError("课程的课件生成权限已变化。")
    scope = {"owner_id": job.owner_id, "dojo_id": job.dojo_id, "module_index": job.module_index}
    teacher = Users.query.filter_by(id=job.owner_id, banned=False).first()
    if teacher is None or not TeachingAgentThreads.query.filter_by(
        id=job.thread_id, user_id=teacher.id, dojo_id=job.dojo_id, module_index=job.module_index, status="ACTIVE",
    ).first():
        raise ValueError("原课件创作会话已变化。")
    build_scope(teacher, role="teacher", dojo_id=job.dojo_id, module_index=job.module_index)
    selected = TeachingCandidateSets.query.filter_by(
        id=job.payload.get("candidateSetId"), thread_id=job.thread_id, self_workspace_id=None,
        kind="slide-deck", **scope,
    ).first()
    if selected is None or (selected.request_json or {}).get("generationReason") != ordinary_project_queue.COURSEWARE_REASON:
        raise ValueError("课件方案不再属于当前会话。")
    ordinary_project_queue.require_inputs(job.payload)
    if selected.source_refs:
        raise ValueError("当前课件只使用本轮教学要求。")
    return scope, selected


def selection_pin(job, selected, scope):
    from ..models import ModelInvocations, TeachingArtifactCandidates, TeachingArtifacts, TeachingJobs

    artifact = TeachingArtifacts.query.filter_by(
        id=job.payload.get("artifactId"), artifact_type="slide-deck", self_workspace_id=None, **scope,
    ).first()
    candidate = TeachingArtifactCandidates.query.filter_by(
        id=artifact.candidate_id if artifact else None, candidate_set_id=selected.id,
    ).first()
    generations = TeachingJobs.query.filter_by(
        thread_id=job.thread_id, kind="candidate.generate", status="SUCCEEDED", **scope,
    ).filter(
        TeachingJobs.payload["candidateSetId"].as_string() == selected.id,
        TeachingJobs.payload[ordinary_project_queue.PIN].as_string() == "slide-deck",
    ).join(ModelInvocations, ModelInvocations.job_id == TeachingJobs.id).filter(
        ModelInvocations.route == ROUTES["plan"], ModelInvocations.status == "SUCCEEDED",
        ModelInvocations.degraded.is_(False),
    )
    pinned_source = (job.payload.get(PIN) or {}).get("generationJobId")
    if pinned_source:
        generations = generations.filter(TeachingJobs.id == pinned_source)
    prior = generations.order_by(TeachingJobs.created.desc()).first()
    if (artifact is None or artifact.current_revision != job.payload.get("expectedRevision")
            or candidate is None or candidate.materialized_artifact_id != artifact.id or prior is None
            or (candidate.content or {}).get("experience", {}).get("mode") != CONTRACT):
        raise CoursewareConflict("课件的已选方案或基线版本已变化，请重新打开方案。")
    return {"candidateId": candidate.id, "generationJobId": prior.id,
            "digest": content_hash(candidate.content)}, candidate


def admit(job, payload):
    """Only confirmed project selection can add a courseware materialization pin."""
    clean = {key: value for key, value in payload.items() if key != PIN}
    if (job.kind != "artifact.materialize" or clean.get("artifactType") != "slide-deck"
            or not ordinary_project_queue.enabled(job.dojo_id)):
        return clean
    from ..models import TeachingCandidateSets

    candidate_set = TeachingCandidateSets.query.filter_by(id=clean.get("candidateSetId")).first()
    if candidate_set is None or (candidate_set.request_json or {}).get("generationReason") != ordinary_project_queue.COURSEWARE_REASON:
        return clean
    scope, selected = _scope(job)
    pin, _ = selection_pin(job, selected, scope)
    return {**clean, PIN: pin}


def prepare(job):
    scope, selected = _scope(job)
    style, message = brief(selected.request_json.get("prompt"))
    phase = "plan" if job.kind == "candidate.generate" else "author"
    source = {"phase": phase, "style": style, "brief": message}
    if phase == "author":
        pin, candidate = selection_pin(job, selected, scope)
        if pin != job.payload.get(PIN):
            raise ValueError("课件方案已变化，请重新选择。")
        source["selection"] = candidate.content["experience"]["selection"]
    elif (job.payload.get("prompt") != selected.request_json.get("prompt")
          or job.payload.get("candidateCount") != 2):
        raise ValueError("课件要求已变化，请重新提交。")
    model = config.HARNESS_DEEPSEEK_MODEL
    return source, {"route": ROUTES[phase], "provider": "deepseek", "actual_model": model,
                    "required_model": model, "request_hash": content_hash(source), "degraded": False}


def _plan(option):
    return {
        "title": option["title"], "strategy": option["strategy"], "summary": option["goal"],
        "differences": [option["strategy"]],
        "content": {
            "type": "slide-deck", "objectives": [option["goal"]],
            "outline": [{"title": title, "description": option["strategy"], "keyPoints": [title]}
                        for title in option["topics"]],
            "activities": [{"title": "逐步讲解", "instruction": option["strategy"]}],
            "assessment": {"criteria": [option["goal"]]},
            "experience": {"mode": CONTRACT, "selection": option},
        },
    }


def _object(key, kind, left, top, width, height, fill, **extra):
    return {"id": key, "kind": kind, "label": key, "fill": fill,
            "box": {"left": left, "top": top, "width": width, "height": height}, **extra}


def _sequence(steps, animated):
    count = len(steps)
    width = (896 - (count - 1) * 16) // count
    objects, beats = [], []
    for i, step in enumerate(steps):
        left = i * (width + 16)
        prefix = f"step-{i + 1}"
        keys = [f"{prefix}-{part}" for part in ("card", "number", "title", "explanation")]
        shown = not animated
        objects.extend([
            _object(keys[0], "rect", left, 42, width, 236, "surface", visible=shown, stroke="accent"),
            _object(keys[1], "text", left + 16, 59, width - 32, 35, "accent", text=str(i + 1),
                    fontSize=24, weight="bold", visible=shown),
            _object(keys[2], "text", left + 16, 107, width - 32, 45, "foreground", text=step["label"],
                    fontSize=23, weight="bold", visible=shown),
            _object(keys[3], "text", left + 16, 153, width - 32, 96, "muted", text=step["detail"],
                    fontSize=19, visible=shown),
        ])
        if animated:
            beats.append({"id": prefix, "title": step["label"], "explanation": step["detail"],
                          "objectStates": [{"id": key, "visible": True} for key in keys]})
    return objects, beats


def _stack_sequence():
    """Illustrate abstract stack capacity using a fixed, fictional set of slots."""
    objects = [_object("stack-limit", "text", 65, 25, 360, 34, "muted", text="抽象调用栈 · 容量 3", fontSize=23)]
    for i in range(3):
        objects.append(_object(f"slot-{i+1}", "rect", 70, 225 - 59*i, 320, 48, "surface", stroke="accent"))
    objects.append(_object("status", "text", 463, 110, 354, 130, "foreground",
                           text="点击下一步，观察名额变化。", fontSize=30))
    phases = [
        (1, "进入一次调用", "先占用一个调用名额。"),
        (2, "继续递归调用", "新的调用继续占用空余名额。"),
        (3, "达到容量上限", "名额已被占满，下一层调用无法进入。"),
        (0, "逐层返回释放", "调用返回时释放名额，最终恢复为空。"),
    ]
    return objects, [
        {"id": f"capacity-{i+1}", "title": label, "explanation": detail,
         "objectStates": [{"id": f"slot-{j+1}", "fill": "accent" if j < count else "surface"}
                          for j in range(3)] + [{"id": "status", "text": detail}]}
        for i, (count, label, detail) in enumerate(phases)
    ]


def _slide(page, index, style, goal):
    page_id = f"page-{index+1}"
    if style == "slides":
        visual = {
            "kind": "comparison", "columns": ["要点", "说明"],
            "rows": [{"label": f"步骤 {number}", "values": [step["label"], step["detail"]]}
                     for number, step in enumerate(page["steps"], 1)],
        }
        beats = []
    else:
        shapes, beats = _stack_sequence() if index == 0 and style == "stack-capacity" else _sequence(page["steps"], True)
        visual = {"kind": "scene", "description": "用分步卡片和图形呈现操作顺序与概念关系。", "objects": shapes}
    studio = {
        "theme": THEME, "assets": [],
        "page": {
            "schema": "courseware-page-v2", "id": page_id, "title": page["title"],
            "objective": goal, "takeaway": page["takeaway"], "role": "explanation",
            "composition": "wide", "speakerNotes": page["notes"], "durationSeconds": 90,
            "visual": visual,
            "beats": beats, "layout": {
                "title": {"box": {"left": 52, "top": 30, "width": 896, "height": 60}, "fontSize": 42},
                "takeaway": {"box": {"left": 52, "top": 101, "width": 896, "height": 55}, "fontSize": 24},
                "supporting": [], "visual": {"left": 52, "top": 168, "width": 896, "height": 330},
            },
        },
    }
    return {"id": page_id, "type": "slide", "title": page["title"], "order": index,
            "outline": {"id": page_id, "type": "slide", "title": page["title"], "order": index},
            "content": {"studio": studio}}


def _compile_slides(root, secret, slides):
    from .jobs import PermanentJobError, RuntimeJobError

    try:
        with requests.Session() as client:
            client.trust_env = False
            response = client.post(
                root + "/v1/courseware-compile",
                json={"pages": [slide["content"]["studio"] for slide in slides]},
                headers={"Authorization": f"Bearer {secret}"}, allow_redirects=False, timeout=(5, 12),
            )
            if response.status_code == 422:
                raise PermanentJobError("生成的课件未通过原生画布校验，请重新生成。")
            response.raise_for_status()
            compiled = response.json().get("slides")
    except requests.RequestException:
        raise RuntimeJobError("原生课件编译服务暂不可用。", category="service") from None
    if (not isinstance(compiled, list) or len(compiled) != len(slides)
            or any(not isinstance(page.get("elements"), list) or not page["elements"] for page in compiled)):
        raise PermanentJobError("课件编译未返回完整的可编辑画布。")
    return [{**slide, "content": content} for slide, content in zip(slides, compiled, strict=True)]


def invoke(job, body, route):
    from .jobs import PermanentJobError, RuntimeJobError

    root, secret, model = teacher_dsh_chat._connection()
    if not model or route["required_model"] != model:
        raise PermanentJobError("课件模型配置已变化，请重新提交。")
    try:
        with requests.Session() as client:
            client.trust_env = False
            reply = client.post(
                root + "/v1/courseware-turn", json=body, headers={"Authorization": f"Bearer {secret}"},
                allow_redirects=False, timeout=(5, 154),
            )
            if reply.status_code == 400:
                raise PermanentJobError("课件要求未通过结构化生成服务的校验。")
            if reply.status_code != 200:
                raise RuntimeJobError("课件生成服务暂未返回合格的方案，请重试。", category="service")
            receipt = reply.json()
    except (requests.RequestException, ValueError) as error:
        if isinstance(error, (PermanentJobError, RuntimeJobError)):
            raise
        raise RuntimeJobError("未收到课件生成服务的有效回执。", category="service") from None
    usage = receipt.get("usage") or {}
    if (receipt.get("model") != model
            or any(type(usage.get(name)) is not int or usage[name] <= 0 for name in
                   ("prompt_tokens", "completion_tokens", "total_tokens"))
            or usage["total_tokens"] != usage["prompt_tokens"] + usage["completion_tokens"]):
        raise PermanentJobError("课件生成缺少模型回执。")
    returned = receipt.get("submission")
    if not isinstance(returned, dict):
        raise PermanentJobError("课件生成未提交结构化内容。")
    result = {}
    if body["phase"] == "plan":
        result["candidates"] = [_plan(option) for option in returned["options"]]
    else:
        selection = body["selection"]
        slides = [_slide(page, index, body["style"], selection["goal"]) for index, page in enumerate(returned["pages"])]
        slides = _compile_slides(root, secret, slides)
        result = {"content": {
            "schema": "aisecedu.global-agent.artifact.v1", "artifactType": "slide-deck",
            "renderer": "agent-runtime-stage", PIN: CONTRACT,
            "lesson": {"id": job.payload["artifactId"], "title": selection["title"],
                       "description": selection["goal"], "artifacts": slides},
        }, "validation": {"status": "GENERATED", "artifactCount": len(slides), "renderer": "agent-runtime-stage"}}
    return {"success": True, "result": result,
            "model": {"provider": "deepseek", "actualModel": model, "modelVersion": f"deepseek:{model}", "usage": usage}}
