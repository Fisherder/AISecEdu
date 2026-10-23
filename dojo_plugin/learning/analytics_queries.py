from sqlalchemy import and_, or_


def attempt_activity_window(session, attempt, assessment, event, start, end):
    started = attempt.started <= end
    if start is None:
        return started
    return and_(started, or_(
        attempt.started >= start,
        and_(attempt.submitted >= start, attempt.submitted <= end),
        and_(attempt.completed >= start, attempt.completed <= end),
        attempt.id.in_(session.query(assessment.attempt_id).filter(assessment.created >= start, assessment.created <= end)),
        attempt.id.in_(session.query(event.attempt_id).filter(event.occurred >= start, event.occurred <= end)),
    ))
