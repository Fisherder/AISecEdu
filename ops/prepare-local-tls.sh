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

regenerate_ca=false
if [[ ! -s "$tls_dir/ca.crt" || ! -s "$tls_dir/ca-key.pem" ]] || \
    ! openssl x509 -in "$tls_dir/ca.crt" -noout -checkend 2592000 >/dev/null 2>&1; then
    regenerate_ca=true
fi
if [[ $regenerate_ca == false ]] && \
    ! openssl verify -CAfile "$tls_dir/ca.crt" "$tls_dir/ca.crt" \
        2>/dev/null | grep -Fq ': OK'; then
    regenerate_ca=true
fi

if [[ $regenerate_ca == true ]]; then
    openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 \
        -out "$tls_dir/ca-key.pem"
    chmod 600 "$tls_dir/ca-key.pem"
    openssl req -x509 -new -sha256 -days 3650 \
        -key "$tls_dir/ca-key.pem" \
        -subj "/CN=pwn.college Local LAN CA" \
        -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
        -addext "keyUsage=critical,keyCertSign,cRLSign" \
        -out "$tls_dir/ca.crt"
fi

regenerate_server=$regenerate_ca
if [[ ! -s "$tls_dir/fullchain.pem" || ! -s "$tls_dir/privkey.pem" ]] || \
    ! openssl x509 -in "$tls_dir/fullchain.pem" -noout -checkend 2592000 >/dev/null 2>&1 || \
    ! openssl verify -CAfile "$tls_dir/ca.crt" -purpose sslserver \
        "$tls_dir/fullchain.pem" 2>/dev/null | grep -Fq ': OK'; then
    regenerate_server=true
fi
if [[ $regenerate_server == false ]]; then
    for name in "${dns_names[@]}"; do
        if ! openssl x509 -in "$tls_dir/fullchain.pem" -noout -checkhost "$name" \
            | grep -Fq 'does match certificate'; then
            regenerate_server=true
            break
        fi
    done
fi
if [[ $regenerate_server == false ]]; then
    for address in "${ip_addresses[@]}"; do
        if ! openssl x509 -in "$tls_dir/fullchain.pem" -noout -checkip "$address" \
            | grep -Fq 'does match certificate'; then
            regenerate_server=true
            break
        fi
    done
fi

if [[ $regenerate_server == true ]]; then
    if [[ ! -s "$tls_dir/privkey.pem" ]]; then
        openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 \
            -out "$tls_dir/privkey.pem"
    fi
    chmod 600 "$tls_dir/privkey.pem"

    csr=$(mktemp "$tls_dir/.server.XXXXXX.csr")
    trap 'rm -f "$csr"' EXIT
    openssl req -new -sha256 \
        -key "$tls_dir/privkey.pem" \
        -subj "/CN=$dojo_host" \
        -addext "basicConstraints=critical,CA:FALSE" \
        -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
        -addext "extendedKeyUsage=serverAuth" \
        -addext "subjectAltName=$subject_alt_names" \
        -out "$csr"
    openssl x509 -req -sha256 -days 397 \
        -in "$csr" \
        -CA "$tls_dir/ca.crt" \
        -CAkey "$tls_dir/ca-key.pem" \
        -set_serial "0x$(openssl rand -hex 16)" \
        -copy_extensions copy \
        -out "$tls_dir/fullchain.pem"
fi

chmod 600 "$tls_dir/ca-key.pem"
chmod 644 "$tls_dir/ca.crt"
chmod 600 "$tls_dir/privkey.pem"
chmod 644 "$tls_dir/fullchain.pem"
openssl x509 -in "$tls_dir/ca.crt" -noout -checkend 86400 >/dev/null
openssl x509 -in "$tls_dir/fullchain.pem" -noout -checkend 86400 >/dev/null
openssl verify -CAfile "$tls_dir/ca.crt" -purpose sslserver \
    -verify_hostname "$dojo_host" "$tls_dir/fullchain.pem"
openssl x509 -in "$tls_dir/ca.crt" -noout -fingerprint -sha256
openssl x509 -in "$tls_dir/fullchain.pem" -noout -ext subjectAltName
