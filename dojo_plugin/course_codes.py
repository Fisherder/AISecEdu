import re
import secrets

from .models import Dojos


COURSE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
COURSE_CODE_LENGTH = 8


def normalize_course_code(value):
    code = re.sub(r"[\s-]+", "", str(value or "")).upper()
    if len(code) != COURSE_CODE_LENGTH:
        return ""
    if any(character not in COURSE_CODE_ALPHABET for character in code):
        return ""
    return code


def format_course_code(value):
    code = normalize_course_code(value)
    return f"{code[:4]}-{code[4:]}" if code else ""


def course_join_code(dojo):
    return normalize_course_code((dojo.data or {}).get("join_code"))


def find_course_by_join_code(value):
    code = normalize_course_code(value)
    if not code:
        return None
    return Dojos.query.filter(Dojos.data["join_code"].astext == code).first()


def ensure_course_join_code(dojo, *, regenerate=False):
    existing = course_join_code(dojo)
    if existing and not regenerate:
        return existing
    for _ in range(32):
        code = "".join(
            secrets.choice(COURSE_CODE_ALPHABET) for _ in range(COURSE_CODE_LENGTH)
        )
        if not Dojos.query.filter(Dojos.data["join_code"].astext == code).first():
            dojo.data = {**(dojo.data or {}), "join_code": code}
            return code
    raise RuntimeError("无法生成唯一课程码，请稍后重试。")
