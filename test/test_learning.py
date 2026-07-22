import secrets

from utils import DOJO_URL, solve_challenge, start_challenge, workspace_run


API = f"{DOJO_URL.rstrip('/')}/pwncollege_api/v1/learning"
COURSES_API = f"{DOJO_URL.rstrip('/')}/pwncollege_api/v1/dojos"


def test_learning_overview_and_teacher_permissions(
    admin_session,
    random_user_session,
    simple_award_dojo,
):
    overview = random_user_session.get(f"{API}/overview")
    assert overview.status_code == 200
    overview_data = overview.json()
    course = next(item for item in overview_data["courses"] if item["id"] == simple_award_dojo)
    assert course["role"] == "student"
    assert not course["enrolled"]
    assert course["studioUrl"] is None
    assert course["moduleCount"] == 1
    assert course["publishedItemCount"] == 2
    assert course["submissionCount"] == 0
    assert course["solveCount"] == 0
    assert course["modules"][0]["id"] == "hello"
    assert len(course["modules"][0]["publishedItems"]) == 2
    assert course in overview_data["availableCourses"]

    course_list = random_user_session.get(COURSES_API)
    assert course_list.status_code == 200
    course_summary = next(
        item for item in course_list.json()["dojos"] if item["id"] == simple_award_dojo
    )
    assert course_summary["moduleCount"] == 1
    assert course_summary["publishedItemCount"] == 2
    assert course_summary["requiredItemCount"] == 2

    enrollment = random_user_session.post(
        f"{COURSES_API}/{simple_award_dojo}/enrollment", json={}
    )
    assert enrollment.status_code == 201
    assert enrollment.json()["enrollment"] == {
        "courseId": simple_award_dojo,
        "role": "member",
    }
    repeated_enrollment = random_user_session.post(
        f"{COURSES_API}/{simple_award_dojo}/enrollment", json={}
    )
    assert repeated_enrollment.status_code == 200

    enrolled_overview = random_user_session.get(f"{API}/overview").json()
    enrolled_course = next(
        item
        for item in enrolled_overview["enrolledCourses"]
        if item["id"] == simple_award_dojo
    )
    assert enrolled_course["enrolled"]
    assert enrolled_overview["summary"]["enrolledCourses"] >= 1
    assert enrolled_overview["summary"]["modules"] >= 1
    assert enrolled_overview["summary"]["publishedItems"] >= 2

    dashboard = random_user_session.get(f"{API}/dojos/{simple_award_dojo}/dashboard")
    assert dashboard.status_code == 200
    assert dashboard.json()["standards"] == {
        "assessment": "60/40",
        "evidence": "hash-chain/S1-S4",
        "tutor": "Socratic hints / anti-leak",
    }
    assert len(dashboard.json()["skills"]) == 6

    denied = random_user_session.post(
        f"{API}/dojos/{simple_award_dojo}/authoring",
        json={"brief": "Create a security exercise that only teachers may publish.", "moduleId": "hello"},
    )
    assert denied.status_code == 403

    teacher_overview = admin_session.get(f"{API}/overview")
    teacher_course = next(
        item for item in teacher_overview.json()["courses"] if item["id"] == simple_award_dojo
    )
    assert teacher_course["role"] == "teacher"
    assert teacher_course["studioUrl"] == f"/dojo/{simple_award_dojo}/studio"


def test_teacher_can_add_course_unit(
    admin_session,
    random_user_session,
    simple_award_dojo,
):
    unit_id = f"teacher-unit-{secrets.token_hex(3)}"
    endpoint = f"{API}/dojos/{simple_award_dojo}/units"

    denied = random_user_session.post(
        endpoint,
        json={"id": unit_id, "name": "Unauthorized Unit"},
    )
    assert denied.status_code == 403

    invalid = admin_session.post(
        endpoint,
        json={"id": "Invalid Unit ID", "name": "Invalid Unit"},
    )
    assert invalid.status_code == 400

    created = admin_session.post(
        endpoint,
        json={
            "id": unit_id,
            "name": "Teacher Created Unit",
            "description": "A unit created from the course page teacher control.",
        },
    )
    assert created.status_code == 201
    assert created.json()["unit"] == {
        "id": unit_id,
        "name": "Teacher Created Unit",
        "description": "A unit created from the course page teacher control.",
        "url": f"/{simple_award_dojo}/{unit_id}",
    }

    duplicate = admin_session.post(
        endpoint,
        json={"id": unit_id, "name": "Duplicate Unit"},
    )
    assert duplicate.status_code == 409

    overview = admin_session.get(f"{API}/overview").json()
    course = next(item for item in overview["courses"] if item["id"] == simple_award_dojo)
    unit = next(item for item in course["modules"] if item["id"] == unit_id)
    assert unit["name"] == "Teacher Created Unit"
    assert unit["publishedItems"] == []

    page = admin_session.get(f"{DOJO_URL.rstrip('/')}/{simple_award_dojo}/{unit_id}")
    assert page.status_code == 200
    assert "Teacher Created Unit" in page.text
    assert "Add an Exercise" in page.text


def test_native_authoring_workspace_evidence_assessment_and_appeal(
    admin_session,
    random_user,
    simple_award_dojo,
):
    user_name, user_session = random_user
    challenge_id = f"evidence-{secrets.token_hex(4)}"
    verification_answer = secrets.token_hex(8)
    brief = (
        "Create a self-contained incident verification exercise for a beginner. "
        "The learner must inspect runtime evidence, validate one hypothesis, and explain remediation."
    )
    created = admin_session.post(
        f"{API}/dojos/{simple_award_dojo}/authoring",
        json={
            "brief": brief,
            "moduleId": "hello",
            "level": "L3",
            "constraints": {
                "id": challenge_id,
                "title": "Evidence Chain Verification",
                "category": "FORENSICS",
                "difficulty": 2,
                "verificationAnswer": verification_answer,
            },
        },
    )
    assert created.status_code == 201
    draft = created.json()["draft"]
    assert draft["spec"]["mode"] == "GENERATE_CUSTOM"
    assert draft["spec"]["sourceChallengeId"] is None
    assert draft["spec"]["verificationAnswer"] == verification_answer

    validated = admin_session.post(f"{API}/drafts/{draft['id']}/validate", json={})
    assert validated.status_code == 200
    assert validated.json()["success"]
    assert validated.json()["validation"]["summary"]["blocked"] == 0

    published = admin_session.post(f"{API}/drafts/{draft['id']}/publish", json={})
    assert published.status_code == 200
    assert published.json()["success"]
    challenge = published.json()["challenge"]
    assert challenge["id"] == challenge_id
    assert challenge["package"]["mode"] == "GENERATE_CUSTOM"

    revised = admin_session.post(
        f"{API}/drafts/{draft['id']}",
        json={"message": "Keep the stable identity and publish an immutable second version."},
    )
    assert revised.status_code == 200
    assert revised.json()["draft"]["revision"] == 2
    assert admin_session.post(f"{API}/drafts/{draft['id']}/validate", json={}).status_code == 200
    republished = admin_session.post(f"{API}/drafts/{draft['id']}/publish", json={})
    assert republished.status_code == 200
    assert republished.json()["challenge"]["challengeId"] == challenge["challengeId"]
    assert republished.json()["challenge"]["version"] == 2
    assert [
        item["version"] for item in republished.json()["challenge"]["package"]["history"]
    ] == [1]

    start_challenge(simple_award_dojo, "hello", challenge_id, session=user_session)
    current = user_session.get(f"{API}/attempts/current").json()["attempt"]
    assert current["status"] == "ACTIVE"
    assert current["challengeVersion"] == 2
    assert current["evidenceChain"]["valid"]
    assert [event["type"] for event in current["evidence"][:2]] == [
        "lab.started",
        "runtime.state.snapshot",
    ]

    command = "printf pwn.college{private-value}; tool --token very-secret-token"
    evidence = user_session.post(
        f"{API}/evidence",
        json={
            "type": "terminal.command.completed",
            "payload": {"command": command, "exitCode": 0},
        },
    )
    assert evidence.status_code == 200
    scrubbed = evidence.json()["event"]["payload"]["command"]
    assert "private-value" not in scrubbed
    assert "very-secret-token" not in scrubbed
    assert "[REDACTED_FLAG]" in scrubbed

    user_session.post(
        f"{API}/evidence",
        json={
            "type": "terminal.command.failed",
            "payload": {"command": "test -f /challenge/missing", "exitCode": 1},
        },
    )
    user_session.post(
        f"{API}/evidence",
        json={
            "type": "terminal.command.completed",
            "payload": {"command": "sed -n 1,4p /challenge/evidence.log", "exitCode": 0},
        },
    )
    user_session.post(
        f"{API}/evidence",
        json={
            "type": "milestone.observed",
            "payload": {"name": "confirmed-record-located"},
        },
    )
    rejected = user_session.post(
        f"{API}/evidence",
        json={"type": "arbitrary.event", "payload": {}},
    )
    assert rejected.status_code == 400

    tutor = user_session.post(
        f"{API}/tutor",
        json={"question": "How should I validate which record is trustworthy?"},
    )
    assert tutor.status_code == 200
    assert tutor.json()["reply"]["mode"] == "SOCRATIC_HINTS"
    assert "guidanceLevel" not in tutor.json()["reply"]
    assert verification_answer not in tutor.json()["reply"]["answer"]
    if tutor.json()["reply"]["provider"] == "DETERMINISTIC":
        assert "trustworthy" in tutor.json()["reply"]["answer"]

    flag = workspace_run(
        f"/challenge/check {verification_answer}",
        user=user_name,
    ).stdout.strip()
    assert flag.startswith("pwn.college{")
    solve_challenge(
        simple_award_dojo,
        "hello",
        challenge_id,
        session=user_session,
        flag=flag,
    )

    reflection = (
        "I established a clean runtime baseline, inspected each evidence record, and rejected the "
        "starting and degraded states. I then tested the confirmed verification value against the "
        "challenge oracle. The root cause was trusting state labels without corroboration; remediation "
        "is to require signed, ordered evidence and re-check the current epoch before acting."
    )
    submitted = user_session.post(
        f"{API}/attempts/{current['id']}",
        json={"reflection": reflection, "submit": True},
    )
    assert submitted.status_code == 200
    attempt = submitted.json()["attempt"]
    assert attempt["status"] == "SOLVED"
    assert attempt["objectiveScore"] == 60
    assert 60 < attempt["totalScore"] <= 100
    assert attempt["evidenceChain"]["valid"]
    assert submitted.json()["assessment"]["revision"] >= 2
    assert len(submitted.json()["assessment"]["abilities"]) == 6

    assessment_id = submitted.json()["assessment"]["id"]
    appealed = user_session.post(
        f"{API}/assessments/{assessment_id}/appeals",
        json={"reason": "Please review whether the ordered evidence and remediation justify full process credit."},
    )
    assert appealed.status_code == 201
    appeal_id = appealed.json()["appeal"]["id"]

    appeals = admin_session.get(f"{API}/dojos/{simple_award_dojo}/appeals")
    assert any(item["id"] == appeal_id for item in appeals.json()["appeals"])
    resolved = admin_session.patch(
        f"{API}/appeals/{appeal_id}",
        json={
            "status": "RESOLVED",
            "resolution": "The evidence chain is valid; the deterministic rubric was replayed.",
            "reassess": True,
        },
    )
    assert resolved.status_code == 200
    assert resolved.json()["appeal"]["status"] == "RESOLVED"

    analytics = admin_session.get(f"{API}/dojos/{simple_award_dojo}/analytics")
    assert analytics.status_code == 200
    assert analytics.json()["summary"]["attempts"] >= 1
    student = next(
        student for student in analytics.json()["students"] if student["name"] == user_name
    )
    assert all(skill["evidenceCount"] == 1 for skill in student["skills"])
