#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
tls_dir=${DOJO_TLS_DIR:-$repo_dir/data/local-tls}
dojo_host=${DOJO_HOST:-localhost.pwn.college}
workspace_host=${WORKSPACE_HOST:-workspace.localhost.pwn.college}
future_host=${FUTURE_HOST:-future.localhost.pwn.college}

mkdir -p "$tls_dir"
chmod 700 "$tls_dir"

if [[ ! -s "$tls_dir/fullchain.pem" || ! -s "$tls_dir/privkey.pem" ]] || \
    ! openssl x509 -in "$tls_dir/fullchain.pem" -noout -checkend 2592000 >/dev/null 2>&1; then
    openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 397 \
        -subj "/CN=$dojo_host" \
        -addext "subjectAltName=DNS:$dojo_host,DNS:$workspace_host,DNS:$future_host" \
        -keyout "$tls_dir/privkey.pem" \
        -out "$tls_dir/fullchain.pem"
fi

chmod 600 "$tls_dir/privkey.pem"
chmod 644 "$tls_dir/fullchain.pem"
openssl x509 -in "$tls_dir/fullchain.pem" -noout -checkend 86400 >/dev/null
openssl x509 -in "$tls_dir/fullchain.pem" -noout -ext subjectAltName
