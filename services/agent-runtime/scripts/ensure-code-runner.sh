#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNNER_IMAGE="${GLOBAL_AGENT_CODE_RUNNER_IMAGE:-${OPENMAIC_CODE_RUNNER_IMAGE:-aisecedu/code-runner:python-3.11}}"
BASE_IMAGE="${GLOBAL_AGENT_CODE_RUNNER_BASE_IMAGE:-${OPENMAIC_CODE_RUNNER_BASE_IMAGE:-aisecedu/runtime:toolchain-test}}"

if ! command -v docker >/dev/null 2>&1; then
  echo "警告：未找到 Docker，Python 代码容器将不可用。" >&2
  exit 0
fi

if docker image inspect "$RUNNER_IMAGE" >/dev/null 2>&1; then
  echo "Python 代码运行容器已就绪：$RUNNER_IMAGE"
  exit 0
fi

echo "正在构建 Python 代码运行容器：$RUNNER_IMAGE"
docker build \
  --build-arg "BASE_IMAGE=$BASE_IMAGE" \
  --tag "$RUNNER_IMAGE" \
  "$PROJECT_DIR/docker/code-runner"
