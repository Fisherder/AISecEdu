#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

XUANJIA_TEST_HOST="${XUANJIA_TEST_HOST:-0.0.0.0}"
PORT="${PORT:-3001}"
XUANJIA_TEST_PUBLIC_HOST="${XUANJIA_TEST_PUBLIC_HOST:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
XUANJIA_TEST_PUBLIC_HOST="${XUANJIA_TEST_PUBLIC_HOST:-127.0.0.1}"
OPENMAIC_DATA_DIR="${OPENMAIC_DATA_DIR:-$PROJECT_DIR/.xuanjia-test-data}"
OPENMAIC_NEXT_DIST_DIR="${OPENMAIC_NEXT_DIST_DIR:-.next-xuanjia-test}"
XUANJIA_TEST_TEACHER_USERNAME="${XUANJIA_TEST_TEACHER_USERNAME:-xuanjia_teacher}"
XUANJIA_TEST_TEACHER_PASSWORD="${XUANJIA_TEST_TEACHER_PASSWORD:-XuanjiaTeacher#2026}"
XUANJIA_TEST_STUDENT_USERNAME="${XUANJIA_TEST_STUDENT_USERNAME:-xuanjia_student}"
XUANJIA_TEST_STUDENT_PASSWORD="${XUANJIA_TEST_STUDENT_PASSWORD:-XuanjiaStudent#2026}"
TEACHER_INVITE_CODE="${TEACHER_INVITE_CODE:-xuanjia-local-invite-2026}"

export OPENMAIC_DATA_DIR OPENMAIC_NEXT_DIST_DIR
export XUANJIA_TEST_TEACHER_USERNAME XUANJIA_TEST_TEACHER_PASSWORD
export XUANJIA_TEST_STUDENT_USERNAME XUANJIA_TEST_STUDENT_PASSWORD
export TEACHER_INVITE_CODE
export STORAGE_BACKEND=pg
export GLOBAL_AGENT_CODE_RUNNER_IMAGE="${GLOBAL_AGENT_CODE_RUNNER_IMAGE:-${OPENMAIC_CODE_RUNNER_IMAGE:-aisecedu/code-runner:python-3.11}}"
# An explicitly empty value prevents .env.local from redirecting this manual
# test launcher to a shared/external database.
export DATABASE_URL=""

cd "$PROJECT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "错误：未找到 pnpm。请先安装 pnpm 10，并执行 pnpm install。" >&2
  exit 1
fi

# Seed only when this launcher can own the port. Besides producing a clearer
# error, this prevents two processes from opening the same embedded PGlite
# directory while a previous manual-test server is still running.
if command -v ss >/dev/null 2>&1 && ss -ltnH "sport = :$PORT" 2>/dev/null | grep -q .; then
  echo "错误：端口 $PORT 已有服务监听；玄甲测试服务可能已经启动。" >&2
  echo "请直接访问现有服务，或先停止它再重新运行本脚本。测试数据尚未重置。" >&2
  exit 1
fi

"$SCRIPT_DIR/ensure-code-runner.sh"

echo "正在初始化玄甲独立测试环境……"
node --import tsx scripts/seed-xuanjia-test.ts

echo
echo "============================================================"
echo "玄甲网安 AI 教学平台已准备启动"
echo "教师入口: http://$XUANJIA_TEST_PUBLIC_HOST:$PORT/teacher/login"
echo "  账号: $XUANJIA_TEST_TEACHER_USERNAME"
echo "  密码: $XUANJIA_TEST_TEACHER_PASSWORD"
echo "学生入口: http://$XUANJIA_TEST_PUBLIC_HOST:$PORT/student/login"
echo "  账号: $XUANJIA_TEST_STUDENT_USERNAME"
echo "  密码: $XUANJIA_TEST_STUDENT_PASSWORD"
echo "教师注册邀请码: $TEACHER_INVITE_CODE"
echo "演示课堂: http://$XUANJIA_TEST_PUBLIC_HOST:$PORT/classroom/xuanjia-demo-classroom"
echo "学生任务: http://$XUANJIA_TEST_PUBLIC_HOST:$PORT/student/tasks"
echo "学生自主学习: http://$XUANJIA_TEST_PUBLIC_HOST:$PORT/student/self-study"
echo "学生 AI 评价: http://$XUANJIA_TEST_PUBLIC_HOST:$PORT/student/review"
echo "测试数据目录: $OPENMAIC_DATA_DIR"
echo "按 Ctrl+C 停止服务。每次启动都会重置演示课堂的学习进度。"
echo "============================================================"
echo

exec pnpm dev --hostname "$XUANJIA_TEST_HOST" --port "$PORT"
