import secrets

from CTFd.models import Users, db

from .agent_runtime.scope import ScopeError
from .construction import Batch, Course, Member, Task, access, audit, is_manager
from .course_codes import ensure_course_join_code
from .models import DojoAdmins, DojoModules, DojoUsers, Dojos


def assign_teacher_courses(actor, batch_id, usernames):
    batch, manager = access(actor, batch_id, manage=True, lock=True)
    if not is_manager(actor, manager, batch):
        raise ScopeError('只有建设统筹人员可以分配教师课程。')
    result = []
    for username in usernames:
        user = Users.query.filter_by(name=username, banned=False).one()
        member = Member.query.filter_by(batch_id=batch.id, user_id=user.id, active=True, role='author').with_for_update().one()
        tasks = Task.query.join(Course, Course.id == Task.course_id).filter(
            Course.batch_id == batch.id, Task.owner_id == user.id, Task.status != 'canceled').order_by(Task.code).all()
        if len(tasks) != (member.data or {}).get('projectsRequired', 2):
            raise ValueError('成员当前认领任务数量与分配要求不一致。')
        claimed = {task.course_id for task in tasks}
        courses = Course.query.filter(Course.id.in_(claimed)).order_by(Course.code).all()
        bindings = dict((member.data or {}).get('courseBindings', {}))
        for course in courses:
            dojo = Dojos.query.filter_by(dojo_id=bindings[course.id]).first() if course.id in bindings else None
            if dojo:
                if (dojo.data or {}).get('constructionOwnerId') != user.id or (dojo.data or {}).get('constructionCourseId') != course.id:
                    raise ValueError('已有教师课程绑定不一致，请先核对。')
            else:
                candidates = Dojos.query.filter(
                    Dojos.data['constructionBatchId'].as_string() == batch.id,
                    Dojos.data['constructionCourseId'].as_string() == course.id,
                    Dojos.data['constructionOwnerId'].as_integer() == user.id).all()
                if len(candidates) > 1:
                    raise ValueError('教师课程存在重复分配，请先核对。')
                dojo = candidates[0] if candidates else None
            created = dojo is None
            if created:
                dojo = Dojos(id='build-' + secrets.token_hex(10), name=course.name, type='course',
                             private_key=secrets.token_hex(32),
                             description='根据已认领的建设任务创作课程内容，完成后从建设任务提交审核。',
                             data={'constructionBatchId': batch.id, 'constructionCourseId': course.id,
                                   'constructionOwnerId': user.id})
                db.session.add(dojo)
                db.session.flush()
                db.session.add(DojoModules(dojo=dojo, module_index=0, id='authoring', name='课程内容创作',
                                          description='本课程生成项目可提交到对应建设任务。', show_scoreboard=False,
                                          show_challenges=True))
            if (dojo.data or {}).get('archived'):
                raise ValueError('已分配的教师课程被归档，请先处理。')
            membership = DojoUsers.query.filter_by(dojo_id=dojo.dojo_id, user_id=user.id).first()
            if membership and membership.type != 'admin':
                db.session.delete(membership)
                db.session.flush()
                membership = None
            if membership is None:
                db.session.add(DojoAdmins(dojo_id=dojo.dojo_id, user_id=user.id))
            ensure_course_join_code(dojo)
            bindings[course.id] = dojo.dojo_id
            audit(batch, actor, 'member.assign_teacher_course', memberId=member.id, userId=user.id,
                  constructionCourseId=course.id, courseId=dojo.dojo_id, courseName=dojo.name, created=created)
        member.data = {**(member.data or {}), 'accountRole': 'teacher',
                       'assignedCourseNames': [course.name for course in courses], 'courseBindings': bindings}
        result.append({'name': member.name, 'username': user.name, 'role': '教师',
                       'courses': [{'name': course.name, 'courseId': bindings[course.id],
                                    'projects': sum(t.course_id == course.id for t in tasks)} for course in courses]})
    db.session.flush()
    return result
