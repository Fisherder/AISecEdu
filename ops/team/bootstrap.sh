#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo_dir"
if [[ $repo_dir == /srv/aisecedu-dojo || $repo_dir == /srv/aisecedu-development-volume/aisecedu-dojo ]]; then
    printf '%s\n' '请在自己的源码副本运行，不在运行平台的挂载目录安装依赖。' >&2
    exit 1
fi
if [[ -x /opt/aisecedu-toolchains/node22/bin/node ]]; then
    export PATH="/opt/aisecedu-toolchains/node22/bin:/opt/aisecedu-toolchains/pnpm10/bin:$PATH"
fi
node -e 'if(Number(process.versions.node.split(".")[0])!==22) process.exit(1)'
python3 -m venv .venv
.venv/bin/python -m pip install --disable-pip-version-check -r ops/team/requirements.txt
printf '%s\n' 'Python 依赖已安装。运行 source .venv/bin/activate 后执行 make dev-check。' \
    '运行时依赖按需在 services/agent-runtime 执行 pnpm install --frozen-lockfile；重型构建先登记任务。'
