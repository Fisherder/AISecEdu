from CTFd.plugins.dojo_plugin.learning.authoring import _append_oracle_instructions
from CTFd.plugins.dojo_plugin.learning.student_agent import resolve_tool_calls


cases = (
    ("请分析为什么系统会生成课件，而不是回答问题。", []),
    ("帮我分析已有课件的结构和不足。", []),
    ("请解释‘创建工作区’这个功能的权限边界。", []),
    ("请为软件安全课程生成一份课件。", ["create_workspace"]),
    ("请先分析资料，然后生成一份模拟演示。", ["create_workspace"]),
    ("请帮我记住我偏好先看原理再做实验。", ["remember"]),
    ("请忘记我偏好先看原理再做实验。", ["forget"]),
)
proposed = [
    {"tool": "create_workspace", "arguments": {"mode": "slides"}},
    {"tool": "remember", "arguments": {}},
    {"tool": "forget", "arguments": {}},
]
for question, expected in cases:
    actual = [item["tool"] for item in resolve_tool_calls(question, proposed)]
    if actual != expected:
        raise AssertionError(f"{question}: expected {expected}, received {actual}")

description = _append_oracle_instructions(
    (
        "利用栈溢出改变服务状态，并验证控制流已被劫持。\n\n"
        "提交要求：完成题目目标后，平台将自动检测到完成状态并签发本次环境的"
        "动态 Flag，请将该 Flag 提交到平台，仅接受 Flag 提交。\n\n"
        "完成实验后，请将观察与结论写入 `/home/hacker/solution.json`，"
        "并运行 `/challenge/check` 验证。"
    ),
    {
        "type": "FLAG_GATE_V1",
        "requiredFields": ["pwned"],
        "assertions": [{"field": "pwned", "operator": "equals", "value": True}],
        "liveBindings": [],
    },
)
for forbidden in ("solution.json", "JSON", "自动检测到完成状态", "仅接受 Flag 提交"):
    if forbidden in description:
        raise AssertionError(f"student CTF instruction leaked forbidden contract: {forbidden}")
if "/challenge/check" not in description or "动态 Flag" not in description:
    raise AssertionError("student CTF instruction does not use the dynamic Flag flow")
repeated = _append_oracle_instructions(description, {})
if repeated.count("### 提交与验证") != 1 or repeated.count("动态 Flag") != 1:
    raise AssertionError("student CTF instructions are not idempotent")

print("PASS  student agent preserves analysis intent and only executes explicit commands")
print("PASS  student CTF guidance uses dynamic Flag submission without report contracts")
