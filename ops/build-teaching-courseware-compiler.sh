#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "$0")/.." && pwd)
exec "$root/services/cocreation-workbench/node_modules/.bin/esbuild" \
  "$root/services/deepseek-harness/courseware-compiler.ts" \
  --bundle --platform=node --target=node24 --format=esm --minify --supported:template-literal=false \
  --tsconfig="$root/services/agent-runtime/tsconfig.json" \
  --outfile="$root/services/deepseek-harness/courseware-compiler.mjs"
