"""Avoid N+1 relation loads on the CTFd admin submissions list."""

# aisecedu-admin-submissions-eager-v1
from flask import has_request_context, request
from sqlalchemy import event
from sqlalchemy.orm import Session, joinedload

from CTFd.models import Submissions


_installed = False


def _eager_submission_relations(execute_state):
    if not execute_state.is_select or not has_request_context():
        return
    if request.path != "/admin/submissions":
        return
    descriptions = getattr(execute_state.statement, "column_descriptions", ())
    if not any(description.get("entity") is Submissions for description in descriptions):
        return
    execute_state.statement = execute_state.statement.options(
        joinedload(Submissions.user),
        joinedload(Submissions.challenge),
    )


def install():
    global _installed
    if _installed:
        return
    event.listen(Session, "do_orm_execute", _eager_submission_relations)
    _installed = True
