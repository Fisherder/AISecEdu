import argparse
import pathlib
import re


def install(root):
    page = root / "vnc.html"
    source = page.read_text(encoding="utf-8")
    if not re.search(r"<meta\s+charset=", source, re.IGNORECASE):
        source = source.replace("<head>", '<head>\n    <meta charset="utf-8">', 1)
    anchor = "        UI.start({ settings: { defaults: defaults,"
    settings = (
        "        mandatory.resize = 'scale';\n"
        "        mandatory.view_clip = false;\n"
    )
    if anchor not in source:
        raise ValueError("Unsupported noVNC entry point: UI.start settings are missing")
    if settings not in source:
        source = source.replace(anchor, settings + anchor, 1)
    source = source.replace(
        '<script src="app/lab-result.js"></script>',
        '<script charset="utf-8" src="app/lab-result.js?v=display-1"></script>',
    )
    temporary = page.with_suffix(".html.tmp")
    temporary.write_text(source, encoding="utf-8")
    temporary.chmod(page.stat().st_mode & 0o777)
    temporary.replace(page)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=pathlib.Path, default=pathlib.Path("/usr/share/novnc"))
    install(parser.parse_args().root)
