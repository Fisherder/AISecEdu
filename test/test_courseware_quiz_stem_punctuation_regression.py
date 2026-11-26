import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("courseware_quiz_stem_punctuation_regression", ROOT / "dojo_plugin/courseware_quiz.py")
quiz = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(quiz)

QUOTE = "当输入值为 1.5 时程序返回真；表达式 obj.method 的结果为假。"


def materials():
    return {
        "coverage": {"complete": True},
        "sourceRefs": [{"type": "material", "id": "material-a", "revisionId": "revision-a", "sha256": "a" * 64}],
        "sourceMaterials": [{
            "id": "material-a", "title": "合成标点回归材料", "revisionId": "revision-a", "sha256": "a" * 64,
            "coverage": {"complete": True},
            "excerpts": [{"ordinal": 0, "sourceLocator": {"page": 1}, "content": QUOTE}],
        }],
    }


def item(prompt):
    return {
        "type": "TRUE_FALSE", "title": "合成判断题", "prompt": prompt, "points": 10,
        "config": {"correctAnswer": False, "explanation": "结果需要按标点判断。",
                   "coursewareEvidence": {"sourceId": "S1", "quote": QUOTE}},
    }


def normalize(value, position):
    return value


def review(candidate, **kwargs):
    return candidate, {"status": "MODEL_REVIEWED"}


def scripted(items):
    def call(system, payload, **kwargs):
        return {"title": "合成测验", "items": items}
    return call


def generate(questions, count):
    return quiz.generate_courseware_quiz(
        material_context=materials(), context={"course": "合成课程"}, count=count, prompt="输入值 程序 结果",
        model="scripted-test-model", call_model=scripted(questions), normalize_item=normalize,
        review_assignment=review, standards_text="合成规范。",
    )


def test_decimal_point_and_member_access_stay_significant():
    assert quiz._stem_key("值为 1.5 时程序如何执行？") != quiz._stem_key("值为 15 时程序如何执行？")
    assert quiz._stem_key("表达式 obj.method 求值结果如何？") != quiz._stem_key("表达式 objmethod 求值结果如何？")
    assert quiz._stem_key("a.b") == quiz._stem_key("a . b")


def test_sentence_punctuation_and_spacing_stay_ignorable():
    assert quiz._stem_key("值为 1.5。") == quiz._stem_key("值为 1.5")
    assert quiz._stem_key("the value is 1.5.") == quiz._stem_key("the value is 1.5")
    assert quiz._stem_key("以下说法正确吗？") == quiz._stem_key("以下说法正确吗！")
    assert quiz._stem_key("Result is OK") == quiz._stem_key("  RESULT   is ok  ")


def test_generation_accepts_questions_differing_only_by_punctuation():
    decimal = generate([item("值为 1.5 时程序如何执行？"), item("值为 15 时程序如何执行？")], 2)
    assert [row["prompt"] for row in decimal["items"]] == ["值为 1.5 时程序如何执行？", "值为 15 时程序如何执行？"]
    assert decimal["groundingAudit"]["acceptedCount"] == 2
    member = generate([item("表达式 obj.method 求值结果如何？"), item("表达式 objmethod 求值结果如何？")], 2)
    assert [row["prompt"] for row in member["items"]] == ["表达式 obj.method 求值结果如何？", "表达式 objmethod 求值结果如何？"]
    assert member["groundingAudit"]["acceptedCount"] == 2


def test_generation_still_rejects_true_punctuation_repeats():
    with unittest.TestCase().assertRaises(quiz.CoursewareQuizError) as caught:
        generate([item("以下说法正确吗？"), item("以下说法正确吗！")], 2)
    assert caught.exception.code == "INSUFFICIENT_QUESTIONS"
    assert caught.exception.report["acceptedCount"] == 1


if __name__ == "__main__":
    suite = unittest.TestSuite(unittest.FunctionTestCase(value) for name, value in list(globals().items())
                               if name.startswith("test_") and callable(value))
    raise SystemExit(not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful())
