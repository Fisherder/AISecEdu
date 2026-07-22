ABILITY_DIMENSIONS = (
    "reconnaissance_environment",
    "technical_reasoning",
    "tool_orchestration",
    "debugging_adaptation",
    "solution_validation",
    "safety_independence",
)

ABILITY_LABELS = {
    "reconnaissance_environment": "环境侦察",
    "technical_reasoning": "技术推理",
    "tool_orchestration": "工具编排",
    "debugging_adaptation": "调试与调整",
    "solution_validation": "方案验证",
    "safety_independence": "安全与独立性",
}

SCORING_VERSION = "dojo-learning/2.0"
HINT_VERSION = "dojo-tutor/3.0"

PROCESS_CRITERIA = (
    {
        "id": "baseline-recon",
        "title": "建立有效基线",
        "maxScore": 8,
        "eventTypes": ("terminal.command.completed", "runtime.state.snapshot"),
    },
    {
        "id": "hypothesis-validation",
        "title": "假设与验证闭环",
        "maxScore": 12,
        "eventTypes": (
            "terminal.command.completed",
            "terminal.command.failed",
            "milestone.observed",
        ),
    },
    {
        "id": "evidence-and-remediation",
        "title": "根因、影响与修复说明",
        "maxScore": 8,
        "eventTypes": ("attempt.reflection.saved", "attempt.submitted"),
    },
    {
        "id": "debugging-adaptation",
        "title": "调试与策略调整",
        "maxScore": 6,
        "eventTypes": ("terminal.command.failed", "lab.reset.requested"),
    },
    {
        "id": "safety",
        "title": "操作范围与安全",
        "maxScore": 4,
        "eventTypes": ("policy.egress.denied", "attempt.submitted"),
    },
    {
        "id": "independence",
        "title": "独立完成与辅助使用",
        "maxScore": 2,
        "eventTypes": ("tutor.chat.assistant", "attempt.submitted"),
    },
)

DEFAULT_RUBRIC = {
    "version": SCORING_VERSION,
    "totalScore": 100,
    "objectiveWeight": 60,
    "processWeight": 40,
    "criteria": [
        {
            "id": "objective-success",
            "title": "完成客观目标",
            "graderType": "DETERMINISTIC_ORACLE",
            "maxScore": 60,
            "minimumTrustLevel": 4,
        },
        *[
            {
                "id": item["id"],
                "title": item["title"],
                "graderType": "EVIDENCE_PATTERN",
                "maxScore": item["maxScore"],
                "requiredEventTypes": list(item["eventTypes"]),
                "minimumTrustLevel": 2,
            }
            for item in PROCESS_CRITERIA
        ],
    ],
}

DEFAULT_HINT_POLICY = {
    "version": HINT_VERSION,
    "mode": "SOCRATIC_HINTS",
    "responseStyle": "委婉回应问题，并提示下一项思考、可验证动作或适用工具，不提供完整解法。",
    "forbiddenDisclosures": (
        "flag",
        "final answer",
        "最终答案",
        "dynamic secret",
        "teacher solution",
        "authorization",
        "bearer token",
    ),
    "currentEpochOnly": True,
}

CATEGORY_SKILLS = {
    "WEB": ("reconnaissance_environment", "technical_reasoning", "solution_validation"),
    "PWN": ("technical_reasoning", "tool_orchestration", "debugging_adaptation"),
    "REV": ("reconnaissance_environment", "technical_reasoning", "debugging_adaptation"),
    "CRYPTO": ("technical_reasoning", "solution_validation", "debugging_adaptation"),
    "FORENSICS": ("reconnaissance_environment", "tool_orchestration", "solution_validation"),
    "GENERAL": ABILITY_DIMENSIONS,
}
