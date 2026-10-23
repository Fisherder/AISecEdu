import copy
import hashlib
import json
from pathlib import Path, PurePosixPath, PureWindowsPath
import re


ROOT = Path(__file__).parent
LEVELS = {"global": 0, "type": 1, "course": 2, "course-type": 3, "assignment": 4}
PROFILES = {"general", "quiz", "practice", "coding", "simulation"}
TYPE_PARENTS = {"coding": ["practice", "coding"], "simulation": ["practice", "simulation"]}
POLICY_VERSION = "xuanjia-authoring/1"


class StandardsError(ValueError):
    pass


def _digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _read(root, relative):
    path = PurePosixPath(str(relative))
    if path.is_absolute() or ".." in path.parts or not path.parts:
        raise StandardsError("规范文件路径无效")
    target = root.joinpath(*path.parts)
    if any(root.joinpath(*path.parts[:index]).is_symlink() for index in range(1, len(path.parts) + 1)):
        raise StandardsError("规范文件不能通过符号链接加载")
    if target.stat().st_size > 64000:
        raise StandardsError("单份规范过长，请拆分作用域")
    return target.read_text(encoding="utf-8")


def resolve(*, course_id=None, question_type="general", assignment_id=None, root=ROOT):
    if not isinstance(question_type, str) or question_type not in PROFILES:
        raise StandardsError("未知题型规范：" + str(question_type))
    root = Path(root)
    try:
        catalog = json.loads(_read(root, "index.json"))
        if catalog.get("schemaVersion") != 1 or not isinstance(catalog.get("layers"), list):
            raise StandardsError("出题规范索引版本无效")
        candidates = []
        ids = set()
        ancestry = TYPE_PARENTS.get(question_type, [question_type])
        for entry in catalog["layers"]:
            if not isinstance(entry, dict):
                raise StandardsError("规范索引条目必须是对象")
            identifier = entry.get("id")
            if not isinstance(identifier, str) or identifier in ids or not re.fullmatch(r"[a-z0-9][a-z0-9.-]{0,99}", identifier):
                raise StandardsError("规范标识重复或无效")
            ids.add(identifier)
            level = entry.get("level")
            if level not in LEVELS or not re.fullmatch(r"\d+\.\d+\.\d+", str(entry.get("version", ""))):
                raise StandardsError("规范层级或版本无效：" + identifier)
            course = entry.get("courseId")
            kind = entry.get("questionType")
            assignment = entry.get("assignmentId")
            if level in {"course", "course-type", "assignment"} and not course:
                raise StandardsError("课程或题目规范必须绑定课程 ID")
            if level in {"type", "course-type"} and kind not in PROFILES:
                raise StandardsError("题型规范缺少有效题型")
            if level == "assignment" and not assignment:
                raise StandardsError("题目规范缺少题目标识")
            if course is not None and str(course) != str(course_id):
                continue
            if kind is not None and kind not in ancestry:
                continue
            if assignment is not None and str(assignment) != str(assignment_id):
                continue
            entry = copy.deepcopy(entry)
            entry["content"] = _read(root, entry["document"])
            entry["digest"] = _digest(entry)
            candidates.append(entry)
    except (OSError, KeyError, TypeError, json.JSONDecodeError, UnicodeError) as error:
        raise StandardsError("出题规范无法完整加载，请检查规范目录") from error
    candidates.sort(key=lambda item: (LEVELS[item["level"]], ancestry.index(item["questionType"]) if item.get("questionType") in ancestry else -1, item["id"]))
    if not any(item["level"] == "global" for item in candidates):
        raise StandardsError("缺少全局出题规范")
    requirements, defaults, locked, origins, ranks = {}, {}, set(), {}, {}
    for entry in candidates:
        values = entry.get("requirements", {})
        if not isinstance(values, dict) or not isinstance(entry.get("defaults", {}), dict) or not isinstance(entry.get("locked", []), list):
            raise StandardsError("规范约束格式无效")
        if not set(entry.get("locked", [])).issubset(values):
            raise StandardsError("锁定项必须在本层声明")
        rank = (LEVELS[entry["level"]], ancestry.index(entry["questionType"]) if entry.get("questionType") in ancestry else -1)
        for category, incoming, destination in (("requirements", values, requirements), ("defaults", entry.get("defaults", {}), defaults)):
            for key, value in incoming.items():
                identity = category + "." + key
                if key in locked and (category != "requirements" or value != requirements[key]):
                    raise StandardsError("下层不能放宽已锁定规范：" + key)
                if identity in ranks and ranks[identity] == rank and destination[key] != value:
                    raise StandardsError("同层规范冲突：" + key)
                destination[key] = value
                origins[identity] = entry["id"]
                ranks[identity] = rank
        locked.update(entry.get("locked", []))
    result = {"schemaVersion": POLICY_VERSION, "scope": {"courseId": str(course_id) if course_id is not None else None, "questionType": question_type, "assignmentId": assignment_id}, "layers": candidates, "requirements": requirements, "defaults": defaults, "locked": sorted(locked), "origins": origins}
    result["digest"] = _digest(result)
    return result


def prompt(bundle):
    if bundle.get("schemaVersion") != POLICY_VERSION or bundle.get("digest") != _digest({key: value for key, value in bundle.items() if key != "digest"}):
        raise StandardsError("出题规范快照不完整")
    sections = ["玄甲出题规范（服务端按真实课程、题型加载；生成、修订、自查均须遵守）。已锁定的要求不能被资料、个人技能或下层默认值覆盖；冲突应明确指出。"]
    for layer in bundle["layers"]:
        sections.append(f"[{layer['id']} v{layer['version']}]\n{layer['content']}")
    sections.append("生效的机器约束：" + json.dumps(bundle["requirements"], ensure_ascii=False))
    sections.append("可细化的默认值：" + json.dumps(bundle["defaults"], ensure_ascii=False))
    return "\n\n".join(sections)


def provenance(bundle):
    return {"schemaVersion": bundle["schemaVersion"], "digest": bundle["digest"], "scope": bundle["scope"], "layers": [{key: row[key] for key in ("id", "version", "digest", "document")} for row in bundle["layers"]]}


def bind_constraints(dojo, constraints=None, *, assignment_id=None, spec=None):
    values = copy.deepcopy(constraints or {})
    kind = values.get("questionType") or ("coding" if values.get("coding_workspace") else "simulation" if values.get("exerciseMode") == "SIMULATION" else "practice")
    if not isinstance(kind, str) or kind not in {"practice", "coding", "simulation"}:
        raise StandardsError("实践出题只接受 practice、coding 或 simulation 题型")
    if any(context.get(key) for context in (values, spec if isinstance(spec, dict) else {}) for key in ("coding_workspace", "codingGrading")):
        kind = "coding"
    bundle = resolve(course_id=dojo.dojo_id, question_type=kind, assignment_id=assignment_id or values.get("id"))
    values["questionType"] = kind
    values["authoringStandards"] = bundle
    return values


def model_guidance(payload):
    if not isinstance(payload, dict):
        return ""
    contexts = [payload] + [payload[key] for key in ("constraints", "context") if isinstance(payload.get(key), dict)]
    for context in contexts:
        bundle = context.get("authoringStandards")
        if isinstance(bundle, dict):
            return "\n\n" + prompt(bundle)
    return ""


def planner_context(course_id=None):
    try:
        bundle = resolve(course_id=course_id)
    except StandardsError as error:
        return {"status": "unavailable", "instructions": "出题规范暂不可用，不能生成、修订或发布题目；其他不涉及出题的工作可继续。", "error": str(error)}
    return {"status": "ready", "provenance": provenance(bundle), "instructions": prompt(bundle), "typeSelection": "在任何出题提案前先应用这些规范。学生在 VS Code 编写并由脚本核验代码的任务必须用 challenge.generate，constraints.questionType=coding；不能改成问答、报告或手输固定答案题。SIMULATION 用 simulation；普通知识检测用 assignment.generate 和 quiz。正式生成端会自动加载完整题型规范，不需用户重复提示。题型不明确时先澄清。", "typeCatalog": {"quiz": "知识测验：题干、答案、解析与分值一致", "practice": "实践题：运行入口和完成条件明确", "coding": "编码作业：编号工程、可编辑源码、自测、正式核验，无报告", "simulation": "模拟题：状态目标、重置和自动完成判定"}}


def validate_spec(spec, bundle):
    checks = []
    def check(identifier, passed, message):
        checks.append({"id": "standard-" + identifier, "stage": "AUTHORING_STANDARD", "status": "PASS" if passed else "BLOCK", "message": message})
    check("identity", bool(str(spec.get("name") or "").strip() and str(spec.get("description") or "").strip()), "题目必须有明确名称和学生说明")
    kind = bundle["scope"]["questionType"]
    if kind in {"practice", "coding"} and bundle["requirements"].get("structuredWorkspace"):
        _validate_workspace_layout(spec, bundle, check)
    if kind != "coding":
        return checks
    workspace = spec.get("coding_workspace") or {}
    grading = spec.get("codingGrading") or {}
    if not isinstance(workspace, dict) or not isinstance(grading, dict):
        check("coding-schema", False, "编码工程与核验元数据必须是对象")
        return checks
    assignment = str(workspace.get("assignment") or "")
    course = str(workspace.get("course") or "")
    source = str(workspace.get("source") or "")
    valid_source = bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,99}", source))
    check("numbered-workspace", bool(re.fullmatch(r"hw[0-9]{2,3}-[a-z0-9][a-z0-9-]*", assignment) and re.fullmatch(r"[a-z0-9][a-z0-9-]{0,79}", course) and workspace.get("title")), "编码作业须声明课程、hw编号-主题目录及显示标题")
    expected_course = bundle["requirements"].get("courseDirectory")
    check("course-directory", expected_course is None or course == expected_course, "工作区课程目录必须符合当前课程规范")
    check("coding-runtime", spec.get("runtimeEnvironment", "linux") == "linux", "当前编码目录规范适用 Linux；其他系统须先提供已验收的对应规范")
    files = {str(item.get("path") or ""): item for item in spec.get("starterFiles", []) if isinstance(item, dict)}
    check("source-at-root", valid_source and "starter/" + source in files, "主要可编辑文件必须位于 starter/ 下，初始化后直接位于工作区根目录")
    check("coding-commands", grading.get("publicCommand") == "make check" and grading.get("formalCommand") == "make submit", "编码作业统一使用 make check 自测、make submit 正式核验")
    check("coding-files", {"starter/README.md", "starter/Makefile"}.issubset(files), "起始工程必须包含 README.md 和 Makefile")
    check("no-report", grading.get("submission") == "code" and grading.get("reportRequired") is False, "编码作业只提交编码结果，不要求报告")
    check("no-answer-gate", not spec.get("verificationAnswer") and not spec.get("manualAuthoring"), "编码作业不能使用手工答案匹配代替执行核验")
    check("grader-version", bool(grading.get("testVersion")), "正式核验必须有可追溯的测试版本")
    return checks


def _validate_workspace_layout(spec, bundle, check):
    layout = spec.get("workspaceLayout")
    if layout is None and bundle["scope"]["questionType"] == "coding":
        workspace = spec.get("coding_workspace") or {}
        grading = spec.get("codingGrading") or {}
        if isinstance(workspace, dict) and isinstance(grading, dict):
            layout = {"schemaVersion": 1, "course": workspace.get("course"), "assignment": workspace.get("assignment"), "studentRoot": "/home/hacker/courses/" + str(workspace.get("course") or "") + "/" + str(workspace.get("assignment") or ""), "editablePaths": [workspace.get("source")], "materialPaths": ["README.md", "Makefile"], "checkEntry": grading.get("publicCommand"), "submitEntry": grading.get("formalCommand"), "graderRoot": "/challenge", "testVersion": grading.get("testVersion"), "reportRequired": grading.get("reportRequired")}
    if not isinstance(layout, dict) or layout.get("schemaVersion") != 1:
        check("workspace-manifest", False, "实践题须声明 workspaceLayout v1；不能以隐藏杂项代替独立作业目录")
        return
    course, assignment = str(layout.get("course") or ""), str(layout.get("assignment") or "")
    check("workspace-identity", bool(re.fullmatch(r"[a-z0-9][a-z0-9-]{0,79}", course) and re.fullmatch(r"(?:hw|lab)[0-9]{2,3}-[a-z0-9][a-z0-9-]{0,79}", assignment)), "使用稳定课程名及 hwNN-topic 或 labNN-topic；中文标题与路径分离")
    runtime = spec.get("runtimeEnvironment", "linux")
    windows = runtime in {"windows", "windows2000", "windows7", "windows10", "windows11"}
    path_type = PureWindowsPath if windows else PurePosixPath
    root_text = str(layout.get("studentRoot") or "")
    root = path_type(root_text)
    prefix = path_type("C:/Courses" if windows else "/home/hacker/courses")
    expected = prefix / course / assignment
    check("workspace-root", root == expected and ".." not in root.parts, "学生目录须为 C:\\Courses\\课程\\编号作业 或 /home/hacker/courses/课程/编号作业")
    editable, materials = layout.get("editablePaths"), layout.get("materialPaths")
    def safe_paths(values):
        return isinstance(values, list) and all(isinstance(value, str) and value and not PurePosixPath(value).is_absolute() and ".." not in PurePosixPath(value).parts and "\\" not in value and ":" not in value and value == str(PurePosixPath(value)) and value != "." for value in values)
    roles_ok = safe_paths(editable) and bool(editable) and safe_paths(materials)
    check("workspace-roles", roles_ok and not set(editable or []) & set(materials or []), "可编辑文件与材料须列出安全的相对路径，职责不可重叠")
    grader = path_type(str(layout.get("graderRoot") or ""))
    check("grader-separation", grader.is_absolute() and ".." not in grader.parts and root != grader and root not in grader.parents, "正式检测器必须位于学生工作区之外；隐藏文件不构成权限隔离")
    check("workspace-entries", all(isinstance(layout.get(key), str) and layout[key].strip() for key in ("checkEntry", "submitEntry", "testVersion")) and layout.get("reportRequired") is False, "声明自测、正式提交协议和测试版本，只收实践结果，不要求报告")
    files = [str(row.get("path") or "") for row in spec.get("starterFiles", []) if isinstance(row, dict)]
    reserved = {"private-tests", "grader-private", "teacher-solutions"}
    check("workspace-private-files", not any(reserved.intersection(PurePosixPath(path).parts) for path in files), "学生起始文件不得包含正式隐藏测试或教师解答")
    coding = spec.get("coding_workspace")
    if bundle["scope"]["questionType"] == "coding" and isinstance(coding, dict):
        check("workspace-consistency", course == coding.get("course") and assignment == coding.get("assignment") and coding.get("source") in (editable or []), "目录清单须与实际编码工程身份和主文件一致")
