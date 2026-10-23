import json


REFINEMENT_VERSION = "generation-refinement-v1"
MAX_REFINEMENT_FEEDBACK_CHARS = 4000
MAX_REFINEMENT_BRIEF_CHARS = 48000


def generation_refinement_request(source_payload, source_message_id, bundle, feedback):
    feedback = str(feedback or "").replace("\x00", "").strip()
    if not feedback:
        raise ValueError("请补充你希望修改的内容，再重新生成三个方案。")
    if len(feedback) > MAX_REFINEMENT_FEEDBACK_CHARS:
        raise ValueError("单次修改要求不能超过 4000 字符，请精简后重试。")
    previous = source_payload.get("generationRefinement")
    if isinstance(previous, dict):
        if previous.get("version") != REFINEMENT_VERSION:
            raise ValueError("无法验证上一轮要求，请重新提交完整需求。")
        original = previous["originalRequest"]
        changes = list(previous["feedback"])
        root_message_id = previous["rootSourceMessageId"]
    else:
        original = str(source_payload.get("prompt") or "").strip()
        changes = []
        root_message_id = source_message_id
    if not original or not isinstance(original, str) or any(not isinstance(item, str) for item in changes):
        raise ValueError("没有找到完整的教师原始要求，请重新提交需求。")
    changes.append(feedback)
    refinement = {
        "version": REFINEMENT_VERSION,
        "round": len(changes) + 1,
        "sourceMessageId": source_message_id,
        "rootSourceMessageId": root_message_id,
        "originalRequest": original,
        "feedback": changes,
        "targetTool": bundle["targetTool"],
        "artifactType": bundle["artifactType"],
        "previousOptions": [
            {"title": option["title"], "description": option["description"]}
            for option in bundle["options"]
        ],
    }
    if len(generation_refinement_prompt(refinement)) > MAX_REFINEMENT_BRIEF_CHARS:
        raise ValueError("累计要求过长，不能无损继续；请在新对话中提交整合后的完整要求。")
    return refinement


def generation_refinement_prompt(refinement):
    changes = "\n\n".join(
        f"第 {index} 次教师修改：\n{feedback}"
        for index, feedback in enumerate(refinement["feedback"], 1)
    )
    rejected = json.dumps(refinement["previousOptions"], ensure_ascii=False)
    return (
        f"生成方案协商，第 {refinement['round']} 轮。教师尚未批准正式生成。\n"
        "本请求已完整包含教师原始要求与历次修改，不需要从历史模型扩写中继承需求。\n"
        "请整合下列教师要求：未被修改的原要求继续有效；冲突之处以较新的教师修改为准。\n"
        f"上一轮未被认可的模型方案摘要（只用于避免重复，不是教师要求）：\n{rejected}\n\n"
        f"教师原始要求：\n{refinement['originalRequest']}\n\n{changes}\n\n"
        f"原内容类型：{refinement['artifactType']}；原生成工具：{refinement['targetTool']}。"
        "除非教师明确修改内容类型，否则保持此类型。\n"
        "请返回 generationOptions，恰好三种实质不同的新方案；每种给出标题、详细设计、"
        "亮点和完整 rewrittenPrompt。详细提示词必须独立自包含，整合原始要求和全部修改，"
        "不能只写‘同上’、引用旧方案编号或要求正式生成时再读取本对话。"
        "不要把未认可方案的摘要复制进正式提示词。\n"
        "本轮只能提案并等待教师选择，不得启动 candidate.generate、challenge.generate，"
        "不得创建作品、发布内容或修改课程。不要直接生成成品或只口头答应修改。"
    )
