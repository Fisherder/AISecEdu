import ast
import copy
from pathlib import Path
from types import SimpleNamespace


def load_order_functions():
    root = Path(__file__).resolve().parents[1]
    sources = {
        "teaching.py": {"_question_course_order"},
        "learning.py": {"CatalogOrderError", "_catalog_order_plan"},
    }
    namespace = {"is_supported_exercise": lambda row: row.exercise_mode != "RETIRED"}
    for filename, names in sources.items():
        path = root / "dojo_plugin" / "api" / "v1" / filename
        if not path.exists():
            path = Path(__file__).with_name(filename)
        tree = ast.parse(path.read_text())
        selected = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name in names]
        assert {node.name for node in selected} == names
        exec(compile(ast.Module(body=selected, type_ignores=[]), str(path), "exec"), namespace)
    return namespace


functions = load_order_functions()
order_key = functions["_question_course_order"]
order_plan = functions["_catalog_order_plan"]


def test_course_order_uses_saved_positions_across_publication_states():
    items = [
        {"id": str(index), "moduleIndex": 0, "sortOrder": index, "title": title, "kind": "draft" if index == 1 else "published"}
        for index, title in enumerate(["第一次", "第二次", "第三次", "第十次"])
    ]
    assert sorted(reversed(items), key=order_key) == items


def test_publishing_or_renaming_does_not_change_course_position():
    items = [{"id": str(index), "moduleIndex": 0, "sortOrder": index, "kind": "draft"} for index in range(7)]
    changed = copy.deepcopy(items)
    changed[5].update(kind="published", title="新的标题", updated="2100-01-01")
    assert [item["id"] for item in sorted(reversed(changed), key=order_key)] == [item["id"] for item in items]


def test_new_drafts_follow_catalog_and_keep_creation_order_when_edited():
    items = [
        {"id": "catalog", "moduleIndex": 0, "sortOrder": 8},
        {"id": "z", "moduleIndex": 0, "sortOrder": None, "created": "2026-01-01", "updated": "2100-01-01"},
        {"id": "a", "moduleIndex": 0, "sortOrder": None, "created": "2026-01-02", "updated": "2026-01-02"},
    ]
    assert sorted(reversed(items), key=order_key) == items


def test_chapters_precede_unassigned_questions():
    items = [{"id": str(index), "moduleIndex": index, "sortOrder": 0} for index in (0, 1, 2)]
    items.append({"id": "unassigned", "moduleIndex": None, "sortOrder": None})
    assert sorted(reversed(items), key=order_key) == items


def challenge(module, index, slug, unified):
    return SimpleNamespace(module_index=module, challenge_index=index, id=slug, unified_index=unified, exercise_mode="CONTAINER")


def test_reordering_keeps_resource_slots_and_student_order_aligned():
    modules = [SimpleNamespace(id="chapter", module_index=0, name="章节", resources=[SimpleNamespace(resource_index=index) for index in (0, 2, 5)])]
    rows = [challenge(0, index, slug, unified) for index, slug, unified in [(0, "a", 1), (1, "b", 3), (2, "c", 4)]]
    plan = order_plan(modules, rows, {"modules": [{"moduleId": "chapter", "items": [{"moduleIndex": 0, "challengeIndex": index} for index in (2, 0, 1)]}]})
    assert [item["challenge"].id for item in plan["positions"]] == ["c", "a", "b"]
    assert [item["target"] for item in plan["positions"]] == [(0, 0), (0, 1), (0, 2)]
    assert [item["unifiedIndex"] for item in plan["positions"]] == [1, 3, 4]
    assert len(plan["changed"]) == 3


def test_cross_chapter_growth_places_new_slots_after_existing_resources():
    modules = [SimpleNamespace(id="a", module_index=0, name="A"), SimpleNamespace(id="b", module_index=1, name="B", resources=[SimpleNamespace(resource_index=4)])]
    rows = [challenge(0, 0, "one", 1), challenge(1, 0, "two", 2)]
    plan = order_plan(modules, rows, {"modules": [{"moduleId": "a", "items": []}, {"moduleId": "b", "items": [{"moduleIndex": 1, "challengeIndex": 0}, {"moduleIndex": 0, "challengeIndex": 0}]}]})
    assert [item["unifiedIndex"] for item in plan["positions"]] == [2, 5]


def test_order_requests_reject_stale_and_duplicate_questions():
    modules = [SimpleNamespace(id="chapter", module_index=0, name="章节")]
    rows = [challenge(0, 0, "one", 1)]
    for items in ([], [{"moduleIndex": 0, "challengeIndex": 0}] * 2):
        try:
            order_plan(modules, rows, {"modules": [{"moduleId": "chapter", "items": items}]})
        except functions["CatalogOrderError"]:
            continue
        raise AssertionError("Invalid order accepted")


if __name__ == "__main__":
    tests = [value for name, value in list(globals().items()) if name.startswith("test_") and callable(value)]
    for test in tests:
        test()
    print(f"{len(tests)} question order tests passed")
