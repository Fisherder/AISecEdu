#!/usr/bin/env bash
set -euo pipefail
host=${AISECEDU_DEVELOPMENT_HOST:-ubuntu@10.92.35.7}
control=/tmp/aisecedu-full-development-ssh-$UID
if python3 -c 'import urllib.request; assert "ready" in urllib.request.urlopen("http://127.0.0.1:28080/lan-health", timeout=2).read().decode()' >/dev/null 2>&1; then
  printf '%s\n' '完整开发环境：http://127.0.0.1:28080/teacher'
  exit 0
fi
ssh -fNM -S "$control" -o ControlMaster=auto -o ControlPersist=8h -o ExitOnForwardFailure=yes \
  -L 127.0.0.1:28080:127.0.0.1:28080 -L 127.0.0.1:28443:127.0.0.1:28443 \
  -L 127.0.0.1:4443:127.0.0.1:24443 "$host"
printf '%s\n' '完整开发环境：http://127.0.0.1:28080/teacher'
