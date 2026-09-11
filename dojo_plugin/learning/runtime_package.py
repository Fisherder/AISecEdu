import json


WINDOWS_GATE_TRANSPORT = '''
def live_binding_value(binding):
    import base64
    import subprocess

    service = services_by_name.get(binding["service"])
    if not service or not service.get("port"):
        return missing
    try:
        result = subprocess.run(
            ["/usr/local/bin/windows-request"],
            input=json.dumps({"operation": "http", "service": service["name"], "binding": binding}),
            text=True, capture_output=True, timeout=15,
        )
        if result.returncode:
            return missing
        observed = json.loads(result.stdout)
        if not observed.get("ok"):
            return missing
        body = base64.b64decode(observed["body"], validate=True)
        if len(body) > max_response_bytes:
            return missing
        if binding["capture"] == "status":
            return observed["status"]
        if binding["capture"] == "body_sha256":
            return hashlib.sha256(body).hexdigest()
        if binding["capture"] == "json_field":
            return field_value(json.loads(body.decode("utf-8-sig")), binding["selector"])
    except (OSError, ValueError, KeyError, subprocess.TimeoutExpired):
        return missing
    return missing

'''


def install_runtime_package(package_path, spec):
    if spec.get("runtimeEnvironment", "linux") != "windows":
        return
    manifest = {
        "version": 1,
        "name": spec["name"],
        "files": [
            {"path": item["path"], "content": str(item.get("content") or "")}
            for item in spec.get("starterFiles") or []
        ],
        "services": (spec.get("runtimeContract") or {}).get("services") or [],
    }
    (package_path / "runtime-public.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    launcher = package_path / "runtime-launcher.py"
    launcher.write_text(
        '#!/usr/bin/python3\nimport subprocess\nsubprocess.run(["/usr/local/bin/windows-runtime-start"], check=True)\n',
        encoding="utf-8",
    )
    launcher.chmod(0o700)
    checker = package_path / "check-server.py"
    source = checker.read_text(encoding="utf-8")
    if "def live_binding_value(binding):" in source:
        start = source.index("def process_start_time(pid):")
        stop = source.index("def validate_goal(arguments):", start)
        source = source[:start] + WINDOWS_GATE_TRANSPORT + source[stop:]
        checker.write_text(source, encoding="utf-8")
