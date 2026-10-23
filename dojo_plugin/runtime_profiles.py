import copy
import re
from dataclasses import dataclass, field


@dataclass(frozen=True)
class RuntimeProfile:
    id: str
    label: str
    image_setting: str
    memory: str
    directory: str
    interpreters: tuple
    desktop_resize: str
    initializer: str | None = None
    c_compiler: str = "gcc"
    writable_directory: str = "/home/hacker"
    command_bridge: str | None = None
    check_command: str = "/challenge/check"
    family: str = "linux"
    aliases: tuple = field(default_factory=tuple)
    tokens: tuple = field(default_factory=tuple)
    description: str = ""

    @property
    def is_windows(self):
        return self.family == "windows"

    @property
    def public_context(self):
        return {
            "id": self.id,
            "name": self.label,
            "family": self.family,
            "description": self.description,
            "default": self.id == "linux",
            "workingDirectory": self.directory,
            "writableDirectory": self.writable_directory,
            "serviceInterpreters": list(self.interpreters),
            "cCompiler": self.c_compiler,
            "commandBridge": self.command_bridge,
            "checkCommand": self.check_command,
        }

    @property
    def image(self):
        from . import config

        return getattr(config, self.image_setting)

    @property
    def interfaces(self):
        desktop = {"name": "Desktop", "port": 6080}
        terminal = {"name": "Terminal", "port": 7681}
        code = {"name": "Code", "port": 8080}
        return [desktop, code, terminal] if self.is_windows else [terminal, code, desktop, {"name": "SSH"}]


RUNTIME_PROFILES = {
    "linux": RuntimeProfile(
        "linux", "Linux", "DOJO_LINUX_RUNTIME_IMAGE", "4G", "/challenge",
        ("python3", "node", "bash"), "remote",
        family="linux", aliases=("linux", "ubuntu", "debian", "gnu/linux"),
        tokens=("linux", "ubuntu", "debian", "gnu/linux"),
        description="Linux 终端、Code 与 Desktop 工作区，使用 gcc 编译。",
    ),
    "windows": RuntimeProfile(
        "windows", "Windows 11 远程桌面", "DOJO_WINDOWS_RUNTIME_IMAGE", "6G", "C:\\Course",
        ("powershell", "cmd"), "scale", "/usr/local/bin/windows-runtime-start",
        c_compiler="C:\\tcc\\tcc.exe", writable_directory="C:\\CourseWork",
        command_bridge="windows-exec", check_command="C:\\Course\\check.cmd",
        family="windows",
        aliases=("windows", "win", "win10", "windows10", "win11", "windows11",
                 "windows 10", "windows 11", "win 10", "win 11", "windows-qemu", "windows-desktop"),
        tokens=("windows 11", "windows11", "win11", "win 11", "windows 10", "windows10", "win10",
                "win 10", "windows", "windows-qemu", "windows-desktop"),
        description="Windows 11 远程桌面，提供 PowerShell 5.1、原生 VS Code、OllyDbg 与 Tiny C Compiler。",
    ),
    "windows2000": RuntimeProfile(
        "windows2000", "Windows 2000 远程桌面", "DOJO_WINDOWS2000_RUNTIME_IMAGE", "2G", "C:\\Course",
        ("cmd",), "scale", "/usr/local/bin/windows-runtime-start",
        c_compiler="C:\\tcc\\tcc.exe", writable_directory="C:\\CourseWork",
        command_bridge=None, check_command="C:\\Course\\check.cmd",
        family="windows",
        aliases=("windows2000", "windows 2000", "win2000", "win 2000", "w2k", "windows-2000",
                 "windows2000-qemu", "win2000-qemu", "windows2000-desktop"),
        tokens=("windows 2000", "windows2000", "win2000", "win 2000", "windows-2000", "w2k"),
        description="轻量 Windows 2000 远程桌面，只有 cmd 与 OllyDbg，没有 PowerShell 和 VS Code；单台内存占用远低于 Windows 11。",
    ),
}

RUNTIME_ALIASES = {
    alias: profile.id
    for profile in RUNTIME_PROFILES.values()
    for alias in (profile.id, *profile.aliases)
}

RUNTIME_FAMILIES = tuple(dict.fromkeys(profile.family for profile in RUNTIME_PROFILES.values()))

_RUNTIME_TOKENS = sorted(
    (token for profile in RUNTIME_PROFILES.values() for token in (profile.tokens or profile.aliases)),
    key=len,
    reverse=True,
)
RUNTIME_TOKEN = re.compile(
    r"(?<![a-z0-9])(" + "|".join(re.escape(alias) for alias in _RUNTIME_TOKENS) + r")(?![a-z0-9])",
    re.I,
)


def runtime_environments():
    return tuple(RUNTIME_PROFILES.values())


def runtime_environment_choices():
    return [
        {
            "id": profile.id,
            "name": profile.label,
            "family": profile.family,
            "description": profile.description,
            "isDefault": profile.id == "linux",
        }
        for profile in RUNTIME_PROFILES.values()
    ]


def normalize_runtime_environment(value, *, default="linux"):
    value = str(value or default).strip().lower()
    value = RUNTIME_ALIASES.get(value, value)
    if value not in RUNTIME_PROFILES:
        raise ValueError("运行环境必须是平台已安装的客户机系统之一。")
    return value


def runtime_profile(value=None):
    return RUNTIME_PROFILES[normalize_runtime_environment(value)]


def valid_windows_course_paths(paths):
    seen = set()
    for path in paths:
        if not isinstance(path, str) or not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_./-]{0,180}", path):
            return False
        key = path.lower()
        if key in seen or key == "check.cmd":
            return False
        seen.add(key)
        for part in path.split("/"):
            if not part or part in {".", ".."} or part.endswith(".") or re.match(r"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)", part, re.I):
                return False
    return True


def infer_runtime_environment(brief):
    choices = []
    text = str(brief or "")
    for match in RUNTIME_TOKEN.finditer(text):
        prefix = text[max(0, match.start() - 32):match.start()]
        suffix = text[match.end():match.end() + 12]
        clause = re.split(r"[，。；;\n!?！？]", prefix)[-1]
        if re.search(r"(?:如果|假如|若|假设|\bif\b|\bwhen\b)", clause, re.I):
            continue
        if re.search(r"(?:不要|不用|不使用|不选|不是|非|不需要|无需|without|not(?:\s+to)?\s+use|not|don't\s+use)(?:\s|使用|选用|选择|用)*$", prefix, re.I):
            continue
        if re.match(r"\s*(?:不是必选|仅作对照|只是对照|仅为举例)", suffix):
            continue
        environment = RUNTIME_ALIASES.get(match.group().lower())
        if environment is None:
            continue
        score = 1
        if re.search(r"(?:用|在|选择|改成|改为|换成|切换到|运行环境[：:为]?|use|using|on|switch\s+to)\s*$", prefix, re.I):
            score = 2
        if re.search(r"(?:(?:默认|明确|只|仅|优先|必须)(?:使用|采用|选用|选择|用|为)?|runtimeEnvironment\s*[:=]|default(?:\s+to)?|must\s+use|only\s+use)\s*$", prefix, re.I):
            score = 3
        if re.match(r"\s*(?:远程桌面|运行环境|环境|桌面)", suffix):
            score += 1
        choices.append((score, match.start(), environment))
    if not choices:
        return None
    strongest = max(item[0] for item in choices)
    selected = [item for item in choices if item[0] == strongest]
    families = {RUNTIME_PROFILES[item[2]].family for item in selected}
    if strongest == 1 and len(families) > 1:
        return None
    return selected[-1][2]


def authoring_runtime_constraints(brief, constraints=None, *, revision=False):
    result = copy.deepcopy(constraints) if isinstance(constraints, dict) else {}
    explicit = result.get("runtimeEnvironment") or result.pop("runtime_environment", None)
    inferred = infer_runtime_environment(brief)
    selected = inferred if revision and inferred else explicit or inferred
    environment = normalize_runtime_environment(selected)
    if revision and explicit and environment != normalize_runtime_environment(explicit):
        result.pop("image", None)
        result.pop("interfaces", None)
    result["runtimeEnvironment"] = environment
    return result


def container_runtime_profile(container):
    value = container.labels.get("dojo.runtime_environment")
    if not value:
        labels = container.image.attrs.get("Config", {}).get("Labels") or {}
        value = labels.get("org.aisecedu.runtime")
    return runtime_profile(value if value in {*RUNTIME_PROFILES, *RUNTIME_ALIASES} else None)


def profile_for_runtime_label(value):
    value = str(value or "").strip().lower()
    if value in RUNTIME_ALIASES:
        value = RUNTIME_ALIASES[value]
    return RUNTIME_PROFILES.get(value)
