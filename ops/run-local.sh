#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
container=${DOJO_CONTAINER:-pwncollege-dojo}
default_image="pwncollege/dojo:local-$(git -C "$repo_dir" rev-parse --short=8 HEAD)"
if [[ -f "$repo_dir/cache/local-image" ]]; then
    default_image=$(<"$repo_dir/cache/local-image")
fi
image=${DOJO_IMAGE:-$default_image}
data_dir=${DOJO_DATA_DIR:-$repo_dir/data}
listen_address=${DOJO_LISTEN_ADDRESS:-127.0.0.1}
http_port=${DOJO_HTTP_PORT:-80}
https_port=${DOJO_HTTPS_PORT:-443}
ssh_port=${DOJO_SSH_PORT:-2223}

find "$repo_dir" \
    \( -path "$repo_dir/.git" -o -path "$repo_dir/data" -o -path "$repo_dir/cache" \) -prune -o \
    -exec chmod a+rX {} +

mkdir -p "$data_dir" "$repo_dir/cache"
DOJO_TLS_DIR="$data_dir/local-tls" "$repo_dir/ops/prepare-local-tls.sh" >/dev/null

if docker container inspect "$container" >/dev/null 2>&1; then
    docker start "$container" >/dev/null
    echo "$container is running"
    exit 0
fi

docker image inspect "$image" >/dev/null

if [[ ! -e /proc/sys/net/bridge/bridge-nf-call-iptables ]]; then
    docker run --rm --privileged -v /lib/modules:/lib/modules:ro "$image" modprobe br_netfilter
fi

env_args=(-e DOJO_ENV=production)
proxy_mount_args=()
udev_mount_args=()
if [[ -d /run/udev ]]; then
    # The container's systemd instance mounts its own /run and would hide a
    # bind mounted below it. Keep the host udev database at a stable path and
    # expose it through node-exporter's existing rootfs bind mount.
    udev_mount_args=(-v /run/udev:/host-run-udev:ro)
fi
if [[ -n ${DOJO_PROXY_URL:-} ]]; then
    if [[ ! $DOJO_PROXY_URL =~ ^https?://[A-Za-z0-9._:-]+$ ]]; then
        echo "DOJO_PROXY_URL contains unsupported characters" >&2
        exit 1
    fi
    env_args+=(
        -e "HTTP_PROXY=$DOJO_PROXY_URL"
        -e "HTTPS_PROXY=$DOJO_PROXY_URL"
        -e "http_proxy=$DOJO_PROXY_URL"
        -e "https_proxy=$DOJO_PROXY_URL"
        -e "NO_PROXY=localhost,127.0.0.1,::1,.local,db,cache,ctfd,nginx,sshd,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
        -e "no_proxy=localhost,127.0.0.1,::1,.local,db,cache,ctfd,nginx,sshd,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
    )
    printf '%s\n' \
        '[Service]' \
        "Environment=\"HTTP_PROXY=$DOJO_PROXY_URL\"" \
        "Environment=\"HTTPS_PROXY=$DOJO_PROXY_URL\"" \
        'Environment="NO_PROXY=localhost,127.0.0.1,::1,.local,db,cache,ctfd,nginx,sshd,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"' \
        > "$repo_dir/cache/docker-proxy.conf"
    proxy_mount_args=(-v "$repo_dir/cache/docker-proxy.conf:/etc/systemd/system/docker.service.d/proxy.conf:ro")
fi

docker run \
    --name "$container" \
    --restart unless-stopped \
    --privileged \
    -d \
    "${env_args[@]}" \
    "${proxy_mount_args[@]}" \
    "${udev_mount_args[@]}" \
    -v /lib/modules:/lib/modules:ro \
    --mount "type=bind,src=$repo_dir,dst=/opt/pwn.college,bind-recursive=disabled" \
    -v "$data_dir:/data:shared" \
    -p "$listen_address:$http_port:80" \
    -p "$listen_address:$https_port:443" \
    -p "$listen_address:$ssh_port:22" \
    "$image"

echo "HTTPS: https://localhost.pwn.college:$https_port"
echo "SSH:   $listen_address:$ssh_port"
