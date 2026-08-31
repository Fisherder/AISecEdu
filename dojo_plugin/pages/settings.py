from flask import url_for, render_template
from CTFd.models import UserTokens
from CTFd.utils import get_config
from CTFd.utils.helpers import get_infos, markup
from CTFd.utils.decorators import authed_only
from CTFd.utils.user import get_current_user

from ..models import DiscordUsers, DojoAdmins, SSHKeys
from ..config import DISCORD_CLIENT_ID
from ..utils.discord import get_discord_member, discord_avatar_asset


@authed_only
def settings_override():
    infos = get_infos()

    user = get_current_user()
    tokens = UserTokens.query.filter_by(user_id=user.id).all()

    ssh_keys = SSHKeys.query.filter_by(user_id=user.id).all()

    discord_member = get_discord_member(DiscordUsers.query.filter_by(user=user)
                                        .with_entities(DiscordUsers.discord_id).scalar())

    prevent_name_change = get_config("prevent_name_change")

    if get_config("verify_emails") and not user.verified:
        confirm_url = markup(url_for("auth.confirm"))
        infos.append(
            markup(
                "你的电子邮箱尚未验证。<br>"
                "请查收邮件并完成电子邮箱验证。<br><br>"
                f'如需重新发送验证邮件，请<a href="{confirm_url}">点击这里</a>。'
            )
        )

    return render_template(
        "settings.html",
        user=user,
        is_course_teacher=user.type == "admin"
        or DojoAdmins.query.filter_by(user_id=user.id).first() is not None,
        tokens=tokens,
        ssh_keys=[key.value for key in ssh_keys],
        discord_enabled=bool(DISCORD_CLIENT_ID),
        discord_member=discord_member,
        discord_avatar_asset=discord_avatar_asset,
        prevent_name_change=prevent_name_change,
        infos=infos,
    )
