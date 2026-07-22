import os

from CTFd.models import Users, db

from CTFd.plugins.dojo_plugin.models import DojoAdmins, DojoUsers, Dojos


username = os.environ.get("AISECEDU_TEACHER_USERNAME", "teacher").strip()
email = os.environ.get(
    "AISECEDU_TEACHER_EMAIL", "teacher@aisecedu.local"
).strip()
password = os.environ.get("AISECEDU_TEACHER_PASSWORD", "")
course_reference = os.environ.get(
    "AISECEDU_TEACHER_COURSE", "manual-platform-check"
).strip()

if not username or not email or not password or not course_reference:
    raise RuntimeError("Teacher username, email, password, and course are required")

course_id = course_reference.split("~", 1)[0]
course_candidates = Dojos.query.filter_by(id=course_id).all()
if "~" in course_reference:
    course_candidates = [
        course for course in course_candidates if course.reference_id == course_reference
    ]
elif len(course_candidates) > 1:
    official_candidates = [course for course in course_candidates if course.official]
    if len(official_candidates) == 1:
        course_candidates = official_candidates

if len(course_candidates) != 1:
    raise RuntimeError(
        f"Expected one course for {course_reference!r}, found {len(course_candidates)}"
    )
course = course_candidates[0]

conflicting_email = Users.query.filter(
    Users.email == email,
    Users.name != username,
).first()
if conflicting_email:
    raise RuntimeError(f"Email {email!r} is already used by another account")

user = Users.query.filter_by(name=username).first()
if user and user.type != "user":
    raise RuntimeError(f"Account {username!r} is not a regular user")
if user is None:
    user = Users(
        name=username,
        email=email,
        password=password,
        type="user",
        verified=True,
        hidden=False,
        banned=False,
    )
    db.session.add(user)
    db.session.flush()
else:
    user.email = email
    user.password = password
    user.verified = True
    user.hidden = False
    user.banned = False

membership = DojoUsers.query.filter_by(
    dojo_id=course.dojo_id,
    user_id=user.id,
).first()
if membership and membership.type != "admin":
    db.session.delete(membership)
    db.session.flush()
    membership = None
if membership is None:
    db.session.add(DojoAdmins(dojo=course, user=user))

db.session.commit()
print(f"Teacher account: {user.name}")
print(f"Teacher course: {course.reference_id} ({course.name})")
