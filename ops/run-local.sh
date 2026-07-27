#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
# shellcheck source=load-deployment-env.sh
source "$repo_dir/ops/load-deployment-env.sh"

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
workspace_https_port=${WORKSPACE_HTTPS_PORT:-4443}
dojo_host=${DOJO_HOST:-localhost.pwn.college}
workspace_host=${WORKSPACE_HOST:-workspace.localhost.pwn.college}
future_host=${FUTURE_HOST-}

if [[ ! $listen_address =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "DOJO_LISTEN_ADDRESS must be an IPv4 address: $listen_address" >&2
    exit 1
fi
if [[ $listen_address != 0.0.0.0 ]] && \
    ! ip -o -4 address show | grep -Eq "[[:space:]]${listen_address//./\\.}/"; then
    echo "DOJO_LISTEN_ADDRESS is not assigned to this host: $listen_address" >&2
    exit 1
fi
for port in "$http_port" "$https_port" "$ssh_port" "$workspace_https_port"; do
    if [[ ! $port =~ ^[0-9]+$ ]] || ((port < 1 || port > 65535)); then
        echo "Invalid deployment port: $port" >&2
        exit 1
    fi
done
if [[ $workspace_https_port == "$https_port" ]]; then
    echo "WORKSPACE_HTTPS_PORT must differ from DOJO_HTTPS_PORT in IP mode" >&2
    exit 1
fi
deployment_hosts=("$dojo_host" "$workspace_host")
if [[ -n $future_host ]]; then
    deployment_hosts+=("$future_host")
fi
for host in "${deployment_hosts[@]}"; do
    if [[ ! $host =~ ^[A-Za-z0-9.-]+$ ]]; then
        echo "Invalid deployment hostname: $host" >&2
        exit 1
    fi
done

for source_path in \
    "$repo_dir/docker-compose.yml" \
    "$repo_dir/dojo_plugin" \
    "$repo_dir/dojo_theme" \
    "$repo_dir/nginx" \
    "$repo_dir/ops"; do
    if [[ ! -r $source_path ]]; then
        echo "Deployment source is not readable: $source_path" >&2
        exit 1
    fi
done

mkdir -p "$data_dir" "$repo_dir/cache"
DOJO_TLS_DIR="$data_dir/local-tls" "$repo_dir/ops/prepare-local-tls.sh" >/dev/null

if docker container inspect "$container" >/dev/null 2>&1; then
    current_listen_address=$(docker inspect -f '{{index .Config.Labels "local.pwncollege.listen-address"}}' "$container")
    current_dojo_host=$(docker inspect -f '{{index .Config.Labels "local.pwncollege.dojo-host"}}' "$container")
    current_workspace_host=$(docker inspect -f '{{index .Config.Labels "local.pwncollege.workspace-host"}}' "$container")
    current_workspace_https_port=$(docker inspect -f '{{index .Config.Labels "local.pwncollege.workspace-https-port"}}' "$container")
    if [[ $current_listen_address != "$listen_address" || \
        $current_dojo_host != "$dojo_host" || \
        $current_workspace_host != "$workspace_host" || \
        $current_workspace_https_port != "$workspace_https_port" ]]; then
        echo "$container exists with different deployment settings; back up data, then recreate it" >&2
        exit 1
    fi
    docker start "$container" >/dev/null
    echo "$container is running"
    exit 0
fi

docker image inspect "$image" >/dev/null

if [[ ! -e /proc/sys/net/bridge/bridge-nf-call-iptables ]]; then
    docker run --rm --privileged -v /lib/modules:/lib/modules:ro "$image" modprobe br_netfilter
fi

env_args=(
    -e DOJO_ENV=production
    -e "DOJO_HOST=$dojo_host"
    -e "WORKSPACE_HOST=$workspace_host"
    -e "WORKSPACE_HTTPS_PORT=$workspace_https_port"
    -e "DOJO_IP_MODE=${DOJO_IP_MODE:-false}"
)
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
    --label "local.pwncollege.listen-address=$listen_address" \
    --label "local.pwncollege.dojo-host=$dojo_host" \
    --label "local.pwncollege.workspace-host=$workspace_host" \
    --label "local.pwncollege.workspace-https-port=$workspace_https_port" \
    -d \
    "${env_args[@]}" \
    "${proxy_mount_args[@]}" \
    "${udev_mount_args[@]}" \
    -v /lib/modules:/lib/modules:ro \
    --mount "type=bind,src=$repo_dir,dst=/opt/pwn.college,bind-recursive=disabled" \
    -v "$data_dir:/data:shared" \
    -p "$listen_address:$http_port:80" \
    -p "$listen_address:$https_port:443" \
    -p "$listen_address:$workspace_https_port:4443" \
    -p "$listen_address:$ssh_port:22" \
    "$image"

echo "HTTPS: https://$dojo_host:$https_port"
echo "Workspace: https://$workspace_host:$workspace_https_port"
echo "SSH:   $listen_address:$ssh_port"
