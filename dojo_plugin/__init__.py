from . import submission_query_optimization
import datetime
import base64
import gzip
import hashlib
import json
import logging
import sys
import os
import pathlib
import uuid

from email.message import EmailMessage
from email.utils import formatdate
from urllib.parse import urlparse, urlunparse

from flask import Response, jsonify, render_template, request, redirect, current_app
from itsdangerous.exc import BadSignature
from marshmallow_sqlalchemy import field_for
from sqlalchemy import inspect, text
from CTFd.models import db, Challenges, Users, Solves
from CTFd.utils.user import get_current_user
from CTFd.plugins import bypass_csrf_protection, register_admin_plugin_menu_bar
from CTFd.plugins.challenges import CHALLENGE_CLASSES, BaseChallenge
from CTFd.plugins.flags import FLAG_CLASSES, BaseFlag, FlagException

from .models import (
    Belts,
    DojoChallenges,
    Dojos,
    Emojis,
)
from .config import DOJO_HOST, DOJO_IP_MODE, bootstrap
from .utils import unserialize_user_flag, render_markdown
from .utils.dojo import get_current_dojo_challenge
from .utils.awards import update_awards
from .utils.feed import publish_challenge_solve
from .utils.query_timer import init_query_timer
from .utils.request_logging import get_trace_id, setup_logging, setup_trace_id_tracking, setup_uncaught_error_logging
from .learning.student_experience import error_contract, student_ux_rollout
from .product.capabilities import build_ui_bootstrap
from .product.metadata import page_metadata
from .pages.dojos import dojos, dojos_override
from .pages.dojo import dojo
from .pages.workspace import workspace
from .pages.sensai import sensai
from .pages.admin_product import (
    admin_challenges,
    admin_config,
    admin_overview,
    admin_submissions,
    admin_users,
)
from .pages.users import users
from .pages.settings import settings_override
from .pages.discord import discord
from .pages.course import course
from .pages.belts import belts
from .pages.research import research
from .pages.feed import feed
from .pages.index import static_html_override
from .pages.test_error import test_error_pages
from .pages.learning import learning as learning_pages
from .api import api
from .utils.events import publish_queued_events
from .utils import listeners
from .agent_runtime.metrics import record_teaching_api_response


REMOVED_PLATFORM_TABLES = (
    "course_activity_responses",
    "course_resources",
    "course_activities",
    "course_profiles",
    "openmaic_launch_tickets",
)


def enable_agent_runtime_service_csrf_bypass(app):
    """Exempt only service-authenticated global-agent runtime routes from CSRF.

    Flask-RESTX registers a generated view function for each Resource, so a
    decorator on the Resource method is not visible to CTFd's CSRF hook. Mark
    the generated functions after blueprint registration instead. The browser
    launch endpoint remains CSRF protected.
    """

    prefix = "/pwncollege_api/v1/teaching/runtime/"
    launch_path = f"{prefix}launch"
    for rule in app.url_map.iter_rules():
        if rule.rule.startswith(prefix) and rule.rule != launch_path:
            view = app.view_functions.get(rule.endpoint)
            if view is not None:
                bypass_csrf_protection(view)


def drop_removed_platform_tables():
    if db.engine.dialect.name == "postgresql":
        db.session.execute(
            text(
                "SELECT pg_advisory_xact_lock("
                "hashtextextended('aisecedu.drop_removed_platform_tables', 0))"
            )
        )
    inspector = inspect(db.session.connection())
    existing = set(inspector.get_table_names())
    targets = [name for name in REMOVED_PLATFORM_TABLES if name in existing]
    if not targets:
        db.session.rollback()
        return []
    snapshot_root = pathlib.Path(
        os.getenv("PLATFORM_REMOVAL_SNAPSHOT_ROOT")
        or os.getenv("COURSE_SYSTEM_REMOVAL_SNAPSHOT_ROOT")
        or "/data/platform-removal"
    )
    snapshot_root.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(snapshot_root, 0o700)
    stamp = datetime.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    snapshot = snapshot_root / f"removed-platform-{stamp}-{os.getpid()}.jsonl.gz"
    temporary = snapshot.with_suffix(snapshot.suffix + ".tmp")
    temporary.touch(mode=0o600, exist_ok=False)
    counts = {}
    table_metadata = {}
    with gzip.open(temporary, "wt", encoding="utf-8") as handle:
        for table_name in targets:
            counts[table_name] = db.session.execute(
                text(f'SELECT COUNT(*) FROM "{table_name}"')
            ).scalar_one()
            table_metadata[table_name] = {
                "columns": [
                    {
                        "name": column["name"],
                        "type": str(column["type"]),
                        "nullable": column.get("nullable"),
                    }
                    for column in inspector.get_columns(table_name)
                ],
                "primaryKey": inspector.get_pk_constraint(table_name),
                "foreignKeys": inspector.get_foreign_keys(table_name),
                "indexes": inspector.get_indexes(table_name),
            }
        handle.write(
            json.dumps(
                {
                    "type": "manifest",
                    "created": stamp,
                    "tables": table_metadata,
                    "counts": counts,
                },
                ensure_ascii=False,
                default=str,
            )
            + "\n"
        )
        for table_name in targets:
            rows = db.session.execute(text(f'SELECT * FROM "{table_name}"')).mappings()
            for row in rows:
                values = {}
                for key, value in row.items():
                    if isinstance(value, bytes):
                        values[key] = {
                            "encoding": "base64",
                            "value": base64.b64encode(value).decode("ascii"),
                        }
                    elif isinstance(value, (datetime.date, datetime.datetime)):
                        values[key] = value.isoformat()
                    else:
                        values[key] = value
                handle.write(
                    json.dumps(
                        {"type": "row", "table": table_name, "data": values},
                        ensure_ascii=False,
                        default=str,
                    )
                    + "\n"
                )
    os.chmod(temporary, 0o600)
    temporary.replace(snapshot)
    with snapshot.open("rb") as handle:
        snapshot_sha256 = hashlib.file_digest(handle, "sha256").hexdigest()
    for table_name in targets:
        db.session.execute(text(f'DROP TABLE IF EXISTS "{table_name}"'))
    db.session.commit()
    logging.getLogger(__name__).warning(
        "Removed superseded course-system tables after snapshot %s (%s): %s",
        snapshot,
        snapshot_sha256,
        ", ".join(targets),
    )
    return {"tables": targets, "counts": counts, "snapshot": str(snapshot), "sha256": snapshot_sha256}


def _reconcile_teaching_thread_schema():
    """Apply additive teaching metadata columns for existing installs."""

    inspector = inspect(db.session.connection())
    table_names = set(inspector.get_table_names())
    if "teaching_agent_threads" in table_names:
        thread_columns = {
            column["name"]
            for column in inspector.get_columns("teaching_agent_threads")
        }
        if "pinned" not in thread_columns:
            db.session.execute(
                text(
                    "ALTER TABLE teaching_agent_threads "
                    "ADD COLUMN pinned BOOLEAN NOT NULL DEFAULT FALSE"
                )
            )
        if "archived_at" not in thread_columns:
            db.session.execute(
                text(
                    "ALTER TABLE teaching_agent_threads "
                    "ADD COLUMN archived_at TIMESTAMP"
                )
            )
        db.session.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_teaching_agent_threads_pinned "
                "ON teaching_agent_threads (pinned)"
            )
        )
        db.session.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_teaching_agent_threads_archived_at "
                "ON teaching_agent_threads (archived_at)"
            )
        )

    if "teaching_artifacts" in table_names:
        artifact_columns = {
            column["name"]
            for column in inspector.get_columns("teaching_artifacts")
        }
        if "sort_order" not in artifact_columns:
            db.session.execute(
                text(
                    "ALTER TABLE teaching_artifacts "
                    "ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 2147483647"
                )
            )
        db.session.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_teaching_artifacts_course_order "
                "ON teaching_artifacts (dojo_id, module_index, sort_order)"
            )
        )

    if db.engine.dialect.name == "postgresql" and "teaching_materials" in table_names:
        material_columns = {
            column["name"]: column
            for column in inspector.get_columns("teaching_materials")
        }
        if material_columns.get("dojo_id", {}).get("nullable") is False:
            db.session.execute(
                text(
                    "ALTER TABLE teaching_materials "
                    "ALTER COLUMN dojo_id DROP NOT NULL"
                )
            )


def create_database_schema():
    """Serialize plugin DDL across CTFd and every background worker.

    All Python services import the plugin at startup. PostgreSQL's
    ``CREATE TABLE IF NOT EXISTS`` check is not atomic across concurrent
    connections, so first deployment can otherwise race while creating a
    table's implicit row type. Keep a transaction-scoped advisory lock open
    in the scoped session while ``create_all`` performs its DDL on the engine.
    Pgbouncer transaction pooling retains that backend and lock until commit.
    """

    if db.engine.dialect.name != "postgresql":
        db.create_all()
        _reconcile_teaching_thread_schema()
        db.session.commit()
        return

    try:
        db.session.execute(
            text(
                "SELECT pg_advisory_xact_lock("
                "hashtextextended('aisecedu.create_database_schema', 0))"
            )
        )
        db.create_all()
        # ``create_all`` intentionally does not mutate an existing table.  The
        # global Agent originally shipped before conversation pin/archive
        # metadata existed, so reconcile these additive columns while holding
        # the same advisory lock used for the rest of the plugin schema.  This
        # keeps upgrades safe when CTFd and the teaching worker start together.
        _reconcile_teaching_thread_schema()
        # A user deletion reaches model_invocations through two paths:
        # owner_id is SET NULL directly, while owned artifacts cascade through
        # revisions and then SET artifact_revision_id NULL. PostgreSQL may
        # schedule those referential actions in either order. Deferring the
        # revision constraint lets both SET NULL actions settle before the
        # integrity check, so deleting a teacher with generated artifacts does
        # not fail midway while the invocation audit row is retained.
        db.session.execute(
            text(
                "ALTER TABLE model_invocations "
                "ALTER CONSTRAINT model_invocations_artifact_revision_id_fkey "
                "DEFERRABLE INITIALLY DEFERRED"
            )
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise


class DojoChallenge(BaseChallenge):
    id = "dojo"
    name = "dojo"
    challenge_model = Challenges

    @classmethod
    def solve(cls, user, team, challenge, request):
        super().solve(user, team, challenge, request)
        update_awards(user)

        active_dojo_challenge = get_current_dojo_challenge(user)
        dojo_challenge = (
            active_dojo_challenge
            if active_dojo_challenge and active_dojo_challenge.challenge_id == challenge.id
            else DojoChallenges.query.filter_by(challenge_id=challenge.id).first()
        )
        if dojo_challenge:
            from .learning.assessment import assess_attempt
            from .learning.evidence import record_flag_check

            try:
                learning_attempt = record_flag_check(
                    user,
                    dojo_challenge,
                    True,
                )
                assess_attempt(learning_attempt, run_model=False)
                db.session.commit()
            except Exception:
                db.session.rollback()
                logging.getLogger(__name__).exception(
                    "Failed to record deterministic learning assessment"
                )
            dojo = dojo_challenge.module.dojo
            if dojo.official or dojo.data.get("type") == "public":
                module = dojo_challenge.module
                points = challenge.value
                first_blood = Solves.query.filter_by(challenge_id=challenge.id).count() == 1
                publish_challenge_solve(user, dojo_challenge, dojo, module, points, first_blood)

    @classmethod
    def fail(cls, user, team, challenge, request):
        super().fail(user, team, challenge, request)
        active_dojo_challenge = get_current_dojo_challenge(user)
        dojo_challenge = (
            active_dojo_challenge
            if active_dojo_challenge and active_dojo_challenge.challenge_id == challenge.id
            else DojoChallenges.query.filter_by(challenge_id=challenge.id).first()
        )
        if dojo_challenge:
            from .learning.evidence import record_flag_check

            try:
                record_flag_check(user, dojo_challenge, False)
                db.session.commit()
            except Exception:
                db.session.rollback()
                logging.getLogger(__name__).exception(
                    "Failed to record rejected Flag evidence"
                )


class DojoFlag(BaseFlag):
    name = "dojo"

    @staticmethod
    def compare(chal_key_obj, provided):
        current_account_id = get_current_user().account_id
        current_challenge_id = chal_key_obj.challenge_id

        try:
            account_id, challenge_id = unserialize_user_flag(provided)
        except BadSignature:
            return False

        if account_id != current_account_id:
            raise FlagException("This flag is not yours!")

        if challenge_id != current_challenge_id:
            raise FlagException("This flag is not for this challenge!")

        return True


def context_processor():
    user = get_current_user()
    student_ux_experience = student_ux_rollout(user.id) if user else None
    trace_id = get_trace_id()
    product_bootstrap = build_ui_bootstrap(
        user,
        request.full_path,
        request.args.get("mode"),
        trace_id,
        include_scopes=False,
        include_running=False,
    )
    product_context = product_bootstrap["data"]
    preferences = product_context["preferences"]
    account_preferences = {
        "appearance": preferences["appearance"],
        "palette": preferences["palette"],
        "reducedMotion": preferences["reducedMotion"],
    }
    is_course_teacher = "teaching" in {
        mode["id"] for mode in product_context["availableModes"]
    }
    return dict(
        current_dojo_challenge=None,
        current_dojo_custom_js=None,
        is_course_teacher=is_course_teacher,
        account_preferences=account_preferences,
        student_ux_experience=student_ux_experience,
        request_id=trace_id,
        product_context=product_context,
        product_bootstrap=product_bootstrap,
        page_metadata=page_metadata(
            request.full_path,
            dojo=getattr(request, "view_args", {}).get("dojo") if request.view_args else None,
        ),
    )


def register_product_error_pages(app):
    definitions = {
        400: ("INVALID_REQUEST", "请求无法处理", "提交的信息不完整或格式不正确。", "返回上一页", None),
        401: ("AUTHENTICATION_REQUIRED", "需要登录", "请先登录，再继续打开这项内容。", "前往登录", "/login"),
        403: ("FORBIDDEN", "无权查看", "你当前的账号没有查看此内容的权限。", "返回今天", "/student"),
        404: ("NOT_FOUND", "内容不存在", "这项内容可能已移动、删除，或链接已经失效。", "返回今天", "/student"),
        410: ("GONE", "内容已下线", "这项内容已停止提供，请从课程中选择其他学习内容。", "浏览课程", "/dojos"),
        409: ("CONFLICT", "内容已发生变化", "服务器上的内容已更新，请重新加载并确认后再继续。", "重新加载", None),
        422: ("VALIDATION_FAILED", "请检查输入", "部分信息没有通过校验，请修正后再次提交。", "返回上一页", None),
        429: ("RATE_LIMITED", "操作过于频繁", "请稍候片刻再试；已保存的内容不会因此丢失。", "重新加载", None),
        500: ("TEMPORARILY_UNAVAILABLE", "暂时不可用", "服务遇到了临时问题，你的已保存学习状态不会因此丢失。", "重新加载", None),
        502: ("UPSTREAM_UNAVAILABLE", "依赖服务暂不可用", "平台正在等待依赖服务恢复，请稍后重试。", "重新加载", None),
        503: ("SERVICE_UNAVAILABLE", "服务暂不可用", "平台正在恢复服务，请稍后重试。", "重新加载", None),
    }

    def handler(status):
        def render_error(_error):
            code, title, description, label, href = definitions[status]
            trace_id = get_trace_id()
            if trace_id in {None, "", "NONE", "LOCAL"}:
                trace_id = uuid.uuid4().hex
            user = get_current_user()
            if user is None:
                label = "返回首页" if status != 401 else label
                href = "/" if status != 401 else href
            elif request.path.startswith("/admin"):
                label, href = "返回平台管理", "/admin"
            elif request.path.startswith("/teacher") or request.path.startswith("/dojo/") and "/admin" in request.path:
                label, href = "返回教学工作台", "/teacher"
            recovery_href = href or request.path
            if request.path.startswith("/pwncollege_api/"):
                return jsonify(
                    error_contract(
                        code,
                        description,
                        label=label,
                        href=recovery_href,
                        request_id=trace_id,
                    )
                ), status
            return render_template(
                "error.html",
                error_status=status,
                error_code=code,
                error_title=title,
                error_description=description,
                error_kicker="可以从这里恢复",
                recovery_label=label,
                recovery_href=recovery_href,
                error_request_id=trace_id,
            ), status

        return render_error

    for status in definitions:
        app.register_error_handler(status, handler(status))


def shell_context_processor():
    import CTFd.models as ctfd_models
    import CTFd.plugins.dojo_plugin.models as dojo_models
    result = dict()
    result.update(ctfd_models.__dict__.items())
    result.update(dojo_models.__dict__.items())
    return result


# TODO: CTFd should include "Date" header
def DatedEmailMessage():
    msg = EmailMessage()
    msg["Date"] = formatdate()
    return msg
import CTFd.utils.email.smtp
CTFd.utils.email.smtp.EmailMessage = DatedEmailMessage


# Patch CTFd to allow users to hide their profiles
import CTFd.schemas.users
CTFd.schemas.users.UserSchema.hidden = field_for(Users, "hidden")
CTFd.schemas.users.UserSchema.views["self"].append("hidden")


def redirect_dojo():
    if "X-Forwarded-For" in request.headers:
        parsed_url = urlparse(request.url)
        if parsed_url.netloc.split(':')[0] != DOJO_HOST:
            netloc = DOJO_HOST
            if ':' in parsed_url.netloc:
                netloc += ':' + parsed_url.netloc.split(':')[1]
            redirect_url = urlunparse((
                parsed_url.scheme,
                netloc,
                parsed_url.path,
                parsed_url.params,
                parsed_url.query,
                parsed_url.fragment,
            ))
            return redirect(redirect_url, code=301)


def handle_authorization(default_handler):
    authorization = request.headers.get("Authorization")
    if authorization and authorization.startswith("Bearer "):
        return
    default_handler()


def load(app):
    submission_query_optimization.install()
    if DOJO_IP_MODE:
        app.config["SESSION_COOKIE_NAME"] = "__Host-aisecedu-session"
        app.config["SESSION_COOKIE_SECURE"] = True
        app.config["SESSION_COOKIE_HTTPONLY"] = True
        app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

    drop_removed_platform_tables()
    create_database_schema()

    init_query_timer(app)

    logging.getLogger(__name__).setLevel(logging.INFO)

    setup_logging(app)
    setup_trace_id_tracking(app)
    setup_uncaught_error_logging(app)

    @app.after_request
    def publish_stat_events_after_request(response):
        record_teaching_api_response(response)
        publish_queued_events()
        if "Cache-Control" not in response.headers:
            if request.method not in {"GET", "HEAD"}:
                response.headers["Cache-Control"] = "private, no-store"
            elif request.path.startswith("/pwncollege_api/") or response.mimetype == "text/html":
                response.headers["Cache-Control"] = "private, no-cache"
                response.vary.add("Cookie")
        return response

    app.permanent_session_lifetime = datetime.timedelta(days=180)

    CHALLENGE_CLASSES["dojo"] = DojoChallenge
    FLAG_CLASSES["dojo"] = DojoFlag

    app.view_functions["views.static_html"] = static_html_override
    app.view_functions["views.settings"] = settings_override
    app.view_functions["challenges.listing"] = dojos_override
    del app.view_functions["scoreboard.listing"]
    del app.view_functions["users.private"]
    del app.view_functions["users.public"]
    del app.view_functions["users.listing"]

    if not app.debug:
        app.before_request(redirect_dojo)

    app.register_blueprint(dojos)
    app.register_blueprint(dojo)
    app.register_blueprint(workspace)
    app.register_blueprint(sensai)
    app.register_blueprint(discord)
    app.register_blueprint(users)
    app.register_blueprint(course)
    app.register_blueprint(belts)
    app.register_blueprint(research)
    app.register_blueprint(feed)
    enable_test_routes = (
        bool(app.testing)
        or bool(app.debug)
        or str(os.getenv("DOJO_ENV") or "").strip().lower() in {"development", "test"}
        or str(os.getenv("AISECEDU_ENABLE_TEST_ROUTES") or "").strip().lower()
        in {"1", "true", "yes"}
    )
    if enable_test_routes:
        app.register_blueprint(test_error_pages)
    app.register_blueprint(learning_pages)
    # CTFd registers its own `/privacy` rule before plugins. Keep that stable
    # endpoint but render the 玄甲 legal recovery state so an unconfigured
    # document is not an unexplained 404.
    if "views.privacy" in app.view_functions:
        app.view_functions["views.privacy"] = app.view_functions[
            "pwncollege_learning.privacy"
        ]
    # Replace legacy admin GET surfaces whose repeated form/table IDs and
    # chart-heavy startup break accessibility and performance at scale.
    # Endpoint names remain stable, so existing bookmarks and native APIs
    # keep working.
    app.view_functions["admin.view"] = admin_overview
    app.view_functions["admin.statistics"] = admin_overview
    app.view_functions["admin.users_listing"] = admin_users
    app.view_functions["admin.challenges_listing"] = admin_challenges
    app.view_functions["admin.submissions_listing"] = admin_submissions
    app.view_functions["admin.config"] = admin_config
    app.register_blueprint(api, url_prefix="/pwncollege_api/v1")
    register_product_error_pages(app)
    enable_agent_runtime_service_csrf_bypass(app)

    app.jinja_env.filters["markdown"] = render_markdown

    register_admin_plugin_menu_bar("Courses", "/admin/dojos")
    register_admin_plugin_menu_bar("Workspaces", "/admin/desktops")

    before_request_funcs = app.before_request_funcs[None]
    tokens_handler = next(func for func in before_request_funcs if func.__name__ == "tokens")
    before_request_funcs[before_request_funcs.index(tokens_handler)] = lambda: handle_authorization(tokens_handler)

    if os.path.basename(sys.argv[0]) != "manage.py":
        bootstrap()

    app.context_processor(context_processor)
    app.shell_context_processor(shell_context_processor)
