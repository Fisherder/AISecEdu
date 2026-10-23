from __future__ import annotations

from dataclasses import dataclass, field
from importlib import import_module
from types import MappingProxyType
from typing import Any


@dataclass(frozen=True)
class ToolContext:
    job: Any
    operation: dict
    action: Any
    user: Any
    thread: Any
    dojo: Any
    selection: Any = None
    prepared: Any = None


@dataclass
class ToolResult:
    result: dict = field(default_factory=dict)
    href: str | None = None
    card_title: str = '课程操作'
    published_challenge: Any = None
    cleanup_packages: list = field(default_factory=list)
    cleanup_workspaces: list = field(default_factory=list)
    cleanup_course_path: Any = None
    queued_job: Any = None
    queued_jobs: list = field(default_factory=list)
    authoring_job: Any = None
    authoring_jobs: list = field(default_factory=list)


TOOL_HANDLERS = MappingProxyType({
    'module.inquiry': ('tool_handlers_inquiry', 'handle_inquiry_create'),
    'assignment.close': ('tool_handlers_assignments', 'handle_assignment_publish'),
    'assignment.delete': ('tool_handlers_assignments', 'handle_assignment_delete'),
    'assignment.generate': ('tool_handlers_assignments', 'handle_assignment_generate'),
    'assignment.grade.override': ('tool_handlers_assignments', 'handle_assignment_grade_override'),
    'assignment.list': ('tool_handlers_assignments', 'handle_assignment_list'),
    'assignment.publish': ('tool_handlers_assignments', 'handle_assignment_publish'),
    'assignment.read': ('tool_handlers_assignments', 'handle_assignment_read'),
    'assignment.submissions': ('tool_handlers_assignments', 'handle_assignment_read'),
    'assignment.update': ('tool_handlers_assignments', 'handle_assignment_update'),
    'challenge.delete': ('tool_handlers_practice', 'handle_challenge_delete'),
    'challenge.generate': ('tool_handlers_practice', 'handle_challenge_generate'),
    'challenge.publish': ('tool_handlers_practice', 'handle_challenge_publish'),
    'challenge.revise': ('tool_handlers_practice', 'handle_challenge_revise'),
    'course.create': ('tool_handlers_courses', 'handle_course_create'),
    'course.delete': ('tool_handlers_courses', 'handle_course_delete'),
    'course.list': ('tool_handlers_courses', 'handle_course_list'),
    'course.member.add': ('tool_handlers_courses', 'handle_course_member_add'),
    'course.member.remove': ('tool_handlers_courses', 'handle_course_member_add'),
    'course.members': ('tool_handlers_courses', 'handle_course_members'),
    'course.promote': ('tool_handlers_courses', 'handle_course_promote'),
    'course.read': ('tool_handlers_courses', 'handle_course_read'),
    'course.sync': ('tool_handlers_courses', 'handle_course_sync'),
    'course.update': ('tool_handlers_courses', 'handle_course_update'),
    'material.add_to_module': ('tool_handlers_materials', 'handle_material_add_to_module'),
    'module.create': ('tool_handlers_modules', 'handle_module_create'),
    'module.delete': ('tool_handlers_modules', 'handle_module_delete'),
    'module.update': ('tool_handlers_modules', 'handle_module_update'),
    'skill.create': ('tool_handlers_skills', 'handle_skill_create'),
    'skill.delete': ('tool_handlers_skills', 'handle_skill_delete'),
    'skill.import': ('tool_handlers_skills', 'handle_skill_import'),
    'skill.list': ('tool_handlers_skills', 'handle_skill_list'),
    'skill.read': ('tool_handlers_skills', 'handle_skill_read'),
    'skill.toggle': ('tool_handlers_skills', 'handle_skill_toggle'),
    'skill.update': ('tool_handlers_skills', 'handle_skill_update'),
})


def execute_handler(context):
    tool = context.operation['tool']
    target = TOOL_HANDLERS.get(tool)
    if target is None:
        raise ValueError(f'Unsupported executable tool: {tool}')
    module = import_module('.' + target[0], __package__)
    outcome = getattr(module, target[1])(context)
    if not isinstance(outcome, ToolResult):
        raise TypeError(f'Tool handler returned an invalid result: {tool}')
    return outcome
