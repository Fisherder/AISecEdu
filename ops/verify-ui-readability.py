#!/usr/bin/env python3
"""Verify the shared typography floor and representative rendered contrast."""

from __future__ import annotations

import argparse
import importlib.util
import json
import pathlib
import re
import sys
import time
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parent.parent
CSS_DIR = ROOT / "dojo_theme" / "static" / "css"
FONT_SIZE_RE = re.compile(r"font-size\s*:\s*(\d*\.?\d+)(rem|px)", re.I)
FONT_SHORTHAND_RE = re.compile(
    r"font\s*:\s*[^;{}]*?(\d*\.?\d+)(rem|px)[^;{}]*;", re.I
)
PALETTE_RE = re.compile(
    r':root\[data-aisecedu-palette="([^"]+)"\]\s*\{(.*?)\n\}', re.S
)
TOKEN_RE = re.compile(r"--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;")


def relative_luminance(color: str) -> float:
    channels = [int(color[index : index + 2], 16) / 255 for index in (1, 3, 5)]
    linear = [
        value / 12.92
        if value <= 0.04045
        else ((value + 0.055) / 1.055) ** 2.4
        for value in channels
    ]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def contrast(first: str, second: str) -> float:
    first_luminance = relative_luminance(first)
    second_luminance = relative_luminance(second)
    return (max(first_luminance, second_luminance) + 0.05) / (
        min(first_luminance, second_luminance) + 0.05
    )


def canonical_stylesheets() -> list[pathlib.Path]:
    return sorted(
        path
        for path in CSS_DIR.glob("*.css")
        if not path.name.endswith((".dev.css", ".min.css"))
    )


def verify_static() -> dict[str, Any]:
    failures: list[str] = []
    declarations = 0
    for path in canonical_stylesheets():
        source = path.read_text(encoding="utf-8", errors="replace")
        for matcher in (FONT_SIZE_RE, FONT_SHORTHAND_RE):
            for match in matcher.finditer(source):
                declarations += 1
                value = float(match.group(1))
                pixels = value * 18 if match.group(2).lower() == "rem" else value
                if 2 < pixels < 14:
                    line = source.count("\n", 0, match.start()) + 1
                    failures.append(
                        f"{path.relative_to(ROOT)}:{line}: {match.group(0).strip()} ({pixels:.2f}px)"
                    )

    tokens = (CSS_DIR / "tokens.css").read_text(encoding="utf-8")
    for required in (
        "--ae-type-caption: max(0.75rem, 14px)",
        "--ae-type-small: max(0.8125rem, 15px)",
        "--ae-type-control: max(0.875rem, 16px)",
        "--ae-type-body: max(0.9375rem, 17px)",
        "--ae-action-on-primary: var(--theme-on-primary, #ffffff)",
    ):
        if required not in tokens:
            failures.append(f"tokens.css is missing {required}")

    themes = (CSS_DIR / "learning-themes.css").read_text(encoding="utf-8")
    palette_contrast: dict[str, dict[str, float]] = {}
    for palette, body in PALETTE_RE.findall(themes):
        values = dict(TOKEN_RE.findall(body))
        surface = values.get("theme-surface")
        dim = values.get("theme-text-dim")
        primary = values.get("theme-primary")
        on_primary = values.get("theme-on-primary")
        status_colors = {
            name: values.get(f"theme-{name}")
            for name in ("success", "warning", "danger")
        }
        if not all((surface, dim, primary, on_primary, *status_colors.values())):
            failures.append(f"palette {palette} is missing contrast tokens")
            continue
        dim_ratio = contrast(dim, surface)
        action_ratio = contrast(primary, on_primary)
        status_ratios = {
            name: contrast(color, surface)
            for name, color in status_colors.items()
            if color is not None
        }
        palette_contrast[palette] = {
            "dimText": round(dim_ratio, 2),
            "primaryAction": round(action_ratio, 2),
            **{
                f"{name}Text": round(ratio, 2)
                for name, ratio in status_ratios.items()
            },
        }
        if dim_ratio < 4.5:
            failures.append(f"palette {palette} dim text contrast is {dim_ratio:.2f}:1")
        if action_ratio < 4.5:
            failures.append(f"palette {palette} primary action contrast is {action_ratio:.2f}:1")
        for name, ratio in status_ratios.items():
            if ratio < 4.5:
                failures.append(
                    f"palette {palette} {name} text contrast is {ratio:.2f}:1"
                )

    teaching = (CSS_DIR / "teaching-agent.css").read_text(encoding="utf-8")
    for stale in ("rgba(13, 18, 27, 0.94)", "rgba(13, 18, 27, 0.92)"):
        if stale in teaching:
            failures.append(f"teaching dashboard still contains stale dark surface {stale}")

    result = {
        "status": "passed" if not failures else "failed",
        "stylesheets": len(canonical_stylesheets()),
        "fontDeclarations": declarations,
        "minimumTextPx": 14,
        "paletteContrast": palette_contrast,
        "failures": failures,
    }
    if failures:
        raise RuntimeError("\n".join(failures))
    return result


def load_module(name: str, path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


AUDIT_SCRIPT = r"""
const excluded = '.sr-only,[hidden],[aria-hidden="true"],pre,code,.xterm,.monaco-editor,.fa,.fas,.far,.fab';
const parse = value => {
  const match = String(value).match(/[\d.]+/g);
  if (!match || match.length < 3) return [0, 0, 0, 0];
  const scale = String(value).trim().startsWith('color(') ? 255 : 1;
  return [Number(match[0]) * scale, Number(match[1]) * scale, Number(match[2]) * scale, match[3] === undefined ? 1 : Number(match[3])];
};
const blend = (top, bottom) => {
  const alpha = top[3] + bottom[3] * (1 - top[3]);
  if (!alpha) return [255, 255, 255, 1];
  return [0, 1, 2].map(index => (top[index] * top[3] + bottom[index] * bottom[3] * (1 - top[3])) / alpha).concat(alpha);
};
const luminance = rgba => {
  const values = rgba.slice(0, 3).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4));
  return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
};
const ratio = (first, second) => {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
};
const background = element => {
  const chain = [];
  for (let node = element; node; node = node.parentElement) chain.push(node);
  let result = [255, 255, 255, 1];
  chain.reverse().forEach(node => { result = blend(parse(getComputedStyle(node).backgroundColor), result); });
  return result;
};
const rows = [];
document.querySelectorAll('body *').forEach(element => {
  if (element.matches(excluded) || element.closest(excluded) || element.closest('[disabled],[aria-disabled="true"]')) return;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  if (!rect.width || !rect.height || style.visibility === 'hidden' || Number(style.opacity) < .2) return;
  const direct = Array.from(element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent.trim()).join(' ');
  const control = element.matches('input,select,textarea,button') ? (element.value || element.placeholder || element.getAttribute('aria-label') || '') : '';
  const text = (direct || control).replace(/\s+/g, ' ').trim();
  if (!text) return;
  const size = parseFloat(style.fontSize);
  const weight = Number(style.fontWeight) || 400;
  const bg = background(element);
  const fg = blend(parse(style.color), bg);
  const contrast = ratio(fg, bg);
  const required = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
  rows.push({tag: element.tagName.toLowerCase(), selector: element.id ? `#${element.id}` : `.${Array.from(element.classList).slice(0, 2).join('.')}`, text: text.slice(0, 90), size, contrast, required});
});
const dashboard = document.querySelector('.teaching-dashboard-command');
return {
  url: location.pathname + location.search,
  theme: document.documentElement.dataset.aiseceduTheme,
  samples: rows.length,
  undersized: rows.filter(row => row.size < 13.95).slice(0, 80),
  lowContrast: rows.filter(row => row.contrast + .02 < row.required).slice(0, 80),
  dashboard: dashboard ? {background: getComputedStyle(dashboard).backgroundColor, color: getComputedStyle(dashboard).color} : null
};
"""


def verify_live(base_url: str, screenshot_dir: pathlib.Path) -> dict[str, Any]:
    flow = load_module("ui_readability_flow", ROOT / "ops" / "verify-teacher-agent-flow.py")
    browser_module = load_module(
        "ui_readability_browser", ROOT / "ops" / "verify-teacher-agent-ui.py"
    )
    flow.BASE_URL = base_url.rstrip("/")
    username, password = flow.admin_credentials()
    client = flow.authenticate(username, password)
    screenshot_dir.mkdir(parents=True, exist_ok=True)
    pages = (
        ("teacher", "/teacher"),
        ("courses", "/teacher/courses"),
        ("catalog", "/dojos"),
        ("settings", "/settings"),
        ("profile", "/hacker/"),
        ("analytics", "/learning/dashboard"),
        ("admin", "/admin"),
    )
    reports: list[dict[str, Any]] = []
    driver = browser_module.ChromeDriver(port=9521)
    try:
        driver.navigate(base_url.rstrip("/") + "/")
        for cookie in client.cookies:
            driver.add_cookie(cookie.name, cookie.value)
        driver.execute(
            "localStorage.setItem('aisecedu-theme','light');"
            "localStorage.setItem('aisecedu-palette','academy');"
        )
        for name, route in pages:
            driver.navigate(base_url.rstrip("/") + route)
            driver.wait_for(
                "return document.readyState === 'complete' && document.body && document.body.innerText.length > 0;",
                timeout=45,
                label=route,
            )
            if route == "/teacher":
                driver.wait_for(
                    "return !!document.querySelector('.teaching-dashboard:not([hidden])');",
                    timeout=45,
                    label="teacher dashboard",
                )
            time.sleep(1)
            audit = driver.execute(AUDIT_SCRIPT)
            audit["name"] = name
            driver.screenshot(screenshot_dir / f"{name}.png")
            reports.append(audit)
    finally:
        driver.close()

    failures = []
    for report in reports:
        if report["theme"] != "light":
            failures.append(f"{report['name']}: expected light theme, got {report['theme']}")
        if report["undersized"]:
            failures.append(f"{report['name']}: undersized={report['undersized'][:5]}")
        if report["lowContrast"]:
            failures.append(f"{report['name']}: lowContrast={report['lowContrast'][:5]}")
    teacher = next(item for item in reports if item["name"] == "teacher")
    if not teacher["dashboard"] or teacher["dashboard"]["background"] in {
        "rgb(13, 18, 27)",
        "rgba(13, 18, 27, 0.94)",
    }:
        failures.append(f"teacher dashboard surface is stale: {teacher['dashboard']}")
    if failures:
        raise RuntimeError("\n".join(failures))
    return {"status": "passed", "pages": reports, "screenshots": str(screenshot_dir)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--base-url", default="https://192.168.3.111")
    parser.add_argument(
        "--screenshots", type=pathlib.Path, default=ROOT / "output" / "ui-readability"
    )
    parser.add_argument("--output", type=pathlib.Path)
    args = parser.parse_args()
    try:
        report: dict[str, Any] = {"static": verify_static()}
        if args.live:
            report["live"] = verify_live(args.base_url, args.screenshots)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except Exception as error:
        print(f"FAIL  {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
