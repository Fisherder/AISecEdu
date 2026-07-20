#!/usr/bin/env bash
set -Eeuo pipefail

container=${DOJO_CONTAINER:-pwncollege-dojo}
proxy=${DOJO_PROXY_URL:?Set DOJO_PROXY_URL to a proxy reachable from the outer container}
no_proxy=${DOJO_NO_PROXY:-localhost,127.0.0.1,::1,.local,db,cache,ctfd,nginx,sshd,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16}

if [[ ! $proxy =~ ^https?://[A-Za-z0-9._:-]+$ ]]; then
    echo "DOJO_PROXY_URL contains unsupported characters" >&2
    exit 1
fi

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

printf '%s\n' \
    '[Service]' \
    "Environment=\"HTTP_PROXY=$proxy\"" \
    "Environment=\"HTTPS_PROXY=$proxy\"" \
    "Environment=\"NO_PROXY=$no_proxy\"" \
    > "$tmp_dir/proxy.conf"

for _ in $(seq 1 60); do
    if docker exec "$container" systemctl is-system-running >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

docker exec "$container" mkdir -p /etc/systemd/system/docker.service.d
docker cp "$tmp_dir/proxy.conf" "$container:/tmp/docker-proxy.conf"
docker exec "$container" install -m 0644 /tmp/docker-proxy.conf /etc/systemd/system/docker.service.d/proxy.conf
docker exec "$container" systemctl daemon-reload
docker exec "$container" systemctl restart docker.service
docker exec "$container" systemctl show docker.service -p Environment --value | grep -Fq "HTTPS_PROXY=$proxy"

echo "Nested Docker proxy configured: $proxy"
