from copy import deepcopy


def assignment_agent_observation(result):
    assignment = result.get("assignment")
    if not isinstance(assignment, dict) or not isinstance(assignment.get("items"), list):
        raise ValueError("Assignment observation requires structured assignment data")
    fields = ("id", "dojoId", "moduleIndex", "kind", "title", "description", "instructions", "status", "dueAt", "maxScore", "items")
    value = {key: deepcopy(assignment[key]) for key in fields if key in assignment}
    course = result.get("course") or {}
    return {
        "course": {key: deepcopy(course[key]) for key in ("id", "name", "referenceId") if key in course},
        "assignment": value,
        "sourceOfTruth": "saved-assignment",
        "completeItems": True,
        "itemCount": len(value.get("items", [])),
    }
