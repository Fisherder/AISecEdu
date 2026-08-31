import importlib.util
import pathlib
import re
import secrets
from types import SimpleNamespace

import pytest

from utils import DOJO_URL, TEST_DOJOS_LOCATION, create_dojo_yml, db_sql, get_user_id, login


GRADING_PATH = (
    pathlib.Path(__file__).resolve().parents[1]
    / "dojo_plugin"
    / "learning"
    / "grading.py"
)
GRADING_SPEC = importlib.util.spec_from_file_location(
    "aisecedu_coursework_grading",
    GRADING_PATH,
)
assert GRADING_SPEC and GRADING_SPEC.loader
GRADING = importlib.util.module_from_spec(GRADING_SPEC)
GRADING_SPEC.loader.exec_module(GRADING)


COURSEWORK_API = f"{DOJO_URL.rstrip('/')}/pwncollege_api/v1/coursework"
TEACHING_API = f"{DOJO_URL.rstrip('/')}/pwncollege_api/v1/teaching"
DOJOS_API = f"{DOJO_URL.rstrip('/')}/pwncollege_api/v1/dojos"


def data(response):
    body = response.json()
    assert body["success"] is True, body
    return body.get("data") or {}


def course_context(session, reference_id, role="teacher"):
    context = data(session.get(f"{TEACHING_API}/context"))
    collection = "teacherDojos" if role == "teacher" else "studentDojos"
    return next(item for item in context[collection] if item["referenceId"] == reference_id)


def enroll(session, reference_id):
    response = session.post(f"{DOJOS_API}/{reference_id}/enrollment", json={})
    assert response.status_code in {200, 201}, response.text


def test_course_enrollment_api_enforces_course_invitation_password(
    admin_session,
    random_user_session,
):
    suffix = secrets.token_hex(4)
    password = f"invite-{suffix}"
    reference_id = create_dojo_yml(
        f"""
id: protected-{suffix}
name: Protected Course {suffix}
type: course
password: {password}
modules: []
""".strip(),
        session=admin_session,
    )
    try:
        legacy = random_user_session.get(
            f"{DOJO_URL.rstrip('/')}/dojo/{reference_id}/join/{password}",
            allow_redirects=False,
        )
        assert legacy.status_code == 303
        assert password not in legacy.headers["Location"]
        assert legacy.headers["Cache-Control"].startswith("no-store")
        user_id = random_user_session.get(
            f"{DOJO_URL.rstrip('/')}/api/v1/users/me"
        ).json()["data"]["id"]
        assert db_sql(
            "SELECT COUNT(*) FROM dojo_users "
            f"WHERE dojo_id=(SELECT dojo_id FROM dojos WHERE id='protected-{suffix}') "
            f"AND user_id={int(user_id)}"
        ).strip() == "0"

        missing = random_user_session.post(
            f"{DOJOS_API}/{reference_id}/enrollment", json={}
        )
        assert missing.status_code == 403
        wrong = random_user_session.post(
            f"{DOJOS_API}/{reference_id}/enrollment",
            json={"course_password": "wrong-password"},
        )
        assert wrong.status_code == 403
        joined = random_user_session.post(
            f"{DOJOS_API}/{reference_id}/enrollment",
            json={"course_password": password},
        )
        assert joined.status_code == 201, joined.text
    finally:
        admin_session.post(
            f"{DOJO_URL.rstrip('/')}/dojo/{reference_id}/delete/",
            json={"dojo": reference_id},
        )


def test_course_code_enrollment_is_scoped_idempotent_and_rotatable(
    admin_session,
    random_user_session,
    coursework_dojo,
):
    endpoint = f"{TEACHING_API}/courses/{coursework_dojo}/join-code"
    denied = random_user_session.post(endpoint, json={})
    assert denied.status_code == 404

    prepared = admin_session.post(endpoint, json={})
    assert prepared.status_code == 200, prepared.text
    code = data(prepared)["code"]
    assert re.fullmatch(r"[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}", code)

    invalid = random_user_session.post(
        f"{DOJOS_API}/enrollment/code",
        json={"course_code": "ZZZZ-ZZZZ"},
    )
    assert invalid.status_code == 404
    assert "课程码无效" in invalid.json()["error"]

    joined = random_user_session.post(
        f"{DOJOS_API}/enrollment/code",
        json={"course_code": code.lower()},
    )
    assert joined.status_code == 201, joined.text
    joined_payload = joined.json()
    assert joined_payload["enrollment"] == {
        "courseId": coursework_dojo,
        "courseName": joined_payload["course"]["name"],
        "role": "member",
        "alreadyEnrolled": False,
    }
    assert joined_payload["course"]["learningUrl"] == (
        f"/dojo/{coursework_dojo}/learning"
    )

    repeated = random_user_session.post(
        f"{DOJOS_API}/enrollment/code",
        json={"course_code": code},
    )
    assert repeated.status_code == 200
    assert repeated.json()["enrollment"]["alreadyEnrolled"] is True

    rotated = admin_session.post(endpoint, json={"regenerate": True})
    assert rotated.status_code == 200, rotated.text
    rotated_payload = data(rotated)
    assert rotated_payload["regenerated"] is True
    assert rotated_payload["code"] != code

    expired = random_user_session.post(
        f"{DOJOS_API}/enrollment/code",
        json={"course_code": code},
    )
    assert expired.status_code == 404


@pytest.fixture
def coursework_dojo(admin_session):
    reference_id = create_dojo_yml(
        (TEST_DOJOS_LOCATION / "simple_award_dojo.yml").read_text(),
        session=admin_session,
    )
    yield reference_id
    response = admin_session.post(
        f"{DOJO_URL.rstrip('/')}/dojo/{reference_id}/delete/",
        json={"dojo": reference_id},
    )
    assert response.status_code in {200, 404}, response.text


def test_teacher_course_list_and_basic_content_management(
    admin_session,
    guest_dojo_admin,
    coursework_dojo,
):
    teacher_name, teacher_session = guest_dojo_admin
    enroll(teacher_session, coursework_dojo)
    promoted = admin_session.post(
        f"{DOJOS_API}/{coursework_dojo}/admins/promote",
        json={"user_id": get_user_id(teacher_name)},
    )
    assert promoted.status_code == 200, promoted.text

    teacher_page = teacher_session.get(f"{DOJO_URL.rstrip('/')}/teacher/courses")
    assert teacher_page.status_code == 200
    assert 'id="cs-course-list-view"' in teacher_page.text
    assert 'id="cs-course-grid"' in teacher_page.text
    assert 'id="cs-course-detail-view"' in teacher_page.text
    assert 'data-manage-kind="course"' in teacher_page.text

    course = course_context(teacher_session, coursework_dojo)
    assert course["moduleCount"] == len(course["modules"])
    assert course["challengeCount"] == sum(
        len(module["challenges"]) for module in course["modules"]
    )
    module = course["modules"][0]
    challenge = module["challenges"][0]

    renamed_course = teacher_session.patch(
        f"{TEACHING_API}/courses/{course['referenceId']}",
        json={"name": "教师内容管理验收课程"},
    )
    assert renamed_course.status_code == 200, renamed_course.text
    assert data(renamed_course)["course"]["name"] == "教师内容管理验收课程"

    renamed_module = teacher_session.patch(
        f"{TEACHING_API}/courses/{course['referenceId']}/modules/{module['index']}",
        json={"name": "已重命名章节"},
    )
    assert renamed_module.status_code == 200, renamed_module.text
    assert data(renamed_module)["module"]["name"] == "已重命名章节"

    renamed_challenge = teacher_session.patch(
        f"{DOJO_URL.rstrip('/')}/pwncollege_api/v1/learning/dojos/"
        f"{course['referenceId']}/catalog/{module['id']}/{challenge['id']}",
        json={"name": "已重命名 CTF 题目"},
    )
    assert renamed_challenge.status_code == 200, renamed_challenge.text
    assert data(renamed_challenge)["challenge"]["name"] == "已重命名 CTF 题目"

    owner_id = get_user_id(teacher_name)
    material_id = f"material_{secrets.token_hex(12)}"
    storage_key = f"tests/{material_id}.txt"
    digest = secrets.token_hex(32)
    db_sql(
        "INSERT INTO teaching_materials "
        "(id, owner_id, dojo_id, title, filename, mime_type, size, sha256, storage_key, "
        "status, metadata, created, updated) "
        f"VALUES ('{material_id}', {owner_id}, {course['id']}, '原始课件名', "
        f"'lesson.txt', 'text/plain', 12, '{digest}', '{storage_key}', 'UPLOADED', "
        "'{}'::jsonb, NOW(), NOW());"
    )
    renamed_material = teacher_session.patch(
        f"{TEACHING_API}/materials/{material_id}",
        json={"title": "Web 安全授课资料"},
    )
    assert renamed_material.status_code == 200, renamed_material.text
    assert data(renamed_material)["material"]["title"] == "Web 安全授课资料"
    deleted_material = teacher_session.delete(f"{TEACHING_API}/materials/{material_id}", json={})
    assert deleted_material.status_code == 200, deleted_material.text

    artifact_id = f"artifact_{secrets.token_hex(12)}"
    db_sql(
        "INSERT INTO teaching_artifacts "
        "(id, owner_id, dojo_id, module_index, artifact_type, title, status, "
        "current_revision, created, updated) "
        f"VALUES ('{artifact_id}', {owner_id}, {course['id']}, {module['index']}, "
        "'simulation', '原始仿真名', 'DRAFT', 1, NOW(), NOW());"
    )
    renamed_artifact = teacher_session.patch(
        f"{TEACHING_API}/artifacts/{artifact_id}",
        json={"title": "Web 攻防仿真实训"},
    )
    assert renamed_artifact.status_code == 200, renamed_artifact.text
    assert data(renamed_artifact)["artifact"]["title"] == "Web 攻防仿真实训"
    deleted_artifact = teacher_session.delete(f"{TEACHING_API}/artifacts/{artifact_id}", json={})
    assert deleted_artifact.status_code == 200, deleted_artifact.text

    created_assignment = teacher_session.post(
        f"{COURSEWORK_API}/dojos/{course['referenceId']}/assignments",
        json={
            "title": "原始任务名",
            "kind": "HOMEWORK",
            "moduleIndex": module["index"],
            "items": [
                {
                    "type": "SHORT_ANSWER",
                    "title": "说明题",
                    "prompt": "说明安全输入处理原则。",
                    "points": 10,
                    "config": {"referenceAnswer": "验证、规范化与参数化处理。"},
                }
            ],
        },
    )
    assert created_assignment.status_code == 201, created_assignment.text
    assignment_id = data(created_assignment)["assignment"]["id"]
    renamed_assignment = teacher_session.patch(
        f"{COURSEWORK_API}/assignments/{assignment_id}",
        json={"title": "安全输入处理作业"},
    )
    assert renamed_assignment.status_code == 200, renamed_assignment.text
    assert data(renamed_assignment)["assignment"]["title"] == "安全输入处理作业"
    assert teacher_session.delete(
        f"{COURSEWORK_API}/assignments/{assignment_id}", json={}
    ).status_code == 200

    deleted_challenge = teacher_session.delete(
        f"{DOJO_URL.rstrip('/')}/pwncollege_api/v1/learning/dojos/"
        f"{course['referenceId']}/catalog/{module['id']}/{challenge['id']}",
        json={},
    )
    assert deleted_challenge.status_code == 200, deleted_challenge.text
    deleted_module = teacher_session.delete(
        f"{TEACHING_API}/courses/{course['referenceId']}/modules/{module['index']}",
        json={},
    )
    assert deleted_module.status_code == 200, deleted_module.text
    deleted_course = teacher_session.delete(
        f"{TEACHING_API}/courses/{course['referenceId']}",
        json={},
    )
    assert deleted_course.status_code == 200, deleted_course.text
    assert course["referenceId"] not in {
        item["referenceId"]
        for item in data(teacher_session.get(f"{TEACHING_API}/context"))["teacherDojos"]
    }


def test_coursework_delivery_grading_isolation_and_agent_operations(
    admin_session,
    random_user,
    coursework_dojo,
):
    student_name, student_session = random_user
    enroll(student_session, coursework_dojo)
    course = course_context(admin_session, coursework_dojo)
    module = course["modules"][0]
    challenge = module["challenges"][0]

    teacher_page = admin_session.get(f"{DOJO_URL.rstrip('/')}/teacher/courses")
    assert teacher_page.status_code == 200
    assert 'id="teacher-course-center"' in teacher_page.text
    assert 'id="cs-course-list-view"' in teacher_page.text
    assert 'id="cs-course-detail-view"' in teacher_page.text
    assert 'data-cs-tab="courseware"' in teacher_page.text
    assert 'data-cs-tab="questions"' in teacher_page.text
    assert 'data-cs-tab="demos"' in teacher_page.text
    assert 'data-cs-tab="students"' in teacher_page.text
    assert 'id="cs-material-list"' in teacher_page.text
    assert 'id="cs-challenge-list"' in teacher_page.text
    assert 'data-cs-panel="questions"' in teacher_page.text
    assert 'data-cs-panel="demos"' in teacher_page.text
    assert "课程题目" in teacher_page.text
    assert "课程演示" in teacher_page.text
    assert 'id="cs-demo-create"' in teacher_page.text
    assert 'id="cs-demo-manage-toggle"' in teacher_page.text
    assert "新建演示" in teacher_page.text
    assert "生成攻防演示" not in teacher_page.text
    assert "任务与知识测评" not in teacher_page.text
    assert 'id="assessment-library"' not in teacher_page.text
    assert 'id="cs-assignment-modal"' not in teacher_page.text
    assert 'id="cs-assignment-detail"' not in teacher_page.text
    assert 'data-cs-panel="labs"' not in teacher_page.text

    learning_page = student_session.get(f"{DOJO_URL.rstrip('/')}/learning")
    assert learning_page.status_code == 200
    assert 'id="learning-assignment-list"' in learning_page.text
    assert "/learning/extend?mode=attack-defense-scene" not in learning_page.text
    extension_page = student_session.get(f"{DOJO_URL.rstrip('/')}/learning/extend?mode=debate")
    assert extension_page.status_code == 200
    assert 'id="self-learning-command"' not in extension_page.text
    assert 'id="self-learning-workspace-list"' in extension_page.text
    assert "我的创作" in extension_page.text
    assert "在 AI 学习助手中创建" in extension_page.text
    assert "只有明确要求“创建练习、课件或演示”时才会在这里产生结果" in extension_page.text
    for mode in ("slides", "attack-defense-scene", "simulation", "quiz", "debate"):
        assert f'data-self-mode="{mode}"' not in extension_page.text

    created_response = admin_session.post(
        f"{COURSEWORK_API}/dojos/{course['referenceId']}/assignments",
        json={
            "title": "Web 安全知识与实验验收",
            "kind": "QUIZ",
            "moduleIndex": module["index"],
            "description": "验证客观知识和真实 Dojo 实验结果。",
            "settings": {"allowLate": True, "allowResubmit": False, "passPercent": 60},
            "items": [
                {
                    "type": "MULTIPLE_CHOICE",
                    "title": "安全查询",
                    "prompt": "防御 SQL 注入的首选工程措施是什么？",
                    "points": 20,
                    "config": {
                        "choices": ["字符串拼接", "参数化查询", "隐藏报错"],
                        "correctAnswer": "参数化查询",
                        "explanation": "参数化查询把数据与 SQL 结构分离。",
                    },
                },
                {
                    "type": "TRUE_FALSE",
                    "title": "输出编码",
                    "prompt": "所有输出上下文都可以使用同一种编码函数。",
                    "points": 10,
                    "config": {
                        "correctAnswer": False,
                        "explanation": "编码必须与 HTML、属性、URL 或脚本上下文匹配。",
                    },
                },
                {
                    "type": "CHALLENGE",
                    "title": challenge["name"],
                    "prompt": "完成原生隔离实验。",
                    "points": 30,
                    "challengeId": challenge["challengeId"],
                    "required": True,
                },
            ],
        },
    )
    assert created_response.status_code == 201, created_response.text
    assignment = data(created_response)["assignment"]
    assignment_id = assignment["id"]
    assert assignment["status"] == "DRAFT"
    assert assignment["maxScore"] == 60
    assert assignment["items"][0]["config"]["correctAnswer"] == "参数化查询"

    student_mine = data(student_session.get(f"{COURSEWORK_API}/mine"))["assignments"]
    assert assignment_id not in {item["id"] for item in student_mine}
    assert student_session.get(f"{COURSEWORK_API}/assignments/{assignment_id}/work").status_code == 404

    published_response = admin_session.post(
        f"{COURSEWORK_API}/assignments/{assignment_id}/publish",
        json={},
    )
    assert published_response.status_code == 200, published_response.text
    assert data(published_response)["assignment"]["status"] == "PUBLISHED"

    student_assignment = data(
        student_session.get(f"{COURSEWORK_API}/assignments/{assignment_id}/work")
    )["assignment"]
    assert student_assignment["items"][0]["config"].get("correctAnswer") is None
    assert student_assignment["items"][1]["config"].get("correctAnswer") is None
    choice_id = student_assignment["items"][0]["id"]
    truth_id = student_assignment["items"][1]["id"]

    saved = student_session.post(
        f"{COURSEWORK_API}/assignments/{assignment_id}/work",
        json={"action": "save", "answers": {choice_id: "参数化查询"}},
    )
    assert saved.status_code == 200, saved.text
    stale_empty_tab = student_session.post(
        f"{COURSEWORK_API}/assignments/{assignment_id}/work",
        json={
            "action": "save",
            "answers": {choice_id: "字符串拼接"},
            "expectedUpdated": None,
        },
    )
    assert stale_empty_tab.status_code == 409, stale_empty_tab.text
    assert stale_empty_tab.json()["error"]["code"] == "REVISION_CONFLICT"
    latest_after_conflict = data(
        student_session.get(f"{COURSEWORK_API}/assignments/{assignment_id}/work")
    )["assignment"]
    assert latest_after_conflict["submission"]["answers"][choice_id] == "参数化查询"
    incomplete = student_session.post(
        f"{COURSEWORK_API}/assignments/{assignment_id}/work",
        json={"action": "submit", "answers": {choice_id: "参数化查询"}},
    )
    assert incomplete.status_code == 400

    submitted_response = student_session.post(
        f"{COURSEWORK_API}/assignments/{assignment_id}/work",
        json={
            "action": "submit",
            "answers": {choice_id: "参数化查询", truth_id: False},
        },
    )
    assert submitted_response.status_code == 201, submitted_response.text
    graded = data(submitted_response)["assignment"]
    assert graded["submission"]["status"] == "GRADED"
    assert graded["submission"]["objectiveScore"] == 30
    assert graded["submission"]["score"] == 30
    assert graded["submission"]["maxScore"] == 60
    assert graded["items"][0]["config"]["correctAnswer"] == "参数化查询"
    assert graded["items"][2]["result"]["source"] == "DETERMINISTIC"

    outsider_name = f"coursework-outsider-{secrets.token_hex(5)}"
    outsider = login(outsider_name, outsider_name, register=True)
    assert outsider.get(f"{COURSEWORK_API}/assignments/{assignment_id}/work").status_code == 404

    submissions_response = admin_session.get(
        f"{COURSEWORK_API}/assignments/{assignment_id}/submissions"
    )
    assert submissions_response.status_code == 200, submissions_response.text
    students = data(submissions_response)["students"]
    student_row = next(item for item in students if item["studentName"] == student_name)
    submission_id = student_row["submission"]["id"]
    overridden = admin_session.patch(
        f"{COURSEWORK_API}/assignments/{assignment_id}/submissions/{submission_id}",
        json={"score": 45, "feedback": "教师复核：实验思路正确，补记过程分。"},
    )
    assert overridden.status_code == 200, overridden.text
    updated_student = next(
        item for item in data(overridden)["students"] if item["studentName"] == student_name
    )
    assert updated_student["submission"]["score"] == 45
    assert updated_student["submission"]["grading"]["teacherOverride"]["score"] == 45

    thread_response = admin_session.post(
        f"{TEACHING_API}/threads",
        json={"dojoId": course["id"], "moduleIndex": module["index"], "title": "作业工具验收"},
    )
    assert thread_response.status_code == 201, thread_response.text
    thread_id = data(thread_response)["thread"]["id"]
    listed = admin_session.post(
        f"{TEACHING_API}/agent-tools/execute",
        headers={"Idempotency-Key": f"assignment-list-{secrets.token_hex(8)}"},
        json={"threadId": thread_id, "tool": "assignment.list", "arguments": {}, "confirmed": False},
    )
    assert listed.status_code == 200, listed.text
    assert assignment_id in {item["id"] for item in data(listed)["result"]["assignments"]}

    denied_close = admin_session.post(
        f"{TEACHING_API}/agent-tools/execute",
        headers={"Idempotency-Key": f"assignment-close-denied-{secrets.token_hex(8)}"},
        json={
            "threadId": thread_id,
            "tool": "assignment.close",
            "arguments": {"assignmentId": assignment_id},
            "confirmed": False,
        },
    )
    assert denied_close.status_code == 409
    closed = admin_session.post(
        f"{TEACHING_API}/agent-tools/execute",
        headers={"Idempotency-Key": f"assignment-close-{secrets.token_hex(8)}"},
        json={
            "threadId": thread_id,
            "tool": "assignment.close",
            "arguments": {"assignmentId": assignment_id},
            "confirmed": True,
        },
    )
    assert closed.status_code == 200, closed.text
    closed_data = data(closed)
    assert closed_data["result"]["assignment"]["status"] == "CLOSED"
    operation_card = next(
        card
        for message in closed_data["thread"]["messages"]
        for card in message["cards"]
        if card["type"] == "course_operation" and card["state"].get("tool") == "assignment.close"
    )
    assert operation_card["state"]["href"].startswith("/teacher/courses?")

    closed_work = student_session.get(f"{COURSEWORK_API}/assignments/{assignment_id}/work")
    assert closed_work.status_code == 200
    assert student_session.post(
        f"{COURSEWORK_API}/assignments/{assignment_id}/work",
        json={"action": "save", "answers": {choice_id: "参数化查询", truth_id: False}},
    ).status_code == 400


def test_ai_assignment_generation_returns_publishable_single_draft(
    admin_session,
    coursework_dojo,
):
    course = course_context(admin_session, coursework_dojo)
    response = admin_session.post(
        f"{COURSEWORK_API}/dojos/{course['referenceId']}/assignments/generate",
        json={
            "prompt": "生成两道关于输入验证与参数化查询的基础知识测试，题目要有明确评分标准。",
            "title": "输入安全快速测验",
            "kind": "QUIZ",
            "questionCount": 2,
            "difficulty": "FOUNDATION",
        },
    )
    assert response.status_code == 201, response.text
    assignment = data(response)["assignment"]
    assert assignment["status"] == "DRAFT"
    assert assignment["itemCount"] == 2
    assert all(item["type"] in {"MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER", "DEBATE"} for item in assignment["items"])
    generation = assignment["settings"]["generation"]
    assert generation["prompt"]
    assert generation["requestedQuestionCount"] == 2
    assert generation["generatedQuestionCount"] == 2
    assert 0 <= generation["modelGeneratedQuestionCount"] <= 2

    for invalid_count in (0, 21, 2.5, True):
        invalid = admin_session.post(
            f"{COURSEWORK_API}/dojos/{course['referenceId']}/assignments/generate",
            json={
                "prompt": "生成输入验证知识题。",
                "questionCount": invalid_count,
            },
        )
        assert invalid.status_code == 400, invalid.text


def test_open_answer_model_grade_maps_bounded_item_index_when_id_drifts():
    item = SimpleNamespace(
        id="item-server-owned-id",
        title="简答题",
        prompt="说明参数化查询为何有效。",
        points=20,
        config={"referenceAnswer": "数据与 SQL 结构分离。", "rubric": "说明分离边界。"},
    )

    questions = GRADING.build_open_grade_questions(
        [item],
        {item.id: "参数化查询把输入作为数据绑定，不再拼接到 SQL 结构中。"},
    )
    assert questions[0]["itemIndex"] == 1
    assert questions[0]["itemId"] == item.id

    grades = GRADING.map_open_grade_rows(
        [
            {
                "itemIndex": 1,
                "itemId": "model-rewritten-id",
                "score": 18,
                "feedback": "已解释数据与语句结构分离。",
                "confidence": 0.9,
            }
        ],
        [item],
    )
    assert grades == {
        item.id: {
            "score": 18,
            "feedback": "已解释数据与语句结构分离。",
            "confidence": 0.9,
        }
    }
