def handle_material_add_to_module(context):
    from ..models import DojoResources
    from ..models import Dojos
    from ..models import TeachingMaterials
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _course_tool_module
    from ..api.v1.teaching import _course_tool_snapshot
    from ..api.v1.teaching import _mark_thread_attachment_placed
    from ..api.v1.teaching import _material_attachment_view
    from ..api.v1.teaching import _material_for_teacher
    from ..api.v1.teaching import _material_jobs
    from ..api.v1.teaching import _material_original_filename
    from ..api.v1.teaching import _timestamp
    import datetime
    from CTFd.models import db
    from sqlalchemy import func
    outcome = ToolResult()
    action = context.action
    user = context.user
    thread = context.thread
    dojo = context.dojo
    arguments = context.operation['arguments']
    source_material = _material_for_teacher(str(arguments.get('materialId') or ''), user, lock=True)
    if source_material.dojo_id not in {None, dojo.dojo_id}:
        raise ValueError('这份文件已归属于另一门课程，不能跨课程重复写入。')
    dojo = Dojos.query.filter_by(dojo_id=dojo.dojo_id).with_for_update().first()
    if dojo is None:
        raise ValueError('目标课程已不存在。')
    module = _course_tool_module(dojo, arguments, fallback_index=thread.module_index, lock=True)
    material = source_material
    if source_material.dojo_id is None:
        existing_material = TeachingMaterials.query.filter(TeachingMaterials.owner_id == user.id, TeachingMaterials.dojo_id == dojo.dojo_id, TeachingMaterials.sha256 == source_material.sha256, TeachingMaterials.id != source_material.id, TeachingMaterials.status != 'ARCHIVED').first()
        if existing_material is not None:
            material = existing_material
    resource_name = str(arguments.get('name') or source_material.title or source_material.filename).strip()[:128]
    if not resource_name:
        resource_name = '课程资料'
    resource = next((item for item in module.resources if str((item.data or {}).get('materialId') or '') == material.id), None)
    if resource is None:
        maximum = db.session.query(func.max(DojoResources.resource_index)).filter_by(dojo_id=dojo.dojo_id, module_index=module.module_index).scalar()
        resource_index = maximum + 1 if maximum is not None else 0
        link_text = resource_name.replace('[', '（').replace(']', '）')
        download_url = f'/pwncollege_api/v1/teaching/materials/{material.id}/download'
        resource = DojoResources(dojo_id=dojo.dojo_id, module_index=module.module_index, resource_index=resource_index, type='markdown', name=resource_name, data={'content': f'[下载《{link_text}》]({download_url})\n\n文件类型：{material.mime_type} · 大小：{material.size} 字节', 'expandable': True, 'materialId': material.id, 'filename': _material_original_filename(material), 'mimeType': material.mime_type, 'size': material.size})
        db.session.add(resource)
        db.session.flush()
    else:
        resource.name = resource_name
    if material.id == source_material.id:
        material.dojo_id = dojo.dojo_id
    placement = {'dojoId': dojo.dojo_id, 'courseReferenceId': dojo.reference_id, 'moduleIndex': module.module_index, 'moduleId': module.id, 'moduleName': module.name or module.id, 'resourceIndex': resource.resource_index, 'addedAt': _timestamp(datetime.datetime.utcnow())}
    metadata = dict(material.metadata_json or {})
    placements = [item for item in metadata.get('placements') or [] if isinstance(item, dict) and (not (item.get('dojoId') == dojo.dojo_id and item.get('moduleIndex') == module.module_index))]
    placements.append(placement)
    metadata['placements'] = placements[-50:]
    material.metadata_json = metadata
    if material.id != source_material.id:
        source_metadata = dict(source_material.metadata_json or {})
        source_metadata['mergedIntoMaterialId'] = material.id
        source_metadata['placements'] = [*[item for item in source_metadata.get('placements') or [] if isinstance(item, dict) and (not (item.get('dojoId') == dojo.dojo_id and item.get('moduleIndex') == module.module_index))], placement][-50:]
        source_material.metadata_json = source_metadata
    else:
        for analysis_job in _material_jobs(user.id, [material.id], active_only=True).values():
            analysis_job.dojo_id = dojo.dojo_id
            analysis_job.module_index = module.module_index
    _mark_thread_attachment_placed(thread, source_material.id, placement)
    thread.dojo_id = dojo.dojo_id
    thread.module_index = module.module_index
    outcome.result = {'course': _course_tool_snapshot(dojo), 'module': {'index': module.module_index, 'id': module.id, 'name': module.name or module.id, 'url': f'/{dojo.reference_id}/{module.id}'}, 'material': _material_attachment_view(material), 'resource': {'index': resource.resource_index, 'name': resource.name, 'url': f'/{dojo.reference_id}/{module.id}#module-content'}}
    outcome.href = f'/{dojo.reference_id}/{module.id}#module-content'
    outcome.card_title = '章节资料已添加'
    action.target_id = material.id
    return outcome
