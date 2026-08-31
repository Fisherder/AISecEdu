#!/usr/bin/env python3

import argparse
import importlib.util
import json
import pathlib
import re
import sys


ROOT = pathlib.Path(__file__).resolve().parents[1]
FLOW_PATH = ROOT / "ops" / "verify-teacher-agent-flow.py"


def load_flow_module():
    spec = importlib.util.spec_from_file_location("verify_teacher_agent_flow", FLOW_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load teacher-agent verifier")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def visible_text(page):
    content = page.get("content") or {}
    parts = [str(page.get("title") or "")]
    for element in content.get("elements") or []:
        if isinstance(element.get("content"), str):
            parts.append(re.sub(r"<[^>]+>", " ", element["content"]))
        for line in element.get("lines") or []:
            parts.append(str(line.get("content") or ""))
    return re.sub(r"\s+", " ", " ".join(parts)).strip()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def inspect_plan(candidate, minimum_pages, maximum_pages):
    content = candidate.get("content") or {}
    outline = content.get("outline") or []
    require(
        minimum_pages <= len(outline) <= maximum_pages,
        f"candidate plan has {len(outline)} pages, expected {minimum_pages}-{maximum_pages}",
    )
    require(all(isinstance(page, dict) for page in outline), "candidate pages are not detailed objects")
    titles = [str(page.get("title") or "").strip() for page in outline]
    layouts = {str(page.get("layout") or "").strip().lower() for page in outline}
    notes = [
        page
        for page in outline
        if len(re.sub(r"\s+", "", str(page.get("speakerNotes") or ""))) >= 60
    ]
    require(all(titles), "candidate plan contains an untitled page")
    require(len(set(titles)) == len(titles), "candidate plan contains duplicate titles")
    require(len(layouts - {""}) >= 4, "candidate plan uses fewer than four layouts")
    require(
        len(notes) == len(outline),
        "candidate plan must provide a complete speaker script for every page",
    )
    return {
        "plannedPages": len(outline),
        "plannedLayouts": sorted(layouts - {""}),
        "plannedSpeakerNotePages": len(notes),
    }


def inspect_artifact(artifact, minimum_pages, maximum_pages):
    revision = artifact.get("revision") or {}
    content = revision.get("content") or {}
    lesson = content.get("lesson") or {}
    pages = lesson.get("artifacts") or []
    require(
        minimum_pages <= len(pages) <= maximum_pages,
        f"materialized deck has {len(pages)} pages, expected {minimum_pages}-{maximum_pages}",
    )
    require(all(page.get("type") == "slide" for page in pages), "deck contains a non-slide page")
    titles = [str(page.get("title") or "").strip() for page in pages]
    layouts = [str((page.get("content") or {}).get("layout") or "").strip() for page in pages]
    notes = [
        page
        for page in pages
        if len(
            re.sub(
                r"\s+",
                "",
                str(
                    (page.get("content") or {}).get("speakerNotes")
                    or (page.get("content") or {}).get("remark")
                    or ""
                ),
            )
        )
        >= 60
    ]
    substantive = [
        page
        for page in pages
        if len((page.get("content") or {}).get("elements") or []) >= 5
        and len(re.sub(r"\s+", "", visible_text(page))) >= 55
    ]
    character_counts = [len(re.sub(r"\s+", "", visible_text(page))) for page in pages]
    layout_set = set(layouts) - {""}
    require(len(set(titles)) == len(titles), "materialized deck contains duplicate titles")
    require(len(layout_set) >= 4, "materialized deck uses fewer than four layouts")
    require(
        len(notes) == len(pages),
        "materialized deck must provide a complete speaker script for every page",
    )
    require(
        len(substantive) >= (len(pages) * 9 + 9) // 10,
        "materialized deck has sparse pages",
    )
    require(sum(character_counts) / len(character_counts) >= 70, "materialized deck is too sparse")
    require("case" in layout_set, "materialized deck has no worked case")
    require(sum(layout in {"activity", "checkpoint"} for layout in layouts) >= 2, "materialized deck has fewer than two learner checks")
    require("summary" in layout_set, "materialized deck has no closing summary")
    return {
        "artifactId": artifact.get("id"),
        "pages": len(pages),
        "layouts": sorted(layout_set),
        "speakerNotePages": len(notes),
        "substantivePages": len(substantive),
        "averageVisibleCharacters": round(sum(character_counts) / len(character_counts), 1),
        "titles": titles,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages", type=int)
    args = parser.parse_args()
    require(args.pages is None or args.pages > 0, "--pages must be a positive integer")
    minimum_pages = args.pages if args.pages is not None else 12
    maximum_pages = args.pages if args.pages is not None else 15
    flow = load_flow_module()
    verifier = flow.TeacherAgentVerifier(job_timeout=900, authoring_timeout=1200)
    try:
        verifier.setup()
        context = verifier.api(verifier.teacher, "GET", "teaching/context")
        course = next(iter(context.get("teacherDojos") or []), None)
        require(course is not None, "teacher has no course for slide verification")
        module = next(iter(course.get("modules") or []), None)
        require(module is not None, "course has no chapter for slide verification")
        verifier.api(
            verifier.teacher,
            "PATCH",
            f"teaching/threads/{verifier.thread_id}",
            json_body={"dojoId": course["id"], "moduleIndex": module["index"]},
        )
        page_instruction = f"恰好{args.pages}页、" if args.pages is not None else ""
        prompt = (
            f"请正式生成一份{page_instruction}可直接授课的SQL注入防御页面式课件。"
            "面向具备基础Web开发知识的学生，使用一个授权隔离案例贯穿输入证据、"
            "漏洞成因、参数化查询修复和回归验证；至少包含四种页面结构、两次理解检查、"
            "一次迁移任务、完整教师讲稿和结尾总结，不能有目录占位页、空白页或重复标题。"
        )
        initial = verifier.api(
            verifier.teacher,
            "POST",
            f"teaching/threads/{verifier.thread_id}/messages",
            json_body={
                "content": prompt,
                "artifactType": "auto",
                "action": "chat",
            },
            statuses=(202,),
            timeout=180,
        )
        initial_job = verifier.wait_job(initial["job"]["id"])
        thread = verifier.api(
            verifier.teacher,
            "GET",
            f"teaching/threads/{verifier.thread_id}",
        )["thread"]
        source_message = next(
            (
                message
                for message in reversed(thread.get("messages") or [])
                if (message.get("metadata") or {}).get("generationOptions")
                and (message.get("metadata") or {}).get("jobId") == initial_job["id"]
            ),
            None,
        )
        require(source_message is not None, "agent did not return three generation options")
        bundle = (source_message.get("metadata") or {}).get("generationOptions") or {}
        options = bundle.get("options") or []
        require(len(options) == 3, "agent did not return exactly three generation options")
        option = options[1]
        selected = verifier.api(
            verifier.teacher,
            "POST",
            (
                f"teaching/threads/{verifier.thread_id}/messages/{source_message['id']}/"
                f"generation-options/{option['id']}/select"
            ),
            json_body={},
        )
        proposal = selected.get("proposal") or {}
        arguments = proposal.get("arguments") or {}
        submitted = verifier.api(
            verifier.teacher,
            "POST",
            f"teaching/threads/{verifier.thread_id}/messages",
            json_body={
                "content": str(arguments.get("prompt") or option.get("rewrittenPrompt") or prompt),
                "artifactType": str(arguments.get("artifactType") or "slide-deck"),
                "candidateMode": "single",
                "candidateCount": 1,
                "sourceRefs": arguments.get("sourceRefs") or [],
                "agentContinuation": True,
                "action": "generate",
                "generationSelection": {
                    "sourceMessageId": source_message["id"],
                    "optionId": option["id"],
                },
            },
            statuses=(202,),
            timeout=180,
        )
        verifier.wait_job(submitted["job"]["id"])
        candidate_set = verifier.api(
            verifier.teacher,
            "GET",
            f"teaching/candidate-sets/{submitted['candidateSetId']}",
        )["candidateSet"]
        candidates = candidate_set.get("candidates") or []
        require(len(candidates) == 1, "formal generation did not return exactly one candidate")
        plan_quality = inspect_plan(candidates[0], minimum_pages, maximum_pages)
        materialization = verifier.api(
            verifier.teacher,
            "POST",
            f"teaching/candidates/{candidates[0]['id']}/materialize",
            json_body={},
            statuses=(202,),
            timeout=180,
        )
        verifier.wait_job(materialization["job"]["id"])
        artifact = verifier.api(
            verifier.teacher,
            "GET",
            f"teaching/artifacts/{materialization['artifact']['id']}",
        )["artifact"]
        require(artifact.get("status") in {"READY", "READY_TO_PUBLISH"}, "artifact is not ready")
        artifact_quality = inspect_artifact(artifact, minimum_pages, maximum_pages)
        print(json.dumps({**plan_quality, **artifact_quality}, ensure_ascii=False, indent=2))
        print(
            f"PASS  real slide deck meets the {minimum_pages}-{maximum_pages} page quality contract",
            flush=True,
        )
        return 0
    finally:
        verifier.cleanup()


if __name__ == "__main__":
    raise SystemExit(main())
