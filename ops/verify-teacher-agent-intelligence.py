#!/usr/bin/env python3

import io
import importlib.util
import pathlib
import sys
import zipfile

REPO_DIR = pathlib.Path(__file__).resolve().parent.parent
UI_PATH = REPO_DIR / "ops" / "verify-teacher-agent-ui.py"
UI_SPEC = importlib.util.spec_from_file_location("verify_teacher_agent_ui", UI_PATH)
if UI_SPEC is None or UI_SPEC.loader is None:
    raise RuntimeError("unable to load teacher Agent UI verifier")
ui = importlib.util.module_from_spec(UI_SPEC)
sys.modules[UI_SPEC.name] = ui
UI_SPEC.loader.exec_module(ui)


def require_condition(condition, message):
    if not condition:
        raise RuntimeError(message)


def run():
    flow = ui.load_verifier_module()
    verifier = flow.TeacherAgentVerifier(job_timeout=900, authoring_timeout=1200)
    material_id = None
    driver = None
    try:
        verifier.setup()
        context = verifier.api(verifier.teacher, "GET", "teaching/context")
        course = next(
            (item for item in context.get("teacherDojos", []) if item.get("modules")),
            None,
        )
        require_condition(course is not None, "isolated teacher has no course with a chapter")
        module = course["modules"][0]
        verifier.api(
            verifier.teacher,
            "PATCH",
            f"teaching/threads/{verifier.thread_id}",
            json_body={"dojoId": course["id"], "moduleIndex": module["index"]},
        )

        pdf = ui.build_large_course_pdf()
        filename = f"2《软件安全》_缓冲区溢出基础-{verifier.suffix}.pdf"
        upload_response = verifier.teacher.post(
            flow.api_url("teaching/materials"),
            data={"dojoId": str(course["id"]), "threadId": verifier.thread_id},
            files={"file": (filename, pdf, "application/pdf")},
            timeout=180,
        )
        uploaded = flow.unwrap(upload_response, (202,))
        material_id = uploaded.get("materialId")
        material_job_id = (uploaded.get("job") or {}).get("id")
        require_condition(material_id and material_job_id, "material upload returned no durable IDs")
        verifier.wait_job(material_job_id, expected_model="deepseek-v4-flash")
        material = verifier.api(
            verifier.teacher,
            "GET",
            f"teaching/materials/{material_id}",
        )["material"]
        require_condition(material.get("status") == "READY", "uploaded PDF is not ready")
        require_condition((material.get("analysis") or {}).get("summary"), "uploaded PDF has no analysis")

        prompt = (
            f"请分析当前课程中课件“{filename}”的功能点、知识图谱和教学重点，"
            "并给出一份可直接下载的 Word 教案文件。教案包含 90 分钟流程、学习目标、"
            "重难点、课堂活动、以 Flag 为结果的 CTF 实践和评价设计。"
            "这是分析加文件交付，不要创建平台课件或候选卡片。"
        )
        submitted = verifier.api(
            verifier.teacher,
            "POST",
            f"teaching/threads/{verifier.thread_id}/messages",
            json_body={"content": prompt, "action": "chat", "artifactType": "auto"},
            statuses=(202,),
        )
        require_condition(submitted.get("candidateSetId") is None, "raw request was pre-routed to candidates")
        require_condition((submitted.get("job") or {}).get("kind") == "agent.chat", "raw request did not reach agent.chat")
        job = verifier.wait_job(submitted["job"]["id"], expected_model="deepseek-v4-pro")
        result = job.get("result") or {}
        files = result.get("files") or []
        require_condition(files, "agent returned no downloadable file")
        delivered = next((item for item in files if item.get("format") == "docx"), None)
        require_condition(delivered is not None, "agent did not deliver a DOCX file")
        require_condition(
            not any(item.get("tool") == "candidate.generate" for item in result.get("toolProposals") or []),
            "analysis and file request was converted into candidate generation",
        )
        expected_skills = {
            "course-material-analysis",
            "lesson-plan-file",
            "downloadable-file-delivery",
        }
        selected_skills = set(result.get("selectedSkills") or [])
        require_condition(selected_skills & expected_skills, "agent selected no relevant project skill")

        download_url = f"{flow.BASE_URL}{delivered['downloadUrl']}"
        anonymous = flow.new_session().get(download_url, allow_redirects=False, timeout=30)
        require_condition(anonymous.status_code in {302, 401, 403}, "generated file is anonymously accessible")
        response = verifier.teacher.get(download_url, timeout=60)
        flow.require(response)
        require_condition(
            response.headers.get("Content-Type", "").startswith(
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ),
            "downloaded file has the wrong MIME type",
        )
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            document_xml = archive.read("word/document.xml").decode("utf-8")
        require_condition("教学" in document_xml or "教案" in document_xml, "DOCX has no lesson-plan content")

        thread = verifier.api(
            verifier.teacher,
            "GET",
            f"teaching/threads/{verifier.thread_id}",
        )["thread"]
        reply = next(
            message
            for message in reversed(thread.get("messages") or [])
            if (message.get("metadata") or {}).get("jobId") == job["id"]
        )
        require_condition((reply.get("metadata") or {}).get("files"), "chat reply has no file card metadata")
        require_condition(
            not any(card.get("type") == "candidate_set" for card in reply.get("cards") or []),
            "chat reply contains a candidate card",
        )
        print(
            "PASS  raw compound request reached the model, selected skills, analyzed PDF, and returned an authenticated DOCX download",
            flush=True,
        )

        loop_course_name = f"智能体闭环验收 {verifier.suffix}"
        loop_course_slug = f"agent-loop-{verifier.suffix}"
        loop_prompt = (
            f"请创建一门名为“{loop_course_name}”的私有课程。"
            "实际创建成功后，根据平台的真实结果告诉我课程名称、访问范围和章节数量；"
            "不要把创建操作说成已经完成，也不要改成课件生成。"
        )
        loop_submitted = verifier.api(
            verifier.teacher,
            "POST",
            f"teaching/threads/{verifier.thread_id}/messages",
            json_body={"content": loop_prompt},
            statuses=(202,),
        )
        loop_job = verifier.wait_job(
            loop_submitted["job"]["id"],
            expected_model="deepseek-v4-pro",
        )
        loop_proposals = (loop_job.get("result") or {}).get("toolProposals") or []
        proposal_index = next(
            (
                index
                for index, proposal in enumerate(loop_proposals)
                if proposal.get("tool") == "course.create"
            ),
            None,
        )
        require_condition(proposal_index is not None, "agent did not request course.create")
        create_proposal = loop_proposals[proposal_index]
        require_condition(
            create_proposal.get("requiresConfirmation") is True,
            "course.create did not require explicit UI confirmation",
        )
        require_condition(
            "confirmedByPrompt" not in create_proposal,
            "natural-language wording was treated as trusted confirmation",
        )
        require_condition(
            (create_proposal.get("arguments") or {}).get("name") == loop_course_name,
            "agent did not preserve the requested course name",
        )

        loop_thread = verifier.api(
            verifier.teacher,
            "GET",
            f"teaching/threads/{verifier.thread_id}",
        )["thread"]
        loop_reply = next(
            message
            for message in reversed(loop_thread.get("messages") or [])
            if (message.get("metadata") or {}).get("jobId") == loop_job["id"]
        )
        denied = verifier.teacher.post(
            flow.api_url("teaching/agent-tools/execute"),
            json={
                "threadId": verifier.thread_id,
                "tool": "course.create",
                "arguments": create_proposal.get("arguments") or {},
                "confirmed": False,
            },
            headers={"Idempotency-Key": f"verify-denied-{verifier.suffix}"},
            timeout=120,
        )
        require_condition(
            denied.status_code == 409
            and denied.json().get("errorCode") == "CONFIRMATION_REQUIRED",
            "course.create was executable without explicit confirmation",
        )
        create_arguments = {
            **(create_proposal.get("arguments") or {}),
            "name": loop_course_name,
            "slug": loop_course_slug,
            "access": "private",
        }
        created = verifier.api(
            verifier.teacher,
            "POST",
            "teaching/agent-tools/execute",
            json_body={
                "threadId": verifier.thread_id,
                "tool": "course.create",
                "arguments": create_arguments,
                "confirmed": True,
            },
            headers={
                "Idempotency-Key": (
                    f"agent-proposal:{loop_reply['id']}:{proposal_index}"
                )
            },
            timeout=360,
        )
        verifier.course = created["result"]["course"]
        require_condition(
            verifier.course.get("name") == loop_course_name
            and verifier.course.get("access") == "private",
            "course tool did not create the requested private course",
        )

        continued = verifier.api(
            verifier.teacher,
            "POST",
            f"teaching/threads/{verifier.thread_id}/messages",
            json_body={
                "agentContinuation": True,
                "action": "continue",
                "sourceMessageId": loop_reply["id"],
                "proposalIndexes": [proposal_index],
            },
            headers={
                "Idempotency-Key": (
                    f"verify-loop-{loop_reply['id']}-{proposal_index}"
                )
            },
            statuses=(202,),
        )
        followup = verifier.wait_job(
            continued["job"]["id"],
            expected_model="deepseek-v4-pro",
        )
        followup_result = followup.get("result") or {}
        followup_answer = str(followup_result.get("answer") or "")
        require_condition(
            loop_course_name in followup_answer,
            "agent did not report the verified course result",
        )
        require_condition(
            not any(
                item.get("tool") == "course.create"
                for item in followup_result.get("toolProposals") or []
            ),
            "agent repeated an already verified course.create operation",
        )
        loop_state = followup_result.get("agentLoop") or {}
        verified_trace = next(
            (
                item
                for item in loop_state.get("trace") or []
                if item.get("tool") == "course.create"
                and item.get("status") == "verified"
            ),
            None,
        )
        require_condition(
            loop_state.get("depth") == 1
            and verified_trace is not None
            and (verified_trace.get("observation") or {}).get("course", {}).get("name")
            == loop_course_name,
            "agent continuation did not receive a server-verified tool observation",
        )
        print(
            "PASS  model planned a confirmed course tool, consumed its server-verified result, and finished the original request without repeating it",
            flush=True,
        )

        driver = ui.ChromeDriver()
        driver.navigate(flow.BASE_URL)
        for cookie in verifier.teacher.cookies:
            driver.add_cookie(cookie.name, cookie.value)
        driver.navigate(f"{flow.BASE_URL}/teacher")
        try:
            file_card = driver.wait_for(
                f"""
                if (document.readyState !== 'complete' || !document.getElementById('teacher-agent')) {{
                  return null;
                }}
                const card = Array.from(document.querySelectorAll('a.teaching-agent-file'))
                  .find(node => new URL(node.href).pathname === {delivered['downloadUrl']!r});
                if (!card) return null;
                return {{
                  href: new URL(card.href).pathname,
                  download: card.getAttribute('download'),
                  text: card.textContent.trim(),
                  candidateCards: document.querySelectorAll('.candidate-set-card').length,
                  completedProgress: document.querySelectorAll(
                    '.job-card.is-succeeded .job-step-list'
                  ).length,
                }};
                """,
                timeout=60,
                label="downloadable Agent file card",
            )
        except Exception as error:
            diagnostic = driver.execute(
                """
                return {
                  location: location.href,
                  ready: document.readyState,
                  hasRoot: !!document.getElementById('teacher-agent'),
                  messageCount: document.querySelectorAll('.teaching-message').length,
                  fileCards: Array.from(document.querySelectorAll('a.teaching-agent-file')).map(node => ({
                    href: new URL(node.href).pathname,
                    download: node.getAttribute('download'),
                  })),
                  threads: Array.from(document.querySelectorAll('[data-thread-open]')).slice(0, 5).map(node => ({
                    id: node.getAttribute('data-thread-open'),
                    active: node.classList.contains('is-active'),
                    text: node.textContent.trim().slice(0, 120),
                  })),
                  notice: document.getElementById('teaching-notice')?.textContent?.trim() || '',
                  body: document.body?.innerText?.slice(0, 500) || '',
                };
                """
            )
            raise RuntimeError(f"{error}; diagnostic={diagnostic!r}") from error
        require_condition(file_card["download"] == delivered["filename"], "file card download name is wrong")
        require_condition("下载" in file_card["text"], "file card has no download action")
        require_condition(file_card["candidateCards"] == 0, "browser rendered a candidate card")
        require_condition(file_card["completedProgress"] == 0, "browser retained redundant completed progress")
        print(
            "PASS  browser rendered one authenticated download card without candidate or redundant progress UI",
            flush=True,
        )
        return 0
    except Exception as error:
        print(f"FAIL  {error}", flush=True)
        return 1
    finally:
        if driver is not None:
            driver.close()
        if material_id and verifier.teacher is not None:
            try:
                verifier.api(verifier.teacher, "DELETE", f"teaching/materials/{material_id}")
            except Exception as error:
                print(f"WARN  material cleanup failed: {error}", flush=True)
        verifier.cleanup()


if __name__ == "__main__":
    raise SystemExit(run())
