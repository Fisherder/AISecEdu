import sys
import uuid

import requests
from flask import request, Blueprint, url_for, redirect, render_template, current_app
from sqlalchemy.exc import IntegrityError
from itsdangerous.url_safe import URLSafeTimedSerializer
from CTFd.models import db
from CTFd.utils.user import get_current_user
from CTFd.utils.decorators import authed_only

from ..models import DiscordUsers
from ..config import DISCORD_CLIENT_ID
from ..utils.discord import OAUTH_ENDPOINT, get_discord_id, get_discord_member, add_role
from ..utils.awards import update_awards
from ..utils.request_logging import get_trace_id


discord = Blueprint("discord", __name__)
discord_oauth_serializer = URLSafeTimedSerializer(current_app.config["SECRET_KEY"], "DISCORD_OAUTH")


def _discord_recovery(code, title, description, status):
    request_id = get_trace_id()
    if request_id in {None, "", "NONE", "LOCAL"}:
        request_id = uuid.uuid4().hex
    return render_template(
        "error.html",
        error_status=status,
        error_code=code,
        error_kicker="账号关联尚未完成",
        error_title=title,
        error_description=description,
        recovery_label="返回账户设置",
        recovery_href="/settings#discord",
        error_request_id=request_id,
    ), status


@discord.route("/discord/connect")
@authed_only
def discord_connect():
    if not DISCORD_CLIENT_ID:
        return _discord_recovery(
            "DISCORD_NOT_CONFIGURED",
            "Discord 关联暂不可用",
            "平台尚未配置 Discord 登录。你可以继续使用其他账户功能，或稍后再试。",
            503,
        )

    state = discord_oauth_serializer.dumps(get_current_user().id)
    params = dict(client_id=DISCORD_CLIENT_ID,
                  redirect_uri=url_for("discord.discord_redirect", _external=True),
                  response_type="code",
                  scope="identify",
                  state=state)
    oauth_url = requests.Request("GET", f"{OAUTH_ENDPOINT}/authorize", params=params).prepare().url

    return redirect(oauth_url)


@discord.route("/discord/redirect")
@authed_only
def discord_redirect():
    if not DISCORD_CLIENT_ID:
        return _discord_recovery(
            "DISCORD_NOT_CONFIGURED",
            "Discord 关联暂不可用",
            "平台尚未配置 Discord 登录。你可以继续使用其他账户功能，或稍后再试。",
            503,
        )

    state = request.args.get("state")
    code = request.args.get("code")

    if not state or not code:
        return _discord_recovery(
            "DISCORD_CALLBACK_INCOMPLETE",
            "Discord 授权信息不完整",
            "授权链接可能已经过期。请返回账户设置后重新发起关联。",
            400,
        )

    try:
        redirect_user_id = discord_oauth_serializer.loads(state, max_age=300)
        user = get_current_user()
        user_id = user.id
        assert user_id == redirect_user_id, (user_id, redirect_user_id)
        discord_id = get_discord_id(code)
    except Exception as e:
        print(f"ERROR: Discord redirect failed: {e}", file=sys.stderr, flush=True)
        return _discord_recovery(
            "DISCORD_CALLBACK_EXPIRED",
            "Discord 授权未完成",
            "授权可能已经超时或与当前账号不匹配。请返回账户设置后重新尝试。",
            400,
        )

    try:
        existing_discord_user = DiscordUsers.query.filter_by(user_id=user_id).first()
        if not existing_discord_user:
            discord_user = DiscordUsers(user_id=user_id, discord_id=discord_id)
            db.session.add(discord_user)
        else:
            existing_discord_user.discord_id = discord_id
        db.session.commit()
        if get_discord_member(discord_id):
            add_role(discord_id, "White Belt")
            update_awards(user)
    except IntegrityError:
        db.session.rollback()
        return _discord_recovery(
            "DISCORD_ALREADY_LINKED",
            "这个 Discord 账号已被关联",
            "该 Discord 账号已关联到另一个平台账号。如需变更，请联系平台管理员。",
            409,
        )

    return redirect("/settings#discord")
