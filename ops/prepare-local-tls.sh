#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
# shellcheck source=load-deployment-env.sh
source "$repo_dir/ops/load-deployment-env.sh"

tls_dir=${DOJO_TLS_DIR:-$repo_dir/data/local-tls}
dojo_host=${DOJO_HOST:-localhost.pwn.college}
workspace_host=${WORKSPACE_HOST:-workspace.localhost.pwn.college}
future_host=${FUTURE_HOST:-future.localhost.pwn.college}

dns_names=("$dojo_host" "$workspace_host" "$future_host")
if [[ -n ${DOJO_TLS_EXTRA_DNS:-} ]]; then
    IFS=, read -r -a extra_dns_names <<<"$DOJO_TLS_EXTRA_DNS"
    dns_names+=("${extra_dns_names[@]}")
fi
ip_addresses=()
if [[ -n ${DOJO_TLS_IPS:-} ]]; then
    IFS=, read -r -a ip_addresses <<<"$DOJO_TLS_IPS"
fi

san_entries=()
for name in "${dns_names[@]}"; do
    [[ $name =~ ^[A-Za-z0-9.-]+$ ]] || {
        echo "Invalid TLS DNS name: $name" >&2
        exit 1
    }
    san_entries+=("DNS:$name")
done
for address in "${ip_addresses[@]}"; do
    [[ $address =~ ^[0-9A-Fa-f:.]+$ ]] || {
        echo "Invalid TLS IP address: $address" >&2
        exit 1
    }
    san_entries+=("IP:$address")
done
printf -v subject_alt_names '%s,' "${san_entries[@]}"
subject_alt_names=${subject_alt_names%,}

mkdir -p "$tls_dir"
chmod 700 "$tls_dir"

regenerate=false
if [[ ! -s "$tls_dir/fullchain.pem" || ! -s "$tls_dir/privkey.pem" ]] || \
    ! openssl x509 -in "$tls_dir/fullchain.pem" -noout -checkend 2592000 >/dev/null 2>&1; then
    regenerate=true
fi
if [[ $regenerate == false ]]; then
    for name in "${dns_names[@]}"; do
        if ! openssl x509 -in "$tls_dir/fullchain.pem" -noout -checkhost "$name" \
            | grep -Fq 'does match certificate'; then
            regenerate=true
            break
        fi
    done
fi
if [[ $regenerate == false ]]; then
    for address in "${ip_addresses[@]}"; do
        if ! openssl x509 -in "$tls_dir/fullchain.pem" -noout -checkip "$address" \
            | grep -Fq 'does match certificate'; then
            regenerate=true
            break
        fi
    done
fi

if [[ $regenerate == true ]]; then
    openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 397 \
        -subj "/CN=$dojo_host" \
        -addext "subjectAltName=$subject_alt_names" \
        -keyout "$tls_dir/privkey.pem" \
        -out "$tls_dir/fullchain.pem"
fi

chmod 600 "$tls_dir/privkey.pem"
chmod 644 "$tls_dir/fullchain.pem"
openssl x509 -in "$tls_dir/fullchain.pem" -noout -checkend 86400 >/dev/null
openssl x509 -in "$tls_dir/fullchain.pem" -noout -ext subjectAltName
