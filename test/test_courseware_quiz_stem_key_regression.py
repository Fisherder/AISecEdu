import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("courseware_quiz_stem_key_regression", ROOT / "dojo_plugin/courseware_quiz.py")
quiz = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(quiz)

QUOTE = "表达式 x > 0 的结果为真，表达式 x < 0 的结果为假。"


def materials():
    return {
        "coverage": {"complete": True},
        "sourceRefs": [{"type": "material", "id": "material-a", "revisionId": "revision-a", "sha256": "a" * 64}],
        "sourceMaterials": [{
            "id": "material-a", "title": "合成回归材料", "revisionId": "revision-a", "sha256": "a" * 64,
            "coverage": {"complete": True},
            "excerpts": [{"ordinal": 0, "sourceLocator": {"page": 1}, "content": QUOTE}],
        }],
    }


def item(prompt):
    return {
        "type": "TRUE_FALSE", "title": "合成判断题", "prompt": prompt, "points": 10,
        "config": {"correctAnswer": False, "explanation": "结果需要按符号判断。",
                   "coursewareEvidence": {"sourceId": "S1", "quote": QUOTE}},
    }


def normalize(item, position):
    return item


def review(candidate, **kwargs):
    return candidate, {"status": "MODEL_REVIEWED"}


def scripted(items):
    def call(system, payload, **kwargs):
        return {"title": "合成测验", "items": items}
    return call


def generate(questions, count):
    return quiz.generate_courseware_quiz(
        material_context=materials(), context={"course": "合成课程"}, count=count, prompt="表达式 结果",
        model="scripted-test-model", call_model=scripted(questions), normalize_item=normalize,
        review_assignment=review, standards_text="合成规范。",
    )


def test_symbols_are_preserved_in_stem_key():
    assert quiz._stem_key("表达式 x > 0 的结果是什么？") != quiz._stem_key("表达式 x < 0 的结果是什么？")
    assert quiz._stem_key("输入数值 -1 时程序如何执行？") != quiz._stem_key("输入数值 1 时程序如何执行？")
    assert quiz._stem_key("输入数值 +1 时程序如何执行？") != quiz._stem_key("输入数值 1 时程序如何执行？")
    assert quiz._stem_key("结果 x != 0 吗？") != quiz._stem_key("结果 x = 0 吗？")


def test_truly_duplicate_stems_stay_equal():
    assert quiz._stem_key("以下说法正确吗？") == quiz._stem_key("以下说法正确吗！")
    assert quiz._stem_key("以下说法正确吗？") == quiz._stem_key("以下 说法正确吗?")
    assert quiz._stem_key("Result is OK") == quiz._stem_key("  RESULT   is ok  ")


def test_generation_accepts_only_symbol_differing_questions():
    result = generate([item("表达式 x > 0 的结果是什么？"), item("表达式 x < 0 的结果是什么？")], 2)
    assert [row["prompt"] for row in result["items"]] == ["表达式 x > 0 的结果是什么？", "表达式 x < 0 的结果是什么？"]
    assert result["groundingAudit"]["acceptedCount"] == 2


def test_generation_still_deduplicates_true_repeats():
    with unittest.TestCase().assertRaises(quiz.CoursewareQuizError) as caught:
        generate([item("以下说法正确吗？"), item("以下说法正确吗！")], 2)
    assert caught.exception.code == "INSUFFICIENT_QUESTIONS"
    assert caught.exception.report["acceptedCount"] == 1


if __name__ == "__main__":
    suite = unittest.TestSuite(unittest.FunctionTestCase(value) for name, value in list(globals().items())
                               if name.startswith("test_") and callable(value))
    raise SystemExit(not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful())
