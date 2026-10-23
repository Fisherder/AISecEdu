from .models.construction import ConstructionMembers, ConstructionReleases, ConstructionSubmissions, ConstructionTasks


def library_status(item):
    release = ConstructionReleases.query.filter_by(material_id=item.id, version=item.version, revoked=False).first()
    if not release:
        return None
    submission = ConstructionSubmissions.query.get(release.submission_id)
    task = ConstructionTasks.query.get(submission.task_id)
    return {'taskId': task.id, 'code': task.code, 'submissionId': submission.id, 'verified': True, 'version': release.version}


def guard_library_write(user, visibility):
    if visibility == 'teachers' and ConstructionMembers.query.filter_by(user_id=user.id).first():
        raise ValueError('团队创作账号请通过建设任务提交与终审入库；不能直接共享候选稿。')


def guard_import(item_id, version):
    if ConstructionReleases.query.filter_by(material_id=item_id).first() and not ConstructionReleases.query.filter_by(material_id=item_id, version=version, revoked=False).with_for_update().populate_existing().first():
        raise ValueError('该素材版本已撤销验收或尚未验收，不能导入。')
