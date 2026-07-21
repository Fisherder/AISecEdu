#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
# shellcheck source=load-deployment-env.sh
source "$repo_dir/ops/load-deployment-env.sh"

container=${DOJO_CONTAINER:-pwncollege-dojo}
listen_address=${DOJO_LISTEN_ADDRESS:-127.0.0.1}
http_port=${DOJO_HTTP_PORT:-80}
https_port=${DOJO_HTTPS_PORT:-443}
ssh_port=${DOJO_SSH_PORT:-2223}
dojo_host=${DOJO_HOST:-localhost.pwn.college}
workspace_host=${WORKSPACE_HOST:-workspace.localhost.pwn.college}
future_host=${FUTURE_HOST:-future.localhost.pwn.college}
client_address=${DOJO_CLIENT_ADDRESS:-}
wait_timeout=${DOJO_VERIFY_TIMEOUT:-180}

pass() {
    printf 'PASS  %s\n' "$1"
}

wait_for() {
    local description=$1
    shift
    local deadline=$((SECONDS + wait_timeout))

    until "$@" >/dev/null 2>&1; do
        if ((SECONDS >= deadline)); then
            echo "Timed out waiting for $description after ${wait_timeout}s" >&2
            return 1
        fi
        sleep 2
    done
}

service_is_healthy() {
    local service=$1
    local health
    health=$(docker exec "$container" docker inspect -f '{{.State.Health.Status}}' "$service" 2>/dev/null || true)
    [[ $health == healthy ]]
}

one_shot_completed() {
    local service=$1
    local state
    state=$(docker exec "$container" docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' "$service" 2>/dev/null || true)
    [[ $state == "exited 0" ]]
}

stats_are_ready() {
    local logs
    logs=$(docker exec "$container" docker logs stats-worker 2>&1)
    grep -Fq 'Cold start complete - all stats initialized' <<<"$logs"
}

docker inspect -f '{{if .State.Running}}true{{else}}false{{end}}' "$container" | grep -qx true
pass "outer container is running"

for mapping in "80/tcp:$http_port" "443/tcp:$https_port" "22/tcp:$ssh_port"; do
    container_port=${mapping%%:*}
    host_port=${mapping#*:}
    binding=$(docker inspect -f \
        "{{(index (index .HostConfig.PortBindings \"$container_port\") 0).HostIp}}:{{(index (index .HostConfig.PortBindings \"$container_port\") 0).HostPort}}" \
        "$container")
    [[ $binding == "$listen_address:$host_port" ]]
done
pass "HTTP, HTTPS, and SSH are bound to the configured address"

for host in "$dojo_host" "$workspace_host" "$future_host"; do
    getent ahostsv4 "$host" | awk '{print $1}' | grep -Fxq "$listen_address"
done
pass "public and workspace hostnames resolve to the configured address"

if [[ -n $client_address ]]; then
    ip route get "$client_address" | grep -Fq "src $listen_address"
    ping -c 1 -W 3 "$client_address" >/dev/null
    pass "configured client address is reachable through the LAN route"
fi

wait_for "pwn.college systemd service" \
    docker exec "$container" systemctl is-active --quiet pwn.college.service
pass "pwn.college systemd service is active"

required_services=(
    frontend prometheus grafana node-exporter db pgbouncer cache homefs
    image-pull-worker nginx sshd dojofs watchdog cadvisor stats-worker ctfd
)
for service in "${required_services[@]}"; do
    state=$(docker exec "$container" docker inspect -f '{{.State.Status}}' "$service")
    if [[ $state != running ]]; then
        echo "$service is not running: $state" >&2
        exit 1
    fi
done
pass "all long-running inner services are running"

for service in pwncollege-create-workspace-net-1 pwncollege-prometheus-generate-targets-1 workspace-builder; do
    wait_for "$service completion" one_shot_completed "$service"
    state=$(docker exec "$container" docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' "$service")
    if [[ $state != "exited 0" ]]; then
        echo "$service did not complete successfully: $state" >&2
        exit 1
    fi
done
pass "all one-shot initialization services completed"

for service in db ctfd prometheus; do
    wait_for "$service health check" service_is_healthy "$service"
    health=$(docker exec "$container" docker inspect -f '{{.State.Health.Status}}' "$service")
    if [[ $health != healthy ]]; then
        echo "$service is not healthy: $health" >&2
        exit 1
    fi
done
pass "database, application, and metrics health checks are healthy"

prometheus_result=$(docker exec "$container" docker exec prometheus \
    wget -qO- 'http://127.0.0.1:9090/api/v1/query?query=up')
grep -Fq '"status":"success"' <<<"$prometheus_result"
grep -Fq '"job":"node_exporter"' <<<"$prometheus_result"
grep -Fq '"job":"cadvisor"' <<<"$prometheus_result"
pass "Prometheus collects node-exporter and cAdvisor metrics"

grafana_health=$(docker exec "$container" docker exec grafana \
    curl -fsS http://127.0.0.1:3000/api/health)
grep -Fq '"database": "ok"' <<<"$grafana_health"
pass "Grafana health API and database are ready"

wait_for "background statistics cold start" stats_are_ready
pass "background statistics cold start completed"

if [[ -n $(docker exec "$container" docker ps --filter health=unhealthy --format '{{.Names}}') ]]; then
    echo "An inner container is unhealthy" >&2
    exit 1
fi
pass "no inner container reports unhealthy"

docker exec "$container" docker exec db pg_isready -q
pass "PostgreSQL accepts connections"

[[ $(docker exec "$container" docker exec cache redis-cli ping) == PONG ]]
pass "Redis responds"

http_code=$(curl -sS -o /dev/null -w '%{http_code}' \
    --noproxy '*' \
    --resolve "$dojo_host:$http_port:$listen_address" \
    "http://$dojo_host:$http_port/")
[[ $http_code == 301 || $http_code == 302 || $http_code == 307 || $http_code == 308 ]]
pass "HTTP redirects to HTTPS"

lan_health=$(curl -fsS --noproxy '*' "http://$listen_address:$http_port/lan-health")
[[ $lan_health == "pwn.college LAN endpoint ready" ]]
downloaded_fingerprint=$(curl -fsS --noproxy '*' "http://$listen_address:$http_port/local-tls.crt" \
    | openssl x509 -noout -fingerprint -sha256)
local_fingerprint=$(openssl x509 -in "$repo_dir/data/local-tls/fullchain.pem" \
    -noout -fingerprint -sha256)
[[ $downloaded_fingerprint == "$local_fingerprint" ]]
pass "LAN health and public certificate endpoints are ready"

body=$(curl -ksS --fail \
    --noproxy '*' \
    --resolve "$dojo_host:$https_port:$listen_address" \
    "https://$dojo_host:$https_port/")
grep -qi 'pwn' <<<"$body"
pass "HTTPS application page renders"

for host in "$dojo_host" "$workspace_host" "$future_host"; do
    openssl x509 -in "$repo_dir/data/local-tls/fullchain.pem" -noout -checkhost "$host" \
        | grep -Fq 'does match certificate'
done
pass "local TLS certificate matches all local hostnames"

if [[ -n ${DOJO_TLS_IPS:-} ]]; then
    IFS=, read -r -a tls_ip_addresses <<<"$DOJO_TLS_IPS"
    for address in "${tls_ip_addresses[@]}"; do
        openssl x509 -in "$repo_dir/data/local-tls/fullchain.pem" -noout -checkip "$address" \
            | grep -Fq 'does match certificate'
    done
    pass "local TLS certificate matches configured IP addresses"
fi

unsigned_code=$(curl -ksS -o /dev/null -w '%{http_code}' \
    --noproxy '*' \
    --resolve "$workspace_host:$https_port:$listen_address" \
    "https://$workspace_host:$https_port/workspace/fake/invalid/7681/")
[[ $unsigned_code == 404 ]]
pass "workspace proxy rejects an invalid HMAC signature"

ssh-keyscan -T 5 -p "$ssh_port" "$listen_address" >/dev/null 2>&1
pass "SSH endpoint presents host keys"

docker exec "$container" findmnt -n /run/homefs >/dev/null
pass "workspace home filesystem is mounted"

docker exec "$container" docker run --rm --network none \
    --runtime io.containerd.run.kata.v2 alpine:3.20.3 /bin/true
pass "Kata v2 runtime launches an isolated container"

docker exec "$container" test -L /data/workspace/nix/var/nix/profiles/dojo-workspace
pass "workspace Nix profile is installed"

echo "All non-challenge health checks passed"
