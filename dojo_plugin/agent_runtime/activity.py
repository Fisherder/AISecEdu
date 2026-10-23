import base64
import heapq
import json


ACTIVITY_PROTOCOL = "aisecedu.agent-activity.v2"


class InvalidActivityCursor(ValueError):
    pass


def decode_activity_cursor(value, root_id):
    if not value:
        return {}
    try:
        if not isinstance(value, str) or len(value) > 32768 or not value.startswith("v2."):
            raise ValueError()
        encoded = value[3:]
        data = json.loads(base64.b64decode(encoded + "=" * (-len(encoded) % 4), altchars=b"-_", validate=True))
        if not isinstance(data, dict) or data.get("root") != root_id:
            raise ValueError()
        positions = data.get("positions")
        if not isinstance(positions, dict) or len(positions) > 512:
            raise ValueError()
        if any(not isinstance(key, str) or not 1 <= len(key) <= 100
               or type(position) is not int or not 0 <= position <= 2147483647
               for key, position in positions.items()):
            raise ValueError()
        return positions
    except (ValueError, TypeError, UnicodeDecodeError):
        raise InvalidActivityCursor("执行记录游标无效，请重新读取记录。") from None


def encode_activity_cursor(root_id, positions):
    data = json.dumps({"root": root_id, "positions": positions}, sort_keys=True, separators=(",", ":"))
    return "v2." + base64.urlsafe_b64encode(data.encode()).decode().rstrip("=")


def activity_event_page(root_id, source_ids, read_events, cursor=None, page_size=128):
    positions = decode_activity_cursor(cursor, root_id)
    source_ids = list(dict.fromkeys(source_ids))
    page_size = max(1, min(256, int(page_size)))
    pending = []
    source_rows = {}
    source_sizes = {}
    for source_order, source_id in enumerate(source_ids):
        rows = read_events(source_id, positions.get(source_id, 0), page_size + 1)
        source_sizes[source_id] = len(rows)
        source_rows[source_id] = rows
        if rows:
            heapq.heappush(pending, (rows[0].get("created") or "", source_order, 0, source_id))
    selected = []
    while pending and len(selected) < page_size:
        _, source_order, index, source_id = heapq.heappop(pending)
        row = source_rows[source_id][index]
        sequence = row["sequence"]
        selected.append({**row, "id": f"{source_id}:{sequence}",
                         "sourceJobId": source_id, "sourceSequence": sequence})
        next_index = index + 1
        if next_index < len(source_rows[source_id]):
            next_row = source_rows[source_id][next_index]
            heapq.heappush(pending, (next_row.get("created") or "", source_order, next_index, source_id))
    delivered = {}
    for row in selected:
        source_id = row["sourceJobId"]
        positions[source_id] = max(positions.get(source_id, 0), row["sourceSequence"])
        delivered[source_id] = delivered.get(source_id, 0) + 1
    # Per-job positions remain correct when an earlier stage emits after a
    # later stage was already observed, or a new child joins the execution.
    positions = {source_id: positions.get(source_id, 0) for source_id in source_ids}
    return {"protocol": ACTIVITY_PROTOCOL, "events": selected,
            "eventCursor": encode_activity_cursor(root_id, positions),
            "hasMore": any(size > delivered.get(source_id, 0) for source_id, size in source_sizes.items())}
