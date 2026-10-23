import datetime
import re
import uuid
import time
import hashlib

import requests
from flask import request
from flask_restx import Namespace, Resource
from sqlalchemy.exc import IntegrityError
from CTFd.models import db
from CTFd.plugins import bypass_csrf_protection

from ... import config
from ...models.debate import DebateAttempts
from ...models import ModelInvocations, SelfLearningWorkspaces, DojoModules
from ...agent_runtime.artifacts import artifact_course_teacher, artifact_view
from ...agent_runtime.auth import AgentRuntimeAuthError
from ...agent_runtime.model_router import route_model
from ...agent_runtime.scope import ScopeError
from .teaching import _service_lesson_session, _lesson_artifact, _ok, _error, _body, _require_workspace_capacity

debate_namespace = Namespace("debates", description="学生与 AI 的结构化教学辩论")


def _access(artifact_id):
    user, scope, _ = _service_lesson_session()
    artifact = _lesson_artifact(artifact_id, user, scope, allow_published_view=True)
    if scope.module_index is not None and artifact.module_index != scope.module_index:
        raise ScopeError("辩论不属于当前章节")
    if scope.role == "student" and artifact.dojo_id is not None and artifact.module_index is not None:
        module = DojoModules.query.filter_by(dojo_id=artifact.dojo_id, module_index=artifact.module_index).first()
        if module is None or not module.visible():
            raise ScopeError("章节尚未开放")
    if artifact.artifact_type != "debate" or artifact.status in {"ARCHIVED", "DELETED", "GENERATING", "FAILED"}:
        raise ScopeError("辩论活动不存在或尚未就绪")
    content = (artifact_view(artifact).get("revision") or {}).get("content") or {}
    spec = next((item.get("content", {}).get("debate") for item in content.get("lesson", {}).get("artifacts", [])
                 if isinstance(item, dict) and isinstance(item.get("content"), dict) and item["content"].get("debate", {}).get("schema") in {"debate-v1", "debate-v2"}), None)
    if not spec or not 1 <= len(spec.get("rounds", [])) <= 24:
        raise ScopeError("请先将旧版辩论重新生成为可对练活动")
    teacher = scope.role == "teacher" and (artifact.owner_id == user.id or artifact_course_teacher(artifact, user))
    return user, artifact, spec, bool(teacher)


def _phase_index(spec, turns):
    rounds = spec["rounds"]
    if spec.get("schema") != "debate-v2":
        return min(len(turns), len(rounds))
    if not turns:
        return 0
    if len(turns) >= spec["rules"]["maxExchanges"]:
        return len(rounds)
    last = turns[-1]
    phase = min(last["round"], len(rounds) - 1)
    count = sum(turn["round"] == phase for turn in turns)
    advance = last.get("intent") == "advance" or (last.get("intent") != "follow-up" and count >= rounds[phase]["exchanges"])
    return phase + 1 if advance else phase


def _turn_controls(spec, body):
    if spec.get("schema") != "debate-v2":
        return {}
    intent = body.get("intent", "respond")
    if intent not in {"respond", "follow-up", "challenge", "evidence", "listen", "advance"}:
        raise ValueError("请选择有效的发言方式")
    if intent == "follow-up" and not spec["rules"].get("allowFollowUps", True):
        raise ValueError("本活动没有开放追加追问")
    target = body.get("targetSpeakerId") or None
    if target and target not in {role["id"] for role in spec["roles"]}:
        raise ValueError("指定的辩论角色不存在")
    evidence = body.get("evidenceIds", [])
    if not isinstance(evidence, list) or any(not isinstance(value, str) for value in evidence) or len(evidence) > 40:
        raise ValueError("引用的资料无效")
    if not set(evidence).issubset({item["id"] for item in spec["evidence"]}):
        raise ValueError("引用的资料不存在")
    controls = {"intent": intent, "evidenceIds": list(dict.fromkeys(evidence))}
    if target:
        controls["targetSpeakerId"] = target
    return controls


def _view(attempt, review=False):
    data = {"id": attempt.id, "revision": attempt.revision, "side": attempt.side,
            "preview": attempt.preview, "status": attempt.status, "spec": attempt.spec,
            "turns": [{key: value for key, value in turn.items() if key != "requestId"} for turn in attempt.turns],
            "reflection": attempt.reflection, "report": attempt.report,
            "phaseIndex": _phase_index(attempt.spec, attempt.turns),
            "pending": bool(attempt.pending and attempt.pending.get("expires", 0) > time.time()),
            "updated": attempt.updated.isoformat() + "Z"}
    if review:
        data["studentName"] = attempt.user.name if attempt.user else "已删除用户"
    return data


def _request_key(body):
    key = body.get("requestId")
    if not isinstance(key, str) or not re.fullmatch(r"[A-Za-z0-9_-]{8,64}", key):
        raise ValueError("请求标识无效，请刷新后重试")
    return key


@debate_namespace.route("/<string:artifact_id>")
class DebateActivity(Resource):
    @bypass_csrf_protection
    def get(self, artifact_id):
        try:
            user, artifact, spec, teacher = _access(artifact_id)
            query = DebateAttempts.query.filter_by(artifact_id=artifact.id)
            review = request.args.get("review") == "1"
            if review and not teacher:
                raise ScopeError("无权查看其他学生的辩论")
            query = query.filter_by(preview=False) if review else query.filter_by(user_id=user.id)
            rows = query.order_by(DebateAttempts.updated.desc()).limit(100).all()
            return _ok({"spec": spec, "revision": artifact.current_revision, "canReview": teacher,
                        "attempts": [_view(row, review) for row in rows]})
        except (AgentRuntimeAuthError, ScopeError):
            return _error("辩论活动不可访问，请重新打开活动", 404)

    @bypass_csrf_protection
    def post(self, artifact_id):
        attempt_id = None
        lease = None
        try:
            user, artifact, spec, teacher = _access(artifact_id)
            body = _body()
            key = _request_key(body)
            action = body.get("action")
            if action == "start":
                if body.get("side") not in ({"pro", "con", "neutral"} if spec.get("schema") == "debate-v2" else {"pro", "con"}):
                    raise ValueError("请选择参与立场")
                existing = DebateAttempts.query.filter_by(artifact_id=artifact.id, user_id=user.id, start_key=key).first()
                if existing:
                    if existing.side != body["side"]:
                        return _error("请求标识已经用于另一立场", 409)
                    return _ok({"attempt": _view(existing)})
                cutoff = datetime.datetime.utcnow() - datetime.timedelta(hours=1)
                if DebateAttempts.query.filter(DebateAttempts.user_id == user.id, DebateAttempts.created > cutoff).count() >= 20:
                    return _error("请先完成已有辩论，一小时内最多开始20次", 429)
                attempt = DebateAttempts(artifact_id=artifact.id, user_id=user.id, start_key=key,
                                        revision=artifact.current_revision, side=body["side"],
                                        preview=artifact.owner_id == user.id or artifact_course_teacher(artifact, user), spec=spec)
                db.session.add(attempt)
                try:
                    db.session.commit()
                except IntegrityError:
                    db.session.rollback()
                    attempt = DebateAttempts.query.filter_by(artifact_id=artifact.id, user_id=user.id, start_key=key).one()
                return _ok({"attempt": _view(attempt)}, 201)
            if action not in {"turn", "reflect"}:
                raise ValueError("辩论操作无效")
            message = body.get("message")
            if not isinstance(message, str) or not 1 <= len(message.strip()) <= 12000:
                raise ValueError("请填写1至12000字的发言")
            message = message.strip()
            attempt = DebateAttempts.query.filter_by(id=str(body.get("attemptId") or ""), artifact_id=artifact.id, user_id=user.id).with_for_update().first()
            if attempt is None:
                raise ScopeError("辩论记录不存在")
            attempt_id = attempt.id
            controls = _turn_controls(attempt.spec, body) if action == "turn" else {}
            receipt = next((turn for turn in attempt.turns if turn.get("requestId") == key), None)
            if receipt or attempt.completed_request == key:
                same = receipt.get("student") == message and action == "turn" if receipt else attempt.reflection == message and action == "reflect"
                if receipt and controls:
                    same = same and all(receipt.get(field) == value for field, value in controls.items()) and receipt.get("targetSpeakerId") == controls.get("targetSpeakerId")
                if not same:
                    return _error("同一请求标识不能更改发言或发言方式", 409)
                return _ok({"attempt": _view(attempt)})
            if body.get("expectedTurn") != len(attempt.turns):
                return _error("记录已在其他窗口更新，请刷新后继续", 409)
            required_status = "ACTIVE" if action == "turn" else "REFLECTING"
            early_finish = (action == "reflect" and body.get("earlyFinish") is True and
                            attempt.spec.get("schema") == "debate-v2" and bool(attempt.turns) and
                            attempt.spec["rules"].get("allowEarlyFinish", True) and attempt.status == "ACTIVE")
            if attempt.status != required_status and not early_finish:
                return _error("当前辩论阶段不能执行该操作", 409)
            now = time.time()
            pending = attempt.pending or {}
            if pending.get("expires", 0) > now:
                return _error("AI正在回应，请稍后刷新记录", 409)
            if pending.get("requestId") == key and (pending.get("message") != message or pending.get("action") != action or pending.get("controls", {}) != controls):
                return _error("重试时请保留原发言", 409)
            lease = uuid.uuid4().hex
            attempt.pending = {"requestId": key, "message": message, "action": action, "lease": lease, "controls": controls, "expires": now + 165}
            if artifact.self_workspace_id:
                workspace = SelfLearningWorkspaces.query.filter_by(id=artifact.self_workspace_id).first()
                if workspace:
                    _require_workspace_capacity(workspace, "modelTokens")
            model = route_model("debate")
            model_name = f"{model['provider']}:{model['actual_model']}"
            payload = {"spec": attempt.spec, "side": attempt.side, "action": action, "message": message,
                       "turns": [{k: v for k, v in turn.items() if k != "requestId"} for turn in attempt.turns]}
            if attempt.spec.get("schema") == "debate-v2":
                payload.update(controls)
                payload["earlyFinish"] = early_finish
            db.session.commit()
            response = requests.post(f"{config.AGENT_RUNTIME_INTERNAL_URL}/api/integration/debate/respond",
                                     headers={"X-AISecEdu-Service-Token": config.AGENT_RUNTIME_SERVICE_SECRET},
                                     json={"input": payload, "model": model_name, "requestIdentity": f"{attempt.id}:{key}"}, timeout=(5, 145))
            response.raise_for_status()
            result = response.json()
            if not result.get("success") or not isinstance(result.get("result"), dict):
                raise ValueError("AI响应格式不完整，请重试")
            attempt = DebateAttempts.query.filter_by(id=attempt_id, user_id=user.id).populate_existing().with_for_update().one()
            if (attempt.pending or {}).get("lease") != lease:
                return _error("这次回应已过期，请刷新记录后重试", 409)
            answer = result["result"]
            if action == "turn":
                if not all(k in answer for k in ("acknowledgement", "argument", "question", "evidenceIds", "coaching")):
                    raise ValueError("AI回应缺少必要内容，请重试")
                attempt.turns = [*attempt.turns, {"id": f"turn-{len(attempt.turns) + 1}", "round": _phase_index(attempt.spec, attempt.turns),
                                                "student": message, "reply": answer, "requestId": key, **controls}]
                if _phase_index(attempt.spec, attempt.turns) >= len(attempt.spec["rounds"]):
                    attempt.status = "REFLECTING"
            else:
                if not all(k in answer for k in ("summary", "criteria", "nextSteps")):
                    raise ValueError("AI评价缺少必要内容，请重试")
                attempt.reflection = message
                attempt.report = answer
                attempt.completed_request = key
                attempt.status = "COMPLETED"
            attempt.pending = None
            usage = result.get("usage") or {}
            db.session.add(ModelInvocations(owner_id=user.id, route="debate-dialogue",
                provider=model["provider"], actual_model=model["actual_model"], model_version=result.get("model"),
                parameters={"artifactId": artifact.id, "attemptId": attempt.id, "action": action,
                            "workspaceId": artifact.self_workspace_id},
                usage={k: max(0, int(usage.get(k) or 0)) for k in ("inputTokens", "outputTokens")},
                request_hash=hashlib.sha256(f"{attempt.id}:{key}".encode()).hexdigest(),
                status="SUCCEEDED", degraded=False))
            db.session.commit()
            return _ok({"attempt": _view(attempt)})
        except (AgentRuntimeAuthError, ScopeError):
            db.session.rollback()
            return _error("辩论记录不可访问", 404)
        except OverflowError:
            db.session.rollback()
            return _error("个人学习模型额度已用完", 429)
        except (ValueError, requests.RequestException) as exc:
            db.session.rollback()
            if attempt_id and lease:
                attempt = DebateAttempts.query.filter_by(id=attempt_id).with_for_update().first()
                if attempt and (attempt.pending or {}).get("lease") == lease:
                    attempt.pending = {**attempt.pending, "expires": 0}
                    db.session.commit()
            return _error("AI暂时未能回应，请重试。你的输入与已保存的记录不会丢失。" if isinstance(exc, requests.RequestException) else str(exc), 503 if lease else 400)
