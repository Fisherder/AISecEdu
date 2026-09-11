#!/usr/bin/env python3
import argparse
import importlib.util
import json
from pathlib import Path
import sys
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--credentials", type=Path, required=True)
    parser.add_argument("--state-dir", type=Path, required=True)
    parser.add_argument("--kind", choices=("simulation", "slide-deck", "debate"), required=True)
    args = parser.parse_args()
    path = Path(__file__).with_name("verify-teacher-agent-flow.py")
    spec = importlib.util.spec_from_file_location("teacher_flow", path)
    flow = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = flow
    spec.loader.exec_module(flow)
    flow.BASE_URL = args.base_url.rstrip("/")
    credentials = json.loads(args.credentials.read_text())
    verifier = flow.TeacherAgentVerifier(job_timeout=1200, keep_data=True)
    verifier.teacher = flow.authenticate(credentials["username"], credentials["password"])
    args.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    state_file = args.state_dir / "generation.json"
    state = json.loads(state_file.read_text()) if state_file.exists() else {"runs": {}}

    def save():
        temporary = state_file.with_suffix(".new")
        temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2))
        temporary.replace(state_file)

    def api(method, path, body=None, statuses=(200,)):
        return verifier.api(verifier.teacher, method, "teaching/" + path, json_body=body, statuses=statuses)

    def wait(identifier):
        deadline = time.monotonic() + 1200
        previous = None
        while time.monotonic() < deadline:
            job = api("GET", "jobs/" + identifier)["job"]
            progress = (job.get("status"), job.get("stage"))
            if progress != previous:
                print(json.dumps({"kind": args.kind, "job": identifier, "status": progress[0], "stage": progress[1]}, ensure_ascii=False), flush=True)
                previous = progress
            if job["status"] in ("SUCCEEDED", "COMPLETED", "READY"):
                return job
            if job["status"] in ("FAILED", "CANCELED"):
                raise RuntimeError(f"Teaching job {identifier} ended as {job['status']}: {str(job.get('error') or '')[:400]}")
            time.sleep(4)
        raise TimeoutError(f"Teaching job {identifier} did not finish within 20 minutes")

    if not state.get("course"):
        course = api("POST", "courses", {"name": "AI 教学示范：工控与车联网", "slug": "ai-teaching-showcase", "access": "private", "description": "教学智能体、动态演示、图文课件与学生辩论的私有示范课程。案例使用浏览器内概念仿真。", "initialModuleName": "动态课堂与证据推理", "initialModuleId": "dynamic-classroom"}, (201,))["course"]
        state["course"] = course
        save()
    verifier.course = state["course"]
    record = state["runs"].setdefault(args.kind, {})
    if not record.get("thread"):
        record["thread"] = api("POST", "threads", {"dojoId": state["course"]["id"], "moduleIndex": 0, "title": {"simulation": "工控异常与证据链动态演示", "slide-deck": "工控与车联网图文课件", "debate": "异常处置学生辩论"}[args.kind]}, (201,))["thread"]["id"]
        save()
    verifier.thread_id = record["thread"]
    prompts = {
        "simulation": "为当前课程的当前章节生成一份可在平台预览、编辑并发布的工控异常动态演示。采用震网启发的概念案例，不能连接真实设备或给出载荷；以工程站、PLC、工业过程、监控反馈构成可视化控制链和反馈链。需要 6 个阶段、播放与重置、异常偏移数值调节、独立校验开关、同步读数与事件证据、校验开启和关闭两条分支、最终因果对照及教师提示。要求图文并茂、图形状态明显变化。这是教师演示，不是 CTF，不生成下载文件。",
        "slide-deck": "为当前课程的当前章节正式生成一份可在平台预览、编辑并发布的 12 页图文课件，主题为工控与车联网的控制、反馈和可信证据。使用浏览器概念案例，不连接真实设备。至少 4 种页面结构，控制链和反馈链的关系图、工控与车辆对照、异常演变图、两次理解检查、处置取舍讨论、迁移任务和总结。每一页有同步教师讲稿。图形应占明显面积，不能只有文字列表，不生成下载文件。",
        "debate": "为当前课程的当前章节生成一次可在平台预览、编辑并发布到课堂的 AI 学生辩论。命题为工控系统发现异常后应立即停机隔离还是先交叉验证。包含教师主持、安全负责人、运行负责人和学生参与，明确立场，三轮立论、质询、综合决策，用控制与反馈证据支持观点；提供按证据、因果、权衡、表达四项评价的量规。必须是 debate 互动产物，不是普通模拟、文本教案或下载文件。"
    }
    if not record.get("planningJob"):
        record["planningJob"] = api("POST", f"threads/{verifier.thread_id}/messages", {"content": prompts[args.kind], "artifactType": "auto", "action": "chat"}, (202,))["job"]["id"]
        save()
    plan = wait(record["planningJob"])
    if not record.get("proposal"):
        proposal = verifier.generation_proposal(plan, (plan.get("result") or {}).get("toolProposals") or [], "candidate.generate")
        if not proposal:
            raise RuntimeError("The model did not produce a native generation plan")
        assert proposal["arguments"]["artifactType"] == args.kind
        record["proposal"] = proposal
        save()
    if not record.get("generationJob"):
        proposal = record["proposal"]
        submitted = api("POST", f"threads/{verifier.thread_id}/messages", {"content": proposal["arguments"].get("prompt") or prompts[args.kind], "artifactType": args.kind, "candidateMode": "single", "candidateCount": 1, "generationSelection": proposal.get("generationSelection"), "agentContinuation": True, "action": "generate"}, (202,))
        record.update(generationJob=submitted["job"]["id"], candidateSet=submitted["candidateSetId"])
        save()
    job = wait(record["generationJob"])
    candidates = api("GET", "candidate-sets/" + record["candidateSet"])["candidateSet"]["candidates"]
    assert len(candidates) == 1
    artifact_id = candidates[0].get("materializedArtifactId")
    if not artifact_id:
        raise RuntimeError("Generation completed without a materialized preview")
    artifact = api("GET", "artifacts/" + artifact_id)["artifact"]
    assert artifact["status"] in ("READY", "READY_TO_PUBLISH", "PUBLISHED")
    content = artifact["revision"]["content"]
    assert content.get("lesson", {}).get("artifacts")
    (args.state_dir / (args.kind + "-artifact.json")).write_text(json.dumps(artifact, ensure_ascii=False, indent=2))
    record.update(artifactId=artifact_id, status=artifact["status"], pages=len(content["lesson"]["artifacts"]), model=job.get("modelRoute"), preview=f"{flow.BASE_URL}/teacher/artifacts/{artifact_id}")
    save()
    print(json.dumps({"kind": args.kind, "passed": True, "artifactId": artifact_id, "pages": record["pages"], "preview": record["preview"]}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
