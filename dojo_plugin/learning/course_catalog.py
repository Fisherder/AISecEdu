def _catalog_item(summary):
    activity = summary.get("recentActivity") or []
    latest = max(
        (str(item.get("updated") or "") for item in activity),
        default="",
    )
    return {
        "id": summary.get("id"),
        "referenceId": summary.get("referenceId"),
        "name": summary.get("name"),
        "description": str(summary.get("description") or "")[:320] or None,
        "access": summary.get("access"),
        "official": bool(summary.get("official")),
        "repositoryBacked": bool(summary.get("repositoryBacked")),
        "studentCount": int(summary.get("studentCount") or 0),
        "moduleCount": int(summary.get("moduleCount") or 0),
        "challengeCount": int(summary.get("challengeCount") or 0),
        "counts": summary.get("counts") or {},
        "lastActivityAt": latest or None,
    }


def pagination(page, page_size, total):
    total_pages = max(1, (int(total) + page_size - 1) // page_size)
    return {
        "page": page,
        "pageSize": page_size,
        "total": int(total),
        "totalPages": total_pages,
        "hasPrevious": page > 1,
        "hasNext": page < total_pages,
    }


def filters(args):
    query = str(args.get("q") or "").strip().casefold()[:120]
    status = str(args.get("filter") or "all").strip().lower()
    sort = str(args.get("sort") or "recent").strip().lower()
    if status not in {"all", "recent", "attention", "drafts", "published"}:
        raise ValueError("课程状态筛选无效。")
    if sort not in {"recent", "attention", "name"}:
        raise ValueError("课程排序方式无效。")
    return {"q": query, "filter": status, "sort": sort}


def page(summaries, filters, page_number, page_size):
    counts = dict.fromkeys(("total", "recent", "attention", "drafts", "published"), 0)
    matches = []
    for summary in summaries:
        item = _catalog_item(summary)
        states = item["counts"].values()
        activity = {
            "attention": sum(int(state.get("needsAttention") or 0) for state in states),
            "drafts": sum(int(state.get("draft") or 0) for state in states),
            "published": sum(int(state.get("published") or 0) for state in states),
            "recent": bool(item["lastActivityAt"]),
        }
        counts["total"] += 1
        for key, value in activity.items():
            counts[key] += value > 0
        if filters["filter"] != "all" and not activity[filters["filter"]]:
            continue
        searchable = f"{item['name'] or ''} {summary.get('description') or ''}"
        if filters["q"] and filters["q"] not in searchable.casefold():
            continue
        matches.append((item, activity["attention"]))

    def sort_key(row):
        item, attention = row
        name = str(item["name"] or "").casefold()
        recent = item["lastActivityAt"] or ""
        if filters["sort"] == "name":
            return (name,)
        if filters["sort"] == "attention":
            return attention, recent
        return recent, attention, name

    matches.sort(key=sort_key, reverse=filters["sort"] != "name")
    start = (page_number - 1) * page_size
    return {
        "items": [item for item, _ in matches[start:start + page_size]],
        "pagination": pagination(page_number, page_size, len(matches)),
        "counts": counts,
        "filters": filters,
        "capabilities": {"canCreate": True, "canRename": True, "canDelete": True},
    }
