import copy


def branch_message_snapshot(message):
    metadata = message.metadata_json or {}
    preserved = {key: copy.deepcopy(metadata[key]) for key in (
        "attachments", "files", "selectedSkills", "promptManifest", "client", "sourceMessageId", "optionId",
    ) if key in metadata}
    preserved["branchSource"] = {"threadId": message.thread_id, "messageId": message.id}
    return {"role": message.role, "content": message.content, "metadata_json": preserved}


def completed_branch_boundary(messages, requested_id=None):
    completed = [message for message in messages if message.role == "assistant"
                 and (message.metadata_json or {}).get("pending") is not True
                 and not (message.metadata_json or {}).get("failed")
                 and str((message.metadata_json or {}).get("jobStatus") or "") not in {"FAILED", "CANCELED"}]
    if requested_id is not None:
        return next((message.id for message in completed if message.id == requested_id), None)
    return completed[-1].id if completed else None
