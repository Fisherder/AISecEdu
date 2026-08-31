#!/usr/bin/env python3
"""Measure user-visible route performance through Chromium DevTools Protocol."""

import argparse
import json
import os
import pathlib
import runpy
import shutil
import socket
import statistics
import subprocess
import tempfile
import time
from urllib.parse import quote, urlsplit

import requests
import websocket


ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_BASE_URL = os.getenv("DOJO_URL", "https://192.168.3.111").rstrip("/")


def browser_binary():
    return os.getenv("DOJO_BROWSER_BINARY") or next(
        (
            value
            for value in (
                shutil.which("chromium"),
                shutil.which("chromium-browser"),
                shutil.which("google-chrome"),
            )
            if value
        ),
        None,
    )


def available_port():
    with socket.socket() as candidate:
        candidate.bind(("127.0.0.1", 0))
        return candidate.getsockname()[1]


class DevTools:
    def __init__(self, url):
        self.socket = websocket.create_connection(url, timeout=15)
        self.next_id = 1
        self.events = []
        self.exceptions = []

    def close(self):
        self.socket.close()

    def _record(self, payload):
        if payload.get("method") == "Runtime.exceptionThrown":
            details = payload.get("params", {}).get("exceptionDetails", {})
            self.exceptions.append(
                details.get("text")
                or details.get("exception", {}).get("description")
                or "未命名脚本异常"
            )
        self.events.append(payload)

    def command(self, method, params=None):
        request_id = self.next_id
        self.next_id += 1
        self.socket.send(
            json.dumps({"id": request_id, "method": method, "params": params or {}})
        )
        while True:
            payload = json.loads(self.socket.recv())
            if payload.get("id") == request_id:
                if payload.get("error"):
                    raise RuntimeError(f"CDP {method}: {payload['error']}")
                return payload.get("result") or {}
            self._record(payload)

    def wait_event(self, method, timeout=30):
        deadline = time.monotonic() + timeout
        while True:
            for index, payload in enumerate(self.events):
                if payload.get("method") == method:
                    return self.events.pop(index)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"等待 {method} 超时")
            self.socket.settimeout(min(remaining, 2))
            try:
                self._record(json.loads(self.socket.recv()))
            except TimeoutError:
                continue

    def evaluate(self, expression):
        result = self.command(
            "Runtime.evaluate",
            {
                "expression": expression,
                "returnByValue": True,
                "awaitPromise": True,
            },
        ).get("result") or {}
        if result.get("subtype") == "error":
            raise RuntimeError(result.get("description") or "浏览器执行失败")
        return result.get("value")


def launch_browser(binary, width=1600, height=1000):
    port = available_port()
    profile = tempfile.TemporaryDirectory(prefix="aisecedu-browser-perf-")
    command = [
        binary,
        "--headless=new",
        "--ignore-certificate-errors",
        "--no-proxy-server",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-background-networking",
        "--remote-allow-origins=*",
        "--remote-debugging-address=127.0.0.1",
        f"--remote-debugging-port={port}",
        f"--user-data-dir={profile.name}",
        f"--window-size={width},{height}",
        "about:blank",
    ]
    environment = os.environ.copy()
    environment["NO_PROXY"] = "*"
    environment["no_proxy"] = "*"
    process = subprocess.Popen(
        command,
        env=environment,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    endpoint = f"http://127.0.0.1:{port}/json/list"
    deadline = time.monotonic() + 20
    pages = None
    while time.monotonic() < deadline:
        if process.poll() is not None:
            profile.cleanup()
            raise RuntimeError("Chromium 启动失败。")
        try:
            pages = requests.get(endpoint, timeout=1).json()
            if pages:
                break
        except (requests.RequestException, ValueError):
            time.sleep(0.15)
    if not pages:
        process.terminate()
        profile.cleanup()
        raise RuntimeError("Chromium DevTools 端口未就绪。")
    return process, profile, DevTools(pages[0]["webSocketDebuggerUrl"])


OBSERVER_SOURCE = """
(() => {
  window.__aiseceduPerf = {longTasks: [], shifts: [], cls: 0, lcp: 0};
  try {
    new PerformanceObserver(list => {
      list.getEntries().forEach(entry => window.__aiseceduPerf.longTasks.push({
        start: entry.startTime,
        duration: entry.duration,
      }));
    }).observe({type: 'longtask', buffered: true});
  } catch (error) {}
  try {
    new PerformanceObserver(list => {
      list.getEntries().forEach(entry => {
        if (!entry.hadRecentInput) {
          window.__aiseceduPerf.cls += entry.value;
          window.__aiseceduPerf.shifts.push({
            start: entry.startTime,
            value: entry.value,
            sources: (entry.sources || []).map(source => ({
              node: source.node ? `${source.node.tagName || ''}#${source.node.id || ''}.${source.node.className || ''}` : '',
              previousRect: source.previousRect,
              currentRect: source.currentRect,
            })),
          });
        }
      });
    }).observe({type: 'layout-shift', buffered: true});
  } catch (error) {}
  try {
    new PerformanceObserver(list => {
      const entries = list.getEntries();
      if (entries.length) window.__aiseceduPerf.lcp = entries[entries.length - 1].startTime;
    }).observe({type: 'largest-contentful-paint', buffered: true});
  } catch (error) {}
})();
"""


def ready_expression(route):
    if route.startswith("/student"):
        return "document.querySelector('#learning-overview')?.getAttribute('aria-busy') === 'false'"
    if route.startswith("/teacher/courses"):
        return """
          (() => {
            const root = document.querySelector('#teacher-course-center');
            const listView = document.querySelector('#cs-course-list-view');
            const detailView = document.querySelector('#cs-course-detail-view');
            const list = document.querySelector('#cs-course-list-loading');
            const workspace = document.querySelector('#cs-loading');
            return Boolean(root) && (
              (listView && !listView.hidden && (!list || list.hidden))
              || (detailView && !detailView.hidden && (!workspace || workspace.hidden))
            );
          })()
        """
    if route.startswith("/teacher"):
        return "document.querySelector('#teacher-agent')?.dataset.ready === 'true'"
    return "document.readyState === 'complete'"


METRICS_SOURCE = """
(() => {
  const navigation = performance.getEntriesByType('navigation')[0] || {};
  const resources = performance.getEntriesByType('resource');
  const paints = Object.fromEntries(
    performance.getEntriesByType('paint').map(entry => [entry.name, entry.startTime])
  );
  const state = window.__aiseceduPerf || {longTasks: [], cls: 0, lcp: 0};
  const api = resources.filter(entry => entry.name.includes('/pwncollege_api/'));
  const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
  const unnamedInteractive = [...document.querySelectorAll('a,button,input,select,textarea,[role="button"]')]
    .filter(node => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return false;
      const labelledBy = String(node.getAttribute('aria-labelledby') || '')
        .split(/\s+/).filter(Boolean)
        .map(id => document.getElementById(id)?.textContent || '').join(' ');
      const implicitLabels = node.labels ? [...node.labels].map(label => label.textContent || '').join(' ') : '';
      const label = node.getAttribute('aria-label') || labelledBy || implicitLabels || node.getAttribute('title') || node.textContent || node.value;
      return !String(label || '').trim();
    })
    .map(node => ({
      tag: node.tagName,
      id: node.id || null,
      name: node.getAttribute('name'),
      type: node.getAttribute('type'),
      className: String(node.className || '').slice(0, 160),
    }));
  const filterFieldOverlaps = [...document.querySelectorAll('.admin-product-filters label')]
    .map(label => {
      const caption = label.querySelector(':scope > span');
      const control = label.querySelector(':scope > input, :scope > select, :scope > textarea');
      if (!caption || !control) return null;
      const captionRect = caption.getBoundingClientRect();
      const controlRect = control.getBoundingClientRect();
      return captionRect.bottom > controlRect.top + 0.5
        ? {caption: caption.textContent.trim(), overlapPx: captionRect.bottom - controlRect.top}
        : null;
    })
    .filter(Boolean);
  return {
    finalPath: location.pathname + location.search,
    timeToFirstByteMs: Number(navigation.responseStart || 0),
    domContentLoadedMs: Number(navigation.domContentLoadedEventEnd || 0),
    loadMs: Number(navigation.loadEventEnd || 0),
    firstContentfulPaintMs: Number(paints['first-contentful-paint'] || 0),
    largestContentfulPaintMs: Number(state.lcp || 0),
    cumulativeLayoutShift: Number(state.cls || 0),
    layoutShifts: state.shifts || [],
    requestCount: resources.length + 1,
    apiCount: api.length,
    apiDurationMs: api.reduce((maximum, entry) => Math.max(maximum, Number(entry.duration || 0)), 0),
    apiPaths: api.map(entry => {
      const url = new URL(entry.name);
      return url.pathname + url.search;
    }),
    transferBytes: sum(resources, 'transferSize') + Number(navigation.transferSize || 0),
    decodedBytes: sum(resources, 'decodedBodySize') + Number(navigation.decodedBodySize || 0),
    scriptTransferBytes: sum(resources.filter(entry => entry.initiatorType === 'script'), 'transferSize'),
    renderedTableRows: document.querySelectorAll('table tbody tr').length,
    documentHeight: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0),
    viewportHeight: document.documentElement.clientHeight,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    unnamedInteractiveCount: unnamedInteractive.length,
    unnamedInteractive,
    filterFieldOverlapCount: filterFieldOverlaps.length,
    filterFieldOverlaps,
    longTaskCount: state.longTasks.length,
    longTaskTotalMs: sum(state.longTasks, 'duration'),
    longestTaskMs: state.longTasks.reduce((maximum, entry) => Math.max(maximum, Number(entry.duration || 0)), 0),
  };
})()
"""


def collect(devtools, url, mode, settle_ms):
    route = urlsplit(url).path
    devtools.events.clear()
    devtools.exceptions.clear()
    devtools.command("Page.navigate", {"url": url})
    devtools.wait_event("Page.loadEventFired", timeout=30)
    deadline = time.monotonic() + 30
    readiness = ready_expression(route)
    ready_in_time = False
    while time.monotonic() < deadline:
        if devtools.evaluate(readiness):
            ready_in_time = True
            break
        time.sleep(0.1)
    time.sleep(settle_ms / 1000)
    metrics = devtools.evaluate(METRICS_SOURCE)
    metrics.update(
        {
            "route": url.removeprefix(f"{urlsplit(url).scheme}://{urlsplit(url).netloc}"),
            "mode": mode,
            "readyInTime": ready_in_time,
            "errors": list(dict.fromkeys(devtools.exceptions)),
        }
    )
    return metrics


def assess(row):
    budgets = {
        "domContentLoadedMs": 1200,
        "firstContentfulPaintMs": 1400,
        "largestContentfulPaintMs": 2500,
        "cumulativeLayoutShift": 0.1,
        "longTaskTotalMs": 400,
        "longestTaskMs": 180,
        "transferBytes": 2_000_000,
        "apiCount": 10,
    }
    failures = []
    for name, maximum in budgets.items():
        value = float(row.get(name) or 0)
        if value > maximum:
            failures.append(f"{name}={round(value, 1)} 超过 {maximum}")
    for required in ("domContentLoadedMs", "firstContentfulPaintMs"):
        if not float(row.get(required) or 0):
            failures.append(f"缺少 {required}")
    if row.get("errors"):
        failures.append(f"浏览器脚本异常 {len(row['errors'])} 条")
    if not row.get("readyInTime"):
        failures.append("页面在 30 秒内未进入可交互状态")
    if row.get("horizontalOverflow"):
        failures.append("页面出现意外横向滚动")
    if int(row.get("unnamedInteractiveCount") or 0):
        failures.append(f"存在 {row['unnamedInteractiveCount']} 个无名称交互控件")
    if int(row.get("filterFieldOverlapCount") or 0):
        failures.append(f"存在 {row['filterFieldOverlapCount']} 个筛选字段标签重叠")
    if row.get("route") in {
        "/admin/users",
        "/admin/challenges",
        "/admin/dojos",
        "/admin/submissions",
    }:
        if int(row.get("renderedTableRows") or 0) > 25:
            failures.append(f"一次渲染 {row['renderedTableRows']} 行，超过 25 行分页上限")
        if int(row.get("documentHeight") or 0) > 15000:
            failures.append(f"页面高度 {row['documentHeight']}px 超过大集合上限")
    row["budgets"] = budgets
    row["passed"] = not failures
    row["failures"] = failures


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--output", type=pathlib.Path)
    parser.add_argument("--settle-ms", type=int, default=1200)
    parser.add_argument("--viewport-width", type=int, default=1600)
    parser.add_argument("--viewport-height", type=int, default=1000)
    parser.add_argument(
        "--route",
        action="append",
        dest="routes",
        help="只验证指定站内路径；可重复传入。",
    )
    args = parser.parse_args()

    binary = browser_binary()
    if not binary:
        raise SystemExit("未找到 Chromium。")

    helper = runpy.run_path(str(ROOT / "ops/verify-learning-flow.py"))
    username, password = helper["credentials"]()
    session = helper["authenticate"](username, password)
    context = session.get(
        f"{args.base_url}/pwncollege_api/v1/teaching/context?view=teacher-shell",
        timeout=30,
    ).json().get("data") or {}
    courses = context.get("teacherDojos") or []
    course_route = "/teacher/courses"
    if courses:
        course_route += f"?dojo={quote(str(courses[0]['referenceId']), safe='')}"

    process, profile, devtools = launch_browser(
        binary, width=args.viewport_width, height=args.viewport_height
    )
    rows = []
    try:
        devtools.command("Page.enable")
        devtools.command("Runtime.enable")
        devtools.command("Network.enable")
        devtools.command("Page.addScriptToEvaluateOnNewDocument", {"source": OBSERVER_SOURCE})
        # The public landing page must be measured without an authenticated
        # cookie; otherwise `/` redirects to the teaching dashboard and the
        # report silently measures the same page twice.
        public_routes = [] if args.routes else ["/"]
        authenticated_routes = args.routes or [
            "/student",
            "/teacher",
            course_route,
            "/hacker/",
            "/settings",
            "/admin",
        ]
        if public_routes:
            devtools.command("Network.setCacheDisabled", {"cacheDisabled": True})
            for route in public_routes:
                devtools.command("Network.clearBrowserCache")
                rows.append(
                    collect(devtools, f"{args.base_url}{route}", "public-cold", args.settle_ms)
                )
            devtools.command("Network.setCacheDisabled", {"cacheDisabled": False})
            for route in public_routes:
                rows.append(
                    collect(devtools, f"{args.base_url}{route}", "public-warm", args.settle_ms)
                )

        for cookie in session.cookies:
            devtools.command(
                "Network.setCookie",
                {
                    "name": cookie.name,
                    "value": cookie.value,
                    "url": args.base_url,
                    "path": cookie.path or "/",
                    "secure": True,
                },
            )
        devtools.command("Network.setCacheDisabled", {"cacheDisabled": True})
        for route in authenticated_routes:
            devtools.command("Network.clearBrowserCache")
            rows.append(collect(devtools, f"{args.base_url}{route}", "cold", args.settle_ms))
        devtools.command("Network.setCacheDisabled", {"cacheDisabled": False})
        for route in authenticated_routes:
            rows.append(collect(devtools, f"{args.base_url}{route}", "warm", args.settle_ms))
    finally:
        devtools.close()
        process.terminate()
        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        profile.cleanup()

    for row in rows:
        assess(row)
    report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "baseUrl": args.base_url,
        "routes": rows,
        "summary": {
            "passed": sum(1 for row in rows if row["passed"]),
            "failed": sum(1 for row in rows if not row["passed"]),
            "medianDomContentLoadedMs": round(
                statistics.median(row["domContentLoadedMs"] for row in rows), 1
            ),
        },
    }
    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    print(rendered)
    if args.output:
        output = args.output if args.output.is_absolute() else ROOT / args.output
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered + "\n")
    raise SystemExit(1 if report["summary"]["failed"] else 0)


if __name__ == "__main__":
    main()
