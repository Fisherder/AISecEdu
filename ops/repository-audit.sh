#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"

failures=0
source_mode=archive
if [[ -e $repo_dir/.git ]] && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    source_mode=git
fi

source_paths() {
    if [[ $source_mode == git ]]; then
        git ls-files -z
    else
        find . -mindepth 1 \( -type f -o -type l \) -print0
    fi
}

shell_scripts() {
    if [[ $source_mode == git ]]; then
        git ls-files -z '*.sh' 'deploy.sh'
    else
        find . -type f \( -name '*.sh' -o -name 'deploy.sh' \) -print0
    fi
}

fail() {
    printf 'ERROR: %s\n' "$*" >&2
    failures=$((failures + 1))
}

for required_path in \
    README.md \
    docker-compose.yml \
    dojo_plugin \
    dojo_theme \
    services/agent-runtime/package.json \
    services/agent-runtime/pnpm-lock.yaml \
    workspace/flake.lock; do
    [[ -e $required_path ]] || fail "missing deployment source: $required_path"
done

if [[ $source_mode == git ]]; then
    first_party_paths=(
        .
        ':(exclude)agent_skills/**'
        ':(exclude)docs/**'
        ':(exclude)services/agent-runtime/**'
    )
    git diff --check -- "${first_party_paths[@]}" || fail "working-tree diff contains whitespace errors"
    git diff --cached --check -- "${first_party_paths[@]}" || fail "staged diff contains whitespace errors"
fi

while IFS= read -r -d '' source_path; do
    path=${source_path#./}
    case "$path" in
        data/*|cache/*|output/*|opt/*|sensai/*|ops/deployment.env|services/agent-runtime/assets/*)
            fail "runtime or local-only path is tracked: $path"
            ;;
        */node_modules/*|*/.next/*|*/.next-*/*|*/__pycache__/*|*/playwright-report/*|*/test-results/*)
            fail "generated dependency or build path is tracked: $path"
            ;;
        *.pyc|*.pyo|*.db|*.sqlite|*.sqlite3|*.tsbuildinfo)
            fail "generated file is tracked: $path"
            ;;
        .env|*/.env|.env.*|*/.env.*)
            case "$path" in
                *.env.example|*/.env.example) ;;
                *) fail "local environment file is tracked: $path" ;;
            esac
            ;;
    esac

    if [[ -L $path && ! -e $path ]]; then
        fail "tracked symbolic link has no target: $path"
    elif [[ -f $path && ! -L $path ]]; then
        size=$(stat -c %s -- "$path")
        if ((size > 50 * 1024 * 1024)); then
            fail "tracked file exceeds 50 MiB: $path"
        fi
        if [[ $source_mode == archive ]]; then
            case "$path" in
                services/agent-runtime/tests/*|test/*) ;;
                *)
                    if grep -I -q -E -e \
                        '-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}' \
                        -- "$path"; then
                        fail "high-confidence credential marker in packaged source: $path"
                    fi
                    ;;
            esac
        fi
    fi
done < <(source_paths)

secret_paths=$(mktemp)
compose_log=$(mktemp)
trap 'rm -f "$secret_paths" "$compose_log"' EXIT

if [[ $source_mode == git ]]; then
    if git grep --cached -I -l -E -e \
        '-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}' \
        -- . ':(exclude)services/agent-runtime/tests/**' ':(exclude)test/**' >"$secret_paths"; then
        while IFS= read -r path; do
            fail "high-confidence credential marker in tracked source: $path"
        done < "$secret_paths"
    fi
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    if ! GLOBAL_AGENT_RUNTIME_TICKET_SECRET=repository-audit-ticket-secret \
        GLOBAL_AGENT_RUNTIME_SERVICE_SECRET=repository-audit-service-secret \
        docker compose config --quiet 2>"$compose_log"; then
        cat "$compose_log" >&2
        fail "docker-compose.yml does not render with generated deployment secrets"
    fi
else
    printf 'WARN: Docker Compose is unavailable; compose rendering was skipped.\n' >&2
fi

if command -v bash >/dev/null 2>&1; then
    while IFS= read -r -d '' script; do
        bash -n "$script" || fail "shell syntax check failed: $script"
    done < <(shell_scripts)
fi

if ((failures > 0)); then
    printf 'Repository audit failed with %d issue(s).\n' "$failures" >&2
    exit 1
fi

source_count=$(source_paths | tr -cd '\0' | wc -c)
source_bytes=$(source_paths | xargs -0 -r stat -c %s | awk '{total += $1} END {print total + 0}')
printf 'Repository audit passed (%s mode): %d source files, %.1f MiB.\n' \
    "$source_mode" "$source_count" "$(awk -v bytes="$source_bytes" 'BEGIN {print bytes / 1024 / 1024}')"
