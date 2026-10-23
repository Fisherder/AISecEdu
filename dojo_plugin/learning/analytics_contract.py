import datetime


def utc_naive(value):
    if value is None:
        return None
    return value.astimezone(datetime.timezone.utc).replace(tzinfo=None) if value.tzinfo else value


def week_start(value):
    value = utc_naive(value)
    return datetime.datetime.combine(value.date() - datetime.timedelta(days=value.weekday()), datetime.time.min)


def in_window(value, start, end):
    value = utc_naive(value)
    return value is not None and (start is None or value >= utc_naive(start)) and value <= utc_naive(end)


def ratio(numerator, denominator, digits=4):
    return round(numerator / denominator, digits) if denominator else None


def assignment_snapshot(assignments, submissions, now):
    """Current task status is independent of the selected activity window."""
    current = {row.assignment_id: row for row in submissions if in_window(row.updated, None, now)}
    items = []
    for assignment in assignments:
        submission = current.get(assignment.id)
        status = submission.status if submission else 'NOT_STARTED'
        completed = status in {'SUBMITTED', 'GRADED'}
        score = (round(100 * float(submission.total_score) / float(submission.max_score), 1)
                 if submission and status == 'GRADED' and submission.max_score else None)
        items.append({
            'id': assignment.id, 'title': assignment.title, 'status': status,
            'dueAt': utc_naive(assignment.due_at).isoformat() + 'Z' if assignment.due_at else None,
            'overdue': bool(assignment.due_at and utc_naive(assignment.due_at) < utc_naive(now) and not completed),
            'scorePercent': score,
            'updated': utc_naive(submission.updated).isoformat() + 'Z' if submission else None,
        })
    scores = [row['scorePercent'] for row in items if row['scorePercent'] is not None]
    return {
        'assigned': len(items), 'submitted': sum(row['status'] in {'SUBMITTED', 'GRADED'} for row in items),
        'overdue': sum(row['overdue'] for row in items), 'averageScore': ratio(sum(scores), len(scores), 1),
        'items': items, 'scope': 'current-state', 'asOf': utc_naive(now).isoformat() + 'Z',
    }


def module_rollup(module, rows, student_count):
    required = [row for row in rows if row['required']]
    attempted = sum(row['attemptedStudents'] for row in rows)
    solved = sum(row['solvedStudents'] for row in rows)
    required_solved = sum(row['solvedStudents'] for row in required)
    assessed = [row for row in rows if row.get('assessmentCount') and row.get('averageAssessment') is not None]
    assessment_count = sum(row['assessmentCount'] for row in assessed)
    observed = [row for row in rows if row['attemptedStudents']]
    bottleneck = max(observed, key=lambda row: row['attentionScore'], default=None)
    return {
        **module,
        'challengeCount': len(rows), 'requiredChallengeCount': len(required),
        'requiredSolvedPairs': required_solved,
        'requiredPairs': student_count * len(required),
        'attemptedPairs': attempted, 'solvedPairs': solved,
        'requiredCompletionRate': ratio(required_solved, student_count * len(required)),
        'participationRate': ratio(attempted, student_count * len(rows)),
        'attemptSuccessRate': ratio(solved, attempted),
        'assessmentCount': assessment_count,
        'averageAssessment': ratio(sum(row['averageAssessment'] * row['assessmentCount'] for row in assessed), assessment_count, 1),
        'bottleneck': {'challengeId': bottleneck['id'], 'name': bottleneck['name'], 'attentionScore': bottleneck['attentionScore']} if bottleneck else None,
    }


def activity_timeline(start, end, attempts, solves, assessments, evidence, submissions=(), first_activity=None):
    """Evidence rows are already window-filtered (week, count, real user id)."""
    dates = [utc_naive(row[0]) for rows in (attempts, solves, assessments, submissions) for row in rows if in_window(row[0], start, end)]
    dates.extend(utc_naive(row[0]) for row in evidence)
    if first_activity is not None:
        dates.append(utc_naive(first_activity))
    first_week = week_start(start or min(dates, default=end))
    last_week = week_start(end)
    truncated = (last_week - first_week).days // 7 >= 52
    first_week = max(first_week, last_week - datetime.timedelta(weeks=51))
    buckets = {}
    for index in range((last_week - first_week).days // 7 + 1):
        date = first_week + datetime.timedelta(weeks=index)
        buckets[date] = {'start': date.isoformat() + 'Z', 'label': f'{date.month}/{date.day}',
                         'users': set(), 'attempts': 0, 'solves': 0, 'assessments': 0, 'evidence': 0, 'submissions': 0}
    for key, rows in (('attempts', attempts), ('solves', solves), ('assessments', assessments), ('submissions', submissions)):
        for date, user_id in rows:
            if in_window(date, start, end) and week_start(date) in buckets:
                bucket = buckets[week_start(date)]
                bucket[key] += 1
                bucket['users'].add(user_id)
    for date, count, user_id in evidence:
        bucket = buckets.get(week_start(date))
        if bucket is not None:
            bucket['evidence'] += int(count)
            bucket['users'].add(user_id)
    rows = [{**{key: value for key, value in bucket.items() if key != 'users'}, 'activeStudents': len(bucket['users'])} for bucket in buckets.values()]
    return rows, {'start': first_week.isoformat() + 'Z', 'end': utc_naive(end).isoformat() + 'Z',
                  'windowStart': utc_naive(start).isoformat() + 'Z' if start else None,
                  'bucket': 'week', 'timezone': 'UTC', 'truncated': truncated}
