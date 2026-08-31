from .contracts import ResourceSummary, page_info
from .resources import resolve_resource


def resource_summary(resource_type, resource_id, user=None):
    return resolve_resource(resource_type, resource_id, user).as_dict()


def collection(items, *, page=1, page_size=24, total=None, request_id=None):
    rows = list(items or [])
    return {
        "items": rows,
        "pageInfo": page_info(
            page=page,
            page_size=page_size,
            total=len(rows) if total is None else total,
        ),
        "requestId": request_id,
    }
