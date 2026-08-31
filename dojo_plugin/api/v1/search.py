from urllib.parse import quote

from flask import request
from flask_restx import Namespace, Resource
from sqlalchemy.sql import or_

from CTFd.utils.decorators import authed_only
from CTFd.utils.user import get_current_user

from ...learning.exercise_modes import is_retired_exercise
from ...models import (
    DojoAdmins,
    DojoChallenges,
    DojoModules,
    DojoUsers,
    Dojos,
    LearningAttempts,
    SelfLearningWorkspaces,
    TeachingArtifacts,
    TeachingAssignments,
)


search_namespace = Namespace("search", description="搜索学习内容")


def _text(value):
    return " ".join(str(value or "").split())


def _matches(needle, *values):
    return needle in " ".join(_text(value) for value in values).casefold()


@search_namespace.route("")
class Search(Resource):
    @authed_only
    def get(self):
        query = _text(request.args.get("q"))[:120]
        if len(query) < 2:
            return {"success": False, "error": "搜索关键词至少需要两个字符。"}, 400

        user = get_current_user()
        needle = query.casefold()
        like_query = f"%{query}%"
        memberships = DojoUsers.query.filter_by(user_id=user.id).all()
        dojo_ids = {row.dojo_id for row in memberships}
        if getattr(user, "type", None) == "admin":
            dojo_ids.update(row.dojo_id for row in Dojos.query.with_entities(Dojos.dojo_id))
        else:
            dojo_ids.update(
                row.dojo_id for row in DojoAdmins.query.filter_by(user_id=user.id).all()
            )

        courses = []
        if dojo_ids:
            rows = (
                Dojos.query.filter(
                    Dojos.dojo_id.in_(dojo_ids),
                    or_(Dojos.name.ilike(like_query), Dojos.description.ilike(like_query)),
                )
                .order_by(Dojos.name)
                .limit(8)
                .all()
            )
            courses = [
                {
                    "id": row.reference_id,
                    "name": row.name or "未命名课程",
                    "link": f"/dojo/{quote(row.reference_id)}/learning",
                    "description": _text(row.description),
                    "kind": "课程",
                }
                for row in rows
            ]

        module_rows = []
        challenge_rows = []
        if dojo_ids:
            module_rows = (
                DojoModules.query.filter(
                    DojoModules.dojo_id.in_(dojo_ids),
                    or_(
                        DojoModules.name.ilike(like_query),
                        DojoModules.description.ilike(like_query),
                    ),
                )
                .order_by(DojoModules.dojo_id, DojoModules.module_index)
                .limit(12)
                .all()
            )
            challenge_candidates = (
                DojoChallenges.query.filter(
                    DojoChallenges.dojo_id.in_(dojo_ids),
                    or_(
                        DojoChallenges.name.ilike(like_query),
                        DojoChallenges.description.ilike(like_query),
                    ),
                )
                .order_by(
                    DojoChallenges.dojo_id,
                    DojoChallenges.module_index,
                    DojoChallenges.challenge_index,
                )
                .limit(40)
                .all()
            )
            challenge_rows = [
                row
                for row in challenge_candidates
                if row.visible() and not is_retired_exercise(row)
            ][:12]

        content = [
            {
                "id": f"{row.dojo.reference_id}:{row.id}",
                "name": row.name or "未命名章节",
                "link": f"/{quote(row.dojo.reference_id)}/{quote(row.id)}",
                "description": _text(row.description),
                "context": row.dojo.name or "课程",
                "kind": "章节",
            }
            for row in module_rows
        ]
        content.extend(
            {
                "id": f"{row.dojo.reference_id}:{row.module.id}:{row.id}",
                "name": row.name or "未命名题目",
                "link": f"/{quote(row.dojo.reference_id)}/{quote(row.module.id)}/{quote(row.id)}",
                "description": _text(row.description),
                "context": f"{row.dojo.name or '课程'} / {row.module.name or '章节'}",
                "kind": "题目",
            }
            for row in challenge_rows
        )

        assignments = []
        if dojo_ids:
            assignment_rows = (
                TeachingAssignments.query.filter(
                    TeachingAssignments.dojo_id.in_(dojo_ids),
                    TeachingAssignments.status.in_(["PUBLISHED", "CLOSED"]),
                    or_(
                        TeachingAssignments.title.ilike(like_query),
                        TeachingAssignments.description.ilike(like_query),
                        TeachingAssignments.instructions.ilike(like_query),
                    ),
                )
                .order_by(TeachingAssignments.due_at, TeachingAssignments.updated.desc())
                .limit(8)
                .all()
            )
            assignments = [
                {
                    "id": row.id,
                    "name": row.title,
                    "link": f"/learning/assignments/{quote(row.id)}",
                    "description": _text(row.description or row.instructions),
                    "context": row.dojo.name or "课程",
                    "kind": "作业",
                }
                for row in assignment_rows
            ]

        artifact_rows = (
            TeachingArtifacts.query.join(
                SelfLearningWorkspaces,
                SelfLearningWorkspaces.id == TeachingArtifacts.self_workspace_id,
            )
            .filter(
                TeachingArtifacts.owner_id == user.id,
                SelfLearningWorkspaces.student_id == user.id,
                TeachingArtifacts.self_workspace_id.isnot(None),
                TeachingArtifacts.status.notin_(["ARCHIVED", "DELETED"]),
                SelfLearningWorkspaces.status != "ARCHIVED",
                or_(
                    TeachingArtifacts.title.ilike(like_query),
                    SelfLearningWorkspaces.title.ilike(like_query),
                    SelfLearningWorkspaces.goal.ilike(like_query),
                ),
            )
            .order_by(TeachingArtifacts.updated.desc())
            .limit(30)
            .all()
        )
        creations = []
        seen_workspaces = set()
        for row in artifact_rows:
            if row.self_workspace_id in seen_workspaces:
                continue
            seen_workspaces.add(row.self_workspace_id)
            creations.append(
                {
                    "id": row.id,
                    "name": row.title,
                    "link": f"/learning/artifacts/{quote(row.id)}?returnTo=/learning/extend",
                    "description": "仅自己可见的个人创作",
                    "kind": "我的创作",
                }
            )
            if len(creations) >= 8:
                break

        recent = []
        seen_recent = set()
        recent_attempts = (
            LearningAttempts.query.filter_by(user_id=user.id)
            .order_by(LearningAttempts.started.desc())
            .limit(30)
            .all()
        )
        for attempt in recent_attempts:
            row = attempt.dojo_challenge
            if (
                row is None
                or row.dojo_id not in dojo_ids
                or not row.visible()
                or is_retired_exercise(row)
                or not _matches(needle, row.name, row.description, row.module.name, row.dojo.name)
            ):
                continue
            key = (row.dojo_id, row.module_index, row.challenge_index)
            if key in seen_recent:
                continue
            seen_recent.add(key)
            recent.append(
                {
                    "id": f"recent:{row.dojo.reference_id}:{row.module.id}:{row.id}",
                    "name": row.name or "未命名题目",
                    "link": f"/{quote(row.dojo.reference_id)}/{quote(row.module.id)}/{quote(row.id)}",
                    "description": "继续最近学习",
                    "context": f"{row.dojo.name or '课程'} / {row.module.name or '章节'}",
                    "kind": "最近学习",
                }
            )
            if len(recent) >= 5:
                break

        legacy_modules = [item for item in content if item["kind"] == "章节"]
        legacy_challenges = [item for item in content if item["kind"] == "题目"]
        return {
            "success": True,
            "query": query,
            "results": {
                "recent": recent,
                "courses": courses,
                "content": content,
                "assignments": assignments,
                "creations": creations,
                "dojos": courses,
                "modules": legacy_modules,
                "challenges": legacy_challenges,
            },
        }
