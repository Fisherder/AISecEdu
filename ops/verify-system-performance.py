#!/usr/bin/env python3
import argparse
import html
import json
import math
import pathlib
import re
import runpy
import statistics
import time
from urllib.parse import urljoin


ROOT = pathlib.Path(__file__).resolve().parent.parent


def percentile(values, percent):
    ordered = sorted(values)
    index = max(0, math.ceil((percent / 100) * len(ordered)) - 1)
    return ordered[index]


def query_count(server_timing):
    match = re.search(r'db;[^,]*desc="(\d+) queries"', server_timing or "")
    return int(match.group(1)) if match else None


def sample(client, base_url, path, samples, warmups=1):
    for _ in range(warmups):
        response = client.get(base_url + path, timeout=30, allow_redirects=True)
        response.raise_for_status()
    durations = []
    sizes = []
    statuses = []
    server_timings = []
    final_url = path
    for _ in range(samples):
        started = time.perf_counter()
        response = client.get(base_url + path, timeout=30, allow_redirects=True)
        durations.append((time.perf_counter() - started) * 1000)
        sizes.append(len(response.content))
        statuses.append(response.status_code)
        server_timings.append(response.headers.get("Server-Timing"))
        final_url = response.url.removeprefix(base_url)
    return {
        "path": path,
        "status": sorted(set(statuses)),
        "p50Ms": round(statistics.median(durations), 1),
        "p95Ms": round(percentile(durations, 95), 1),
        "maxBytes": max(sizes),
        "finalUrl": final_url,
        "serverTiming": next((value for value in reversed(server_timings) if value), None),
        "serverQueryCountMax": max(
            (count for count in map(query_count, server_timings) if count is not None),
            default=None,
        ),
    }


def check_budget(result, latency_ms, bytes_limit, query_limit=None):
    failures = []
    if result["status"] != [200]:
        failures.append(f"状态码为 {result['status']}")
    if result["p95Ms"] > latency_ms:
        failures.append(f"P95 {result['p95Ms']}ms 超过 {latency_ms}ms")
    if result["maxBytes"] > bytes_limit:
        failures.append(f"响应 {result['maxBytes']}B 超过 {bytes_limit}B")
    if query_limit is not None:
        if result["serverQueryCountMax"] is None:
            failures.append("缺少数据库查询计数")
        elif result["serverQueryCountMax"] > query_limit:
            failures.append(
                f"查询 {result['serverQueryCountMax']} 次超过 {query_limit} 次"
            )
    result["budget"] = {
        "p95Ms": latency_ms,
        "maxBytes": bytes_limit,
        "maxQueries": query_limit,
    }
    result["passed"] = not failures
    result["failures"] = failures


def asset_report(client, base_url):
    page = client.get(base_url + "/student", timeout=30)
    page.raise_for_status()
    urls = []
    for value in re.findall(r'''(?:src|href)=["']([^"']+)["']''', page.text):
        value = html.unescape(value)
        if "/themes/" in value:
            urls.append(urljoin(base_url, value))
    rows = []
    for url in dict.fromkeys(urls):
        response = client.get(url, timeout=30)
        cache_control = response.headers.get("Cache-Control", "")
        versioned = "?" in url and ("v=" in url or "d=" in url)
        rows.append(
            {
                "path": url.removeprefix(base_url),
                "status": response.status_code,
                "bytes": len(response.content),
                "cacheControl": cache_control,
                "versioned": versioned,
                "passed": response.status_code == 200
                and (not versioned or "immutable" in cache_control),
            }
        )
    return {
        "count": len(rows),
        "failed": [row for row in rows if not row["passed"]],
        "passed": all(row["passed"] for row in rows),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", type=int, default=5)
    parser.add_argument("--output", type=pathlib.Path)
    args = parser.parse_args()
    if args.samples < 3:
        parser.error("--samples 至少为 3")

    module = runpy.run_path(str(ROOT / "ops/verify-learning-flow.py"))
    username, password = module["credentials"]()
    authenticated = module["authenticate"](username, password)
    anonymous = module["client_session"]()
    base_url = module["BASE_URL"]
    route_specs = [
        ("public", anonymous, "/", 500, 96_000, None),
        ("public", anonymous, "/dojos", 600, 160_000, None),
        ("public", anonymous, "/login", 350, 64_000, None),
        ("learning", authenticated, "/student", 350, 96_000, None),
        ("learning", authenticated, "/dojos", 750, 250_000, None),
        ("learning", authenticated, "/guide", 350, 96_000, None),
        ("teaching", authenticated, "/teacher", 350, 128_000, None),
        ("teaching", authenticated, "/teacher/courses", 350, 160_000, None),
        ("admin", authenticated, "/admin", 350, 128_000, 20),
        ("admin", authenticated, "/admin/users", 450, 180_000, 20),
        ("admin", authenticated, "/admin/challenges", 450, 180_000, 20),
        ("admin", authenticated, "/admin/dojos", 500, 180_000, 30),
        ("admin", authenticated, "/admin/desktops", 650, 180_000, 30),
        ("admin", authenticated, "/admin/submissions", 450, 180_000, 20),
        ("admin", authenticated, "/admin/config", 550, 220_000, 30),
        ("account", authenticated, "/settings", 400, 128_000, None),
        ("account", authenticated, "/hacker/", 400, 96_000, None),
    ]
    api_specs = [
        ("shell", "/pwncollege_api/v1/ui/bootstrap?view=navigation&path=/teacher", 150, 8_000, 30, 1),
        ("learning", "/pwncollege_api/v1/learning/overview?view=home", 350, 32_000, 30, 1),
        ("teaching", "/pwncollege_api/v1/teaching/context?view=teacher-shell", 300, 64_000, 20, 1),
        ("teaching", "/pwncollege_api/v1/teaching/courses?page=1&pageSize=30&filter=all&sort=recent", 500, 64_000, 25, 1),
        ("teaching", "/pwncollege_api/v1/teaching/dashboard?view=core", 500, 64_000, 40, 1),
        ("teaching", "/pwncollege_api/v1/teaching/jobs?view=all&limit=50&offset=0", 350, 96_000, 30, 1),
        ("background-cold", "/pwncollege_api/v1/teaching/dashboard?view=learning&refresh=1", 500, 64_000, 80, 0),
        ("background-warm", "/pwncollege_api/v1/teaching/dashboard?view=learning", 200, 64_000, 20, 1),
    ]
    routes = []
    for scope, client, path, latency_ms, bytes_limit, query_limit in route_specs:
        result = sample(client, base_url, path, args.samples)
        result["scope"] = scope
        check_budget(result, latency_ms, bytes_limit, query_limit)
        routes.append(result)
    apis = []
    for scope, path, latency_ms, bytes_limit, query_limit, warmups in api_specs:
        result = sample(
            authenticated,
            base_url,
            path,
            args.samples,
            warmups=warmups,
        )
        result["scope"] = scope
        check_budget(result, latency_ms, bytes_limit, query_limit)
        apis.append(result)
    assets = asset_report(authenticated, base_url)
    failures = [
        {"path": row["path"], "failures": row["failures"]}
        for row in routes + apis
        if not row["passed"]
    ]
    if not assets["passed"]:
        failures.append({"path": "theme-assets", "failures": assets["failed"]})
    report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "baseUrl": base_url,
        "samplesPerTarget": args.samples,
        "routes": routes,
        "apis": apis,
        "assets": assets,
        "passed": not failures,
        "failures": failures,
    }
    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    print(rendered)
    if args.output:
        output = args.output if args.output.is_absolute() else ROOT / args.output
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered + "\n")
    raise SystemExit(0 if report["passed"] else 1)


if __name__ == "__main__":
    main()
