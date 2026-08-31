from urllib.parse import urlsplit


PAGE_NAMES = (
    ("/teacher/courses", "课程中心"),
    ("/teacher", "教学工作台"),
    ("/student", "今天"),
    ("/learning/assignments", "作业"),
    ("/learning/artifacts", "学习成果"),
    ("/learning/extend", "我的创作"),
    ("/learning", "学习中心"),
    ("/guide", "AI 学习助手"),
    ("/dojos", "课程目录"),
    ("/workspace", "实验环境"),
    ("/settings", "账户设置"),
    ("/hacker", "个人资料"),
    ("/admin/desktops", "运行环境治理"),
    ("/admin/dojos", "课程治理"),
    ("/admin/users", "用户与权限"),
    ("/admin/challenges", "内容与评测"),
    ("/admin/config", "平台设置"),
    ("/admin/submissions", "审计与提交"),
    ("/admin", "平台管理"),
    ("/login", "登录"),
    ("/register", "注册"),
    ("/reset_password", "重置密码"),
    ("/privacy", "隐私说明"),
    ("/terms", "使用条款"),
    ("/research", "学习数据与隐私"),
    ("/belts", "学习成就"),
    ("/feed", "学习动态"),
    ("/about", "关于"),
)


def page_metadata(path, *, dojo=None, module=None):
    route_path = urlsplit(str(path or "/")).path or "/"
    if dojo is not None:
        context_name = getattr(module, "name", None) or getattr(dojo, "name", None) or getattr(dojo, "id", None)
    else:
        context_name = None
    if route_path == "/":
        name = "网络安全学习平台"
    else:
        name = next((label for prefix, label in PAGE_NAMES if route_path.startswith(prefix)), "页面")
    title = f"{name} · {context_name}" if context_name and context_name != name else name
    descriptions = {
        "网络安全学习平台": "通过结构化课程、隔离实验、AI 辅导与可核验学习证据掌握网络安全能力。",
        "今天": "查看此刻最值得继续的一项学习任务。",
        "课程目录": "发现、加入并继续玄甲网络安全课程。",
        "教学工作台": "处理教学事项、跟踪生成任务并发起 AI 共创。",
        "课程中心": "组织课程、课件、实践题、演示与学情。",
        "平台管理": "查看平台健康、风险与需要处理的治理任务。",
    }
    return {
        "title": title,
        "description": descriptions.get(name, "玄甲网络安全教学平台。"),
        "canonicalPath": route_path,
    }
