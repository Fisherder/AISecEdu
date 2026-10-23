import argparse
import hashlib
import re
from pathlib import Path


def publish(root, check=False):
    assets = root / "dojo_theme/static/js/dojo/workbench-v3"
    template = root / "dojo_theme/templates/teacher_workbench.html"
    bundle = (assets / "app.js").read_bytes()
    digest = hashlib.sha256(bundle).hexdigest()
    filename = f"app-{digest[:12]}.js"
    source = template.read_text()
    pattern = r"url_for\('views\.themes(?:_beta)?', path='js/dojo/workbench-v3/[^']+', v='[^']+'\)"
    target = f"url_for('views.themes_beta', path='js/dojo/workbench-v3/{filename}', v='{digest[:12]}')"
    updated, count = re.subn(pattern, target, source)
    if count != 1:
        raise SystemExit("Expected exactly one workbench script in the template")
    destinations = [assets / name for name in ("app.dev.js", "app.min.js", filename)]
    if check:
        for path in destinations:
            if not path.exists() or path.read_bytes() != bundle:
                raise SystemExit(f"Outdated workbench asset: {path}")
        if source != updated:
            raise SystemExit("Workbench template does not reference the current fingerprint")
    else:
        for path in destinations:
            path.write_bytes(bundle)
        template.write_text(updated)
    print(f"workbench asset: {filename}")
    print(f"sha256: {digest}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    publish(args.root, args.check)
