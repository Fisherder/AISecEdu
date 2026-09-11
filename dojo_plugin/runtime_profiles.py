import copy
import re
from dataclasses import dataclass


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

    @property
    def image(self):
        from . import config

        return getattr(config, self.image_setting)

    @property
    def interfaces(self):
        desktop = {"name": "Desktop", "port": 6080}
        terminal = {"name": "Terminal", "port": 7681}
        code = {"name": "Code", "port": 8080}
        return [desktop, code, terminal] if self.id == "windows" else [terminal, code, desktop, {"name": "SSH"}]


RUNTIME_PROFILES = {
    "linux": RuntimeProfile("linux", "Linux", "DOJO_LINUX_RUNTIME_IMAGE", "4G", "/challenge", ("python3", "node", "bash"), "remote"),
    "windows": RuntimeProfile("windows", "Windows 远程桌面", "DOJO_WINDOWS_RUNTIME_IMAGE", "6G", "C:\\Course", ("powershell", "cmd"), "scale", "/usr/local/bin/windows-runtime-start"),
}
RUNTIME_ALIASES = {"win": "windows", "win10": "windows", "win11": "windows", "windows-qemu": "windows", "windows-desktop": "windows", "ubuntu": "linux", "debian": "linux"}
RUNTIME_TOKEN = re.compile(r"(?<![a-z0-9])(?:windows(?:\s*1[01])?|win1[01]|linux|ubuntu|debian)(?![a-z0-9])", re.I)


def normalize_runtime_environment(value, *, default="linux"):
    value = str(value or default).strip().lower()
    value = RUNTIME_ALIASES.get(value, value)
    if value not in RUNTIME_PROFILES:
        raise ValueError("运行环境必须选择 Linux 或 Windows。")
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
        if re.search(r"(?:不要|不用|不使用|不选|非|不需要|无需|without|not|don't\s+use)(?:\s|使用|选用|选择|用)*$", prefix, re.I):
            continue
        environment = "windows" if re.match(r"win", match.group(), re.I) else "linux"
        score = 1
        if re.search(r"(?:用|在|选择|改成|改为|换成|切换到|运行环境[：:为]?|use|using|on|switch\s+to)\s*$", prefix, re.I):
            score = 2
        if re.match(r"\s*(?:远程桌面|运行环境|环境|桌面)", suffix):
            score += 1
        choices.append((score, match.start(), environment))
    if not choices:
        return None
    strongest = max(item[0] for item in choices)
    selected = [item for item in choices if item[0] == strongest]
    if strongest == 1 and len({item[2] for item in selected}) > 1:
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
