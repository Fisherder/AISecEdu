"""Durable tool/observation boundary for the teaching Agent.

Adapted from the loop/inbox separation in DeepSeek Harness and Pi. The SQL
job lease owns execution; closing a page never owns or cancels a turn.
"""

import time

READ_TOOLS = frozenset({"progress.read", "material.list", "artifact.list", "job.list", "approval.list", "classroom.list", "candidate.compare"})
DECISION_TOOLS = frozenset({"candidate.generate", "challenge.generate", "artifact.validate", "job.retry", "classroom.prepare"})


class TurnDeferred(RuntimeError):
    pass


def execution_policy(tool, schemas, course_tools, navigation_tools):
    if tool == "generation.start":
        return "server"
    schema = schemas.get(tool)
    if schema is None or schema[0] == "R3" or tool in DECISION_TOOLS or tool in navigation_tools or tool == "artifact.open":
        return "user"
    if tool in READ_TOOLS or tool == "dojo.select" or tool in course_tools or tool in {"artifact.revise", "material.analyze"}:
        return "server"
    return "user"


def response_data(response):
    value, status = response if isinstance(response, tuple) else (response, 200)
    if status >= 400 or not value.get("success"):
        raise ValueError("；".join(value.get("errors") or ["操作未完成"]))
    return value.get("data") or {}


def tool_job_ids(data):
    result = data.get("result") or {}
    rows = [data.get("job"), result.get("job"), *(data.get("jobs") or []), *(result.get("jobs") or [])]
    ids = [row.get("id") for row in rows if isinstance(row, dict)]
    ids += [data.get("jobId"), result.get("jobId")]
    return list(dict.fromkeys(str(value) for value in ids if value))


def advance_turn(job):
    from CTFd.models import Users, db
    from ..models import TeachingAgentMessages, TeachingAgentThreads, TeachingJobs
    from ..api.v1 import teaching as api
    from . import jobs
    from .tool_plan import driver_plan, freeze_plan, message_metadata, progress, record_observation, record_progress, settled_job

    owner = Users.query.filter_by(id=job.owner_id).first()
    thread = TeachingAgentThreads.query.filter_by(id=job.thread_id, user_id=job.owner_id).first()
    if owner is None or thread is None or thread.status != "ACTIVE":
        raise ValueError("对话已归档或不可用，未继续执行。")
    api._require_teacher(owner)
    plan = driver_plan(job)
    source = TeachingAgentMessages.query.filter_by(
        id=plan['sourceMessageId'] if plan else (job.payload or {}).get("sourceMessageId"), user_id=owner.id,
        thread_id=thread.id, role="assistant",
    ).first()
    if source is None:
        raise ValueError("原始消息已不存在，未继续执行。")
    plan = plan or freeze_plan(source, driver=job)
    db.session.commit()
    metadata = message_metadata(source, plan)
    from .workbench import require_execution_mode
    require_execution_mode(metadata)
    proposals = metadata.get("toolProposals") or []
    results = dict(metadata.get("toolExecutionResults") or {})
    root_id = str(plan['rootJobId'] or job.id)
    stored_progress = progress(plan)
    job.payload = {**(job.payload or {}), 'sourceMessageId': source.id, 'harnessRootJobId': root_id}
    if stored_progress:
        job.payload = {**job.payload, 'waitForJobIds': stored_progress['waitForJobIds']}
        if stored_progress['waitForApproval']:
            job.payload = {**job.payload, 'waitForApproval': stored_progress['waitForApproval']}
        else:
            job.payload = {key: value for key, value in job.payload.items() if key != 'waitForApproval'}
    waiting = (job.payload or {}).get('waitForApproval')
    if waiting:
        from .approval_journal import proposal_request, request_reference, ApprovalJournalError

        prefix = f'proposal:{thread.id}:{source.id}:'
        suffix = str(waiting.get('id') or '').removeprefix(prefix)
        if not str(waiting.get('id') or '').startswith(prefix) or not suffix.isdigit():
            raise ApprovalJournalError('批准请求不属于当前操作。', 'APPROVAL_REQUEST_CHANGED')
        waiting_index = int(suffix)
        if waiting_index >= min(len(proposals), 8) or request_reference(
            proposal_request(thread.id, source.id, waiting_index, proposals[waiting_index])
        ) != waiting:
            raise ApprovalJournalError('批准请求的内容已变化，请重新提出操作。', 'APPROVAL_REQUEST_CHANGED')

    def trace(event_type, **fields):
        sequence = int((job.payload or {}).get("harnessTraceSequence") or 0)
        job.payload = {**(job.payload or {}), "harnessTraceSequence": sequence + 1}
        jobs._record_agent_run_progress(job, {"type": event_type, "runId": job.id, "seq": sequence,
            "time": int(time.time() * 1000), **fields})

    if not (job.payload or {}).get("harnessTraceStarted"):
        job.payload = {**(job.payload or {}), "harnessTraceStarted": True}
        trace("run.started", label="平台工具与结果观察")

    def finish(result):
        trace("run.completed")
        return result

    def save(state):
        # Fresh metadata preserves a decision or cancellation written elsewhere.
        jobs.assert_job_lease(job)
        for index, result in results.items():
            record_observation(plan, job, int(index), result)
        record_progress(plan, job, state)
        db.session.refresh(source)
        source.metadata_json = {**(source.metadata_json or {}), "toolExecutionResults": results,
                                "harnessExecution": {"state": state, "jobId": job.id}}
        db.session.commit()

    def accept_steering_boundary():
        from .conversation import steering_input_for_boundary

        db.session.query(TeachingAgentThreads).filter_by(id=thread.id, user_id=owner.id).with_for_update().one()
        jobs.assert_job_lease(job)
        pending = steering_input_for_boundary(db.session, job)
        if pending is None:
            db.session.commit()
            return None
        pending.payload = {**(pending.payload or {}), "steeringBoundaryJobId": job.id}
        jobs.append_job_event(pending, "input-boundary", "QUEUED", "已在执行边界接收补充，当前操作结果将随对话继续保留", details={"boundaryJobId": job.id})
        save("steered")
        return {"state": "steered", "nextInputJobId": pending.id}

    for index, proposal in enumerate(proposals[:8]):
        job = jobs.heartbeat(job, stage="executing-tools", progress=min(80, 10 + index * 10),
                             message=f"正在执行第 {index + 1} 项操作")
        key = str(index)
        previous = results.get(key) or {}
        tool = str(proposal.get("tool") or "")
        item_id = f"{job.id}:tool-{index}"

        def trace_tool(event_type, **fields):
            trace(event_type, itemId=item_id, **fields)

        if previous.get("status") in {"SUCCEEDED", "REJECTED"}:
            continue
        from .approval_journal import proposal_request, request_reference, journal_rows, ApprovalJournalError

        envelope = proposal_request(thread.id, source.id, index, proposal)
        reference = request_reference(envelope)
        request = next((row.payload for row in journal_rows(thread.id, envelope['id'])
                        if row.event_type == 'approval.requested'), None)
        if request and request['requestSha256'] != reference['sha256']:
            raise ApprovalJournalError('批准请求的内容已变化，请重新提出操作。', 'APPROVAL_REQUEST_CHANGED')
        child_ids = previous.get("jobIds") or ([previous["jobId"]] if previous.get("jobId") else [])
        if child_ids:
            children = [TeachingJobs.query.filter_by(id=child_id, owner_id=owner.id, thread_id=thread.id).first() for child_id in child_ids]
            if any(child is None for child in children):
                raise ValueError("操作任务已不存在，请查看任务记录。")
            if any(child.status in {"QUEUED", "RUNNING", "CANCEL_REQUESTED"} for child in children):
                job.payload = {**(job.payload or {}), "waitForJobIds": child_ids}
                save("waiting-tool")
                raise TurnDeferred()
            failed = next((child for child in children if child.status != "SUCCEEDED"), None)
            if failed is not None:
                results[key] = {**previous, "status": failed.status, "error": jobs._job_failure_message(failed)}
                trace_tool("item.completed", status="failed")
                save("failed")
                trace("run.failed", error=jobs._job_failure_message(failed) or "操作未完成")
                raise ValueError(jobs._job_failure_message(failed) or "操作未完成，请重试原任务。")
            from .commands import COMMAND_JOB_KINDS
            outcomes = {child.id: settled_job(child) for child in children}
            descendants = list(dict.fromkeys(child_id for child in children if child.kind in COMMAND_JOB_KINDS
                                             for child_id in outcomes[child.id].get('childJobIds', [])))
            if descendants:
                results[key] = {**previous, 'jobIds': descendants, 'jobId': descendants[0], 'commandJobIds': child_ids,
                                'observations': list(outcomes.values())}
                job.payload = {**(job.payload or {}), 'waitForJobIds': descendants}
                save('waiting-tool')
                raise TurnDeferred()
            results[key] = {**previous, "status": "SUCCEEDED", 'observations': list(outcomes.values())}
            trace_tool("item.completed", status="completed")
            save("executing")
            continue
        steering = accept_steering_boundary()
        if steering is not None:
            return finish(steering)
        approval_reference = None
        executable_tools = api.COURSE_TOOL_NAMES | api.SKILL_TOOL_NAMES
        if proposal.get('requiresConfirmation') and tool in executable_tools and tool not in api.COURSE_NAVIGATION_TOOLS | DECISION_TOOLS:
            from .approval_journal import proposal_request, request_approval, recorded_decision, require_approved

            thread = TeachingAgentThreads.query.filter_by(id=thread.id, user_id=owner.id).with_for_update().populate_existing().one()
            envelope = proposal_request(thread.id, source.id, index, proposal)
            approval_reference = request_approval(envelope)
            decision = recorded_decision(thread.id, envelope['id'])
            if decision is None:
                job.payload = {**(job.payload or {}), 'waitForApproval': approval_reference, 'waitForJobIds': []}
                save('awaiting-approval')
                raise TurnDeferred()
            if decision['requestSha256'] != approval_reference['sha256']:
                raise ValueError('批准请求已变化，请重新提出操作。')
            job.payload = {key: value for key, value in (job.payload or {}).items() if key != 'waitForApproval'}
            if decision['decision'] == 'REJECTED':
                results[key] = {'tool': tool, 'status': 'REJECTED', 'approvalRequest': approval_reference}
                save('executing')
                continue
            require_approved(envelope, approval_reference)
        elif proposal.get("requiresConfirmation") or execution_policy(tool, jobs.AGENT_TOOL_SCHEMAS, executable_tools, api.COURSE_NAVIGATION_TOOLS) != "server":
            save("awaiting-action")
            return finish({"state": "awaiting-action", "sourceMessageId": source.id})
        tool_titles = {
            "generation.start": "按教师选定的方案制作",
            "progress.read": "读取任务进度", "material.list": "读取课程材料",
            "artifact.list": "查找已有成品", "job.list": "查询任务",
            "approval.list": "查询待确认操作", "classroom.list": "读取课堂信息",
            "candidate.compare": "比较候选作品", "material.analyze": "分析课程材料",
            "artifact.revise": "修改已有成品", "dojo.select": "切换课程范围",
        }
        arguments = proposal.get("arguments") or {}
        trace_tool("item.started", item={
            "id": item_id, "kind": "tool", "title": tool_titles.get(tool, tool),
            "subtitle": tool, "status": "running", "startedAt": int(time.time() * 1000),
            "input": arguments,
        })
        request_key = f"agent-proposal:{source.id}:{index}"
        data = {}
        results[key] = {'tool': tool, 'status': 'DISPATCHING'}
        save('executing')
        if tool in executable_tools:
            data = response_data(api.execute_teacher_tool(owner, {
                "threadId": thread.id, "tool": tool, "arguments": arguments,
                "sourceJobId": metadata.get("jobId"),
                'confirmed': bool(approval_reference), 'approvalRequest': approval_reference,
            }, request_key))
        elif tool == "dojo.select":
            scope = api.build_scope(owner, role="teacher", dojo_id=arguments.get("referenceId"), module_index=arguments.get("moduleIndex"))
            thread.dojo_id, thread.module_index = scope.dojo_id, scope.module_index
            db.session.commit()
        elif tool == "generation.start":
            data = response_data(api.start_teacher_generation(owner, thread.id, arguments, request_key))
        elif tool == "artifact.revise":
            data = response_data(api.revise_teacher_artifact(owner, str(arguments.get("artifactId") or ""), arguments, request_key))
        elif tool == "material.analyze":
            data = response_data(api.analyze_teacher_material(owner, str(arguments.get("materialId") or ""), {**arguments, "threadId": thread.id}, request_key))
        else:
            facts = api._teacher_agent_context(owner, thread)
            data = {'observation': api._agent_tool_platform_observation(tool, facts)}
        # Services and action audits use deterministic operation IDs. A worker
        # crash after dispatch replays the same operation, never a fresh write.
        child_ids = tool_job_ids(data)
        receipt = {key: value for key, value in data.items() if key != 'thread'}
        results[key] = {"tool": tool, "status": "SUCCEEDED", 'receipt': receipt}
        for child_id in child_ids:
            child = TeachingJobs.query.filter_by(id=child_id, owner_id=owner.id).first()
            if child is None or child.thread_id not in {None, thread.id}:
                raise ValueError("操作任务不属于当前对话。")
            child.thread_id = thread.id
            child.payload = {**(child.payload or {}), "harnessRootJobId": root_id, "harnessInternal": True, "taskListHidden": True}
        if child_ids:
            results[key] = {"tool": tool, "status": "RUNNING", "jobId": child_ids[0], "jobIds": child_ids, 'receipt': receipt}
            job.payload = {**(job.payload or {}), "waitForJobIds": child_ids}
            save("waiting-tool")
            raise TurnDeferred()
        save("executing")
        trace_tool("item.completed", status="completed")
    steering = accept_steering_boundary()
    if steering is not None:
        return finish(steering)
    if not proposals or int(metadata.get("agentLoopDepth") or 0) >= api.MAX_AGENT_LOOP_STEPS - 1:
        save("complete")
        return finish({"state": "complete"})
    job = jobs.heartbeat(job, stage="observing", progress=90, message="操作已完成，正在结合最新结果继续处理")
    data = response_data(api.submit_teacher_message(owner, thread.id, {
        "agentContinuation": True, "action": "continue", "sourceMessageId": source.id,
        "proposalIndexes": list(range(min(len(proposals), 8))),
    }, f"agent-loop-{source.id}-" + "-".join(str(i) for i in range(min(len(proposals), 8)))))
    job.payload = {**(job.payload or {}), "harnessNextJobId": data["job"]["id"]}
    save("complete")
    return finish({"state": "complete", "nextJobId": data["job"]["id"]})
