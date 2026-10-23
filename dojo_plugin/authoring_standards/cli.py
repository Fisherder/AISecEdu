import argparse
import importlib.util
import json
from pathlib import Path


spec = importlib.util.spec_from_file_location("xuanjia_standards", Path(__file__).with_name("__init__.py"))
standards = importlib.util.module_from_spec(spec)
spec.loader.exec_module(standards)


def main():
    parser = argparse.ArgumentParser(description="玄甲出题规范：读取、检查索引或校验题目 JSON")
    parser.add_argument("command", choices=["resolve", "lint", "validate"])
    parser.add_argument("--course")
    parser.add_argument("--type", choices=sorted(standards.PROFILES), default="general")
    parser.add_argument("--assignment")
    parser.add_argument("--spec")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    if args.command == "lint":
        index = json.loads((standards.ROOT / "index.json").read_text())
        scopes = {(None, "general", None)}
        for entry in index["layers"]:
            scopes.add((entry.get("courseId"), entry.get("questionType", "general"), entry.get("assignmentId")))
        courses = {entry.get("courseId") for entry in index["layers"]}
        scopes.update((course, kind, None) for course in courses for kind in standards.PROFILES)
        for course, kind, assignment in scopes:
            standards.resolve(course_id=course, question_type=kind, assignment_id=assignment)
        print(json.dumps({"status": "PASS", "layers": len(index["layers"]), "scopesChecked": len(scopes)}))
        return 0
    bundle = standards.resolve(course_id=args.course, question_type=args.type, assignment_id=args.assignment)
    if args.command == "validate":
        if not args.spec:
            parser.error("validate 需要 --spec 题目JSON路径")
        checks = standards.validate_spec(json.loads(Path(args.spec).read_text()), bundle)
        passed = all(row["status"] == "PASS" for row in checks)
        print(json.dumps({"status": "PASS" if passed else "BLOCK", "standards": standards.provenance(bundle), "checks": checks}, ensure_ascii=False, indent=2))
        return 0 if passed else 1
    print(json.dumps(bundle, ensure_ascii=False, indent=2) if args.json else standards.prompt(bundle))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except standards.StandardsError as error:
        print(str(error))
        raise SystemExit(2)
