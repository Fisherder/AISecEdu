from sqlalchemy import and_, case, func

from ..models import TeachingArtifacts, TeachingJobs


PROJECT_GENERATION_GROUPS = ("succeeded", "failed", "generating")
ACTIVE_JOB_STATUSES = ("QUEUED", "RUNNING", "CANCEL_REQUESTED")
FAILED_STATUSES = ("FAILED", "CANCELED", "CANCELLED", "VALIDATION_FAILED")
READY_ARTIFACT_STATUSES = (
    "DRAFT", "READY", "READY_TO_PUBLISH", "PUBLISHED", "COURSE_CANDIDATE",
)


def project_collection_view(
    query, owner_id, *, search="", artifact_type="", generation_status="",
    limit=200, offset=0,
):
    if generation_status not in ("", "all", *PROJECT_GENERATION_GROUPS):
        raise ValueError("请选择有效的生成状态。")
    limit = max(1, min(int(limit), 200))
    offset = max(0, int(offset))
    query = query.filter(
        TeachingArtifacts.owner_id == owner_id,
        TeachingArtifacts.dojo_id.is_(None),
        TeachingArtifacts.self_workspace_id.is_(None),
        TeachingArtifacts.status.notin_(("ARCHIVED", "DELETED")),
    )
    search = search.strip()[:240]
    if search:
        literal = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.filter(TeachingArtifacts.title.ilike(f"%{literal}%", escape="\\"))
    if artifact_type:
        query = query.filter(TeachingArtifacts.artifact_type == artifact_type[:64])

    # Equijoins avoid comparing every project with every job through a JSON OR.
    # UNION retains both links when they differ and deduplicates identical links.
    def linked_jobs(reference):
        return query.session.query(
            reference["artifactId"].as_string().label("artifact_id"),
            TeachingJobs.id.label("job_id"),
            TeachingJobs.status.label("job_status"),
            TeachingJobs.kind.label("job_kind"),
            TeachingJobs.progress.label("job_progress"),
            TeachingJobs.updated.label("job_updated"),
            TeachingJobs.created.label("job_created"),
        ).filter(
            TeachingJobs.owner_id == owner_id,
            TeachingJobs.kind.in_(("artifact.materialize", "artifact.revise")),
            reference["artifactId"].as_string().isnot(None),
        )

    links = linked_jobs(TeachingJobs.payload).union(linked_jobs(TeachingJobs.result)).subquery()
    ranked_jobs = query.join(links, links.c.artifact_id == TeachingArtifacts.id).with_entities(
        TeachingArtifacts.id.label("artifact_id"),
        links.c.job_id, links.c.job_status, links.c.job_kind,
        links.c.job_progress, links.c.job_updated,
        func.row_number().over(
            partition_by=TeachingArtifacts.id,
            order_by=(
                case((links.c.job_status.in_(ACTIVE_JOB_STATUSES), 0), else_=1),
                links.c.job_updated.desc(),
                links.c.job_created.desc(),
                links.c.job_id.desc(),
            ),
        ).label("position"),
    ).subquery()
    joined = query.outerjoin(
        ranked_jobs,
        and_(TeachingArtifacts.id == ranked_jobs.c.artifact_id, ranked_jobs.c.position == 1),
    )
    group = case(
        (ranked_jobs.c.job_status.in_(ACTIVE_JOB_STATUSES), "generating"),
        (ranked_jobs.c.job_status.in_(FAILED_STATUSES), "failed"),
        (ranked_jobs.c.job_status == "SUCCEEDED", "succeeded"),
        (TeachingArtifacts.status.in_(FAILED_STATUSES), "failed"),
        (TeachingArtifacts.status.in_(READY_ARTIFACT_STATUSES), "succeeded"),
        else_="generating",
    )
    counts = {key: 0 for key in PROJECT_GENERATION_GROUPS}
    counts.update(dict(joined.with_entities(group, func.count()).group_by(group).all()))
    counts["all"] = sum(counts.values())
    total = counts.get(generation_status or "all", counts["all"])
    if generation_status in PROJECT_GENERATION_GROUPS:
        joined = joined.filter(group == generation_status)

    # A retry may update its job without creating a new artifact or revision.
    activity_updated = case(
        (ranked_jobs.c.job_updated > TeachingArtifacts.updated, ranked_jobs.c.job_updated),
        else_=TeachingArtifacts.updated,
    )
    rows = joined.add_columns(
        group.label("generation_group"), ranked_jobs.c.job_id, ranked_jobs.c.job_status,
        ranked_jobs.c.job_kind, ranked_jobs.c.job_progress, ranked_jobs.c.job_updated,
    ).order_by(activity_updated.desc(), TeachingArtifacts.id.desc()).offset(offset).limit(limit).all()
    artifacts = []
    for artifact, category, job_id, job_status, job_kind, progress, job_updated in rows:
        artifacts.append({
            "id": artifact.id,
            "type": artifact.artifact_type,
            "title": artifact.title,
            "status": artifact.status,
            "dojoId": artifact.dojo_id,
            "moduleIndex": artifact.module_index,
            "selfWorkspaceId": artifact.self_workspace_id,
            "sortOrder": artifact.sort_order,
            "candidateId": artifact.candidate_id,
            "publishedChallengeId": artifact.published_challenge_id,
            "currentRevision": artifact.current_revision,
            "created": artifact.created.isoformat() + "Z",
            "updated": artifact.updated.isoformat() + "Z",
            "studentSafe": False,
            "generation": {
                "group": category,
                "status": job_status or artifact.status,
                "jobId": job_id,
                "kind": job_kind,
                "progress": max(0, min(100, progress)) if progress is not None else None,
                "updated": job_updated.isoformat() + "Z" if job_updated else None,
            },
        })
    return {
        "artifacts": artifacts,
        "statusCounts": counts,
        "pagination": {
            "offset": offset,
            "limit": limit,
            "total": total,
            "hasNext": offset + len(artifacts) < total,
            "nextOffset": offset + limit if offset + limit < total else None,
        },
    }
