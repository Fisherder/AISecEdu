"""Guards that keep theme-aware styling from silently regressing.

Two failure modes have already shipped once each:

1. A component hard-codes a light surface (``background: #fff`` / ``white``)
   while the surrounding page is dark, so text lands dark-on-dark or
   light-on-light.
2. A component references a design token that does not exist.  With a light
   fallback (``var(--surface, #fff)``) the page looks fine in light mode and
   renders white in dark mode, which is why it survived review.

Both are cheap to detect statically, so they are checked here instead of
waiting for someone to open the page in dark mode.
"""

import pathlib
import re

CSS_DIR = pathlib.Path(__file__).resolve().parent.parent / "dojo_theme" / "static" / "css"
TEMPLATE_DIR = CSS_DIR.parent.parent / "templates"

THEME_FILES = ["custom.css", "learning-themes.css", "tokens.css", "components.css", "product-shell.css"]

# Sheets that are duplicated per build flavour; the served copy is the .css one
# but the minified/dev copies ship too and must not drift.
FLAVOURS = ("", ".min", ".dev")

LIGHT_SURFACE = re.compile(r"background(?:-color)?\s*:\s*(?P<value>[^;{}]+)")

HEX = re.compile(r"#(?P<hex>[0-9a-fA-F]{3,8})\b")
NAMED = {"white", "black"}


def _relative_luminance(value):
    match = HEX.search(value)
    if match:
        raw = match.group("hex")
        if len(raw) == 3:
            raw = "".join(char * 2 for char in raw)
        if len(raw) < 6:
            return None
        channels = [int(raw[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    else:
        name = value.strip().lower()
        if name not in NAMED:
            return None
        return NAMED[name]

    def linear(channel):
        return channel / 12.92 if channel <= 0.03928 else ((channel + 0.055) / 1.055) ** 2.4

    red, green, blue = (linear(channel) for channel in channels)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def _read(path):
    """Return the sheet text, or None for AppleDouble/binary companions."""
    try:
        return path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return None


def _component_sheets():
    for path in sorted(CSS_DIR.glob("*.css")):
        if path.name in THEME_FILES or path.name.startswith("._"):
            continue
        if path.is_symlink():
            continue
        yield path


# Values supplied from JavaScript at runtime rather than from a stylesheet.
RUNTIME_TOKENS = {"--dot", "--cell", "--job-step-count"}


def test_no_unthemed_white_surfaces():
    """A pure white fill in a themed sheet is always a missed token.

    Deliberate accent pairs (a light chip with dark text, used by the AI
    workbench's own dark palette) are not flagged here; those are covered by
    the runtime contrast scan in test/browser/verify-dark-contrast.mjs, which
    measures what actually renders.
    """
    offenders = []
    for path in _component_sheets():
        text = _read(path)
        if text is None:
            continue
        for match in LIGHT_SURFACE.finditer(text):
            value = match.group("value").strip().lower()
            if re.fullmatch(r"#fff|#ffffff|white", value):
                offenders.append(f"{path.name}: background: {value}")
    assert not offenders, (
        "组件样式用纯白填充，深色主题下会与页面底色冲突；"
        "请改用 var(--theme-surface) / var(--theme-field)：\n  " + "\n  ".join(offenders)
    )


def test_component_css_only_references_defined_tokens():
    global_defined = set()
    for name in THEME_FILES:
        path = CSS_DIR / name
        if path.exists():
            text = _read(path)
            if text:
                global_defined |= set(re.findall(r"(--[a-zA-Z0-9-]+)\s*:", text))

    runtime = set()
    for template in TEMPLATE_DIR.glob("*.html"):
        try:
            runtime |= set(re.findall(r"(--[a-zA-Z0-9-]+)\s*:", template.read_text(encoding="utf-8")))
        except UnicodeDecodeError:
            continue

    offenders = []
    for path in _component_sheets():
        text = _read(path)
        if text is None:
            continue
        local = set(re.findall(r"(--[a-zA-Z0-9-]+)\s*:", text))
        for match in re.finditer(r"var\((--[a-zA-Z0-9-]+)(?:\s*,\s*([^)]+))?\)", text):
            name, fallback = match.group(1), match.group(2)
            if name in global_defined or name in local or name in runtime or name in RUNTIME_TOKENS:
                continue
            # A numeric fallback cannot make the theme unreadable; a colour one can.
            if fallback is not None and not HEX.search(fallback) and fallback.strip().lower() not in NAMED:
                continue
            offenders.append(f"{path.name}: var({name}{'' if fallback is None else ', ' + fallback.strip()})")
    assert not offenders, (
        "组件样式引用了未定义的 CSS 变量。若带了浅色兜底值，浅色主题正常、深色主题会退回白底；"
        "请改用真实令牌：\n  " + "\n  ".join(offenders)
    )
