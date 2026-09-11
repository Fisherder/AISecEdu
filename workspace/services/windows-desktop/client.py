#!/usr/bin/python3
import json
import pathlib
import socket
import sys


def main():
    execution = pathlib.Path(sys.argv[0]).name == "windows-exec"
    readiness = execution and sys.argv[1:] == ["--ready"]
    if readiness:
        request = {"operation": "ready"}
    elif execution:
        request = {"operation": "exec", "command": " ".join(sys.argv[1:])}
    else:
        request = json.loads(sys.stdin.read(20001))
    with socket.socket(socket.AF_UNIX) as connection:
        connection.settimeout(360)
        connection.connect("/run/windows-runtime.sock")
        connection.sendall(json.dumps(request).encode() + b"\n")
        with connection.makefile("rb") as stream:
            result = json.loads(stream.readline(250001))
    if execution and not readiness and result.get("ok"):
        if not isinstance(result.get("exitCode"), int):
            raise ValueError("Windows did not report the program exit code")
        print(result.get("stdout") or "", end="")
        print(result.get("stderr") or "", end="", file=sys.stderr)
        return result["exitCode"]
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as exc:
        print(f"Windows runtime: {exc}", file=sys.stderr)
        raise SystemExit(1)
