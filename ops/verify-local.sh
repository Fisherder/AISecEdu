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
workspace_https_port=${WORKSPACE_HTTPS_PORT:-4443}
dojo_host=${DOJO_HOST:-localhost.pwn.college}
workspace_host=${WORKSPACE_HOST:-workspace.localhost.pwn.college}
future_host=${FUTURE_HOST-}
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

for mapping in \
    "80/tcp:$http_port" \
    "443/tcp:$https_port" \
    "4443/tcp:$workspace_https_port" \
    "22/tcp:$ssh_port"; do
    container_port=${mapping%%:*}
    host_port=${mapping#*:}
    binding=$(docker inspect -f \
        "{{(index (index .HostConfig.PortBindings \"$container_port\") 0).HostIp}}:{{(index (index .HostConfig.PortBindings \"$container_port\") 0).HostPort}}" \
        "$container")
    [[ $binding == "$listen_address:$host_port" ]]
done
pass "HTTP, HTTPS, Workspace HTTPS, and SSH are bound to the configured address"

endpoint_hosts=("$dojo_host" "$workspace_host")
if [[ -n $future_host ]]; then
    endpoint_hosts+=("$future_host")
fi
for host in "${endpoint_hosts[@]}"; do
    getent ahostsv4 "$host" | awk '{print $1}' | grep -Fxq "$listen_address"
done
pass "Web and Workspace endpoint addresses resolve locally"

if [[ -n $client_address ]]; then
    ip route get "$client_address" | grep -Fq "src $listen_address"
    ping -c 1 -W 3 "$client_address" >/dev/null
    pass "configured client address is reachable through the LAN route"
fi

wait_for "application systemd service" \
    docker exec "$container" systemctl is-active --quiet pwn.college.service
pass "application systemd service is active"

required_services=(
    prometheus grafana node-exporter db pgbouncer cache homefs
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

if docker exec "$container" docker inspect -f '{{.State.Running}}' frontend 2>/dev/null | grep -qx true; then
    echo "The optional frontend container must not run on the canonical AISecEdu UI deployment" >&2
    exit 1
fi
pass "the optional frontend service is not running"

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

nginx_config=$(docker exec "$container" docker exec nginx nginx -T 2>&1)
grep -Fq 'location ^~ /pwncollege_api/v1/learning/' <<<"$nginx_config"
grep -Fq 'proxy_read_timeout 3600s' <<<"$nginx_config"
grep -Fq 'listen 4443 ssl' <<<"$nginx_config"
grep -Fq 'proxy_set_header Cookie $workspace_cookie' <<<"$nginx_config"
grep -Fq 'proxy_cookie_path ~^.*$' <<<"$nginx_config"
grep -Fq 'location ~ "^/w/(?P<container_id>[0-9a-f]{12})/auth/' <<<"$nginx_config"
grep -Fq 'secure_link_hmac "$cookie_aisecedu_workspace_cap"' <<<"$nginx_config"
ctfd_environment=$(docker exec "$container" docker inspect -f \
    '{{range .Config.Env}}{{println .}}{{end}}' ctfd)
grep -Fq 'GUNICORN_CMD_ARGS=--timeout 3600 --graceful-timeout 3600' \
    <<<"$ctfd_environment"
grep -Fxq "WORKSPACE_HTTPS_PORT=$workspace_https_port" <<<"$ctfd_environment"
grep -Fxq 'DOJO_IP_MODE=true' <<<"$ctfd_environment"
pass "AI learning requests retain aligned 3600-second proxy and worker windows"

docker exec "$container" docker exec db pg_isready -q
pass "PostgreSQL accepts connections"

[[ $(docker exec "$container" docker exec cache redis-cli ping) == PONG ]]
pass "Redis responds"

docker exec "$container" docker cp \
    /opt/pwn.college/ops/verify-ai-routing.py \
    ctfd:/tmp/verify-ai-routing.py
docker exec "$container" docker exec \
    -e PYTHONPATH=/opt/CTFd \
    ctfd python /tmp/verify-ai-routing.py
pass "DeepSeek Guide, Tutor, Grader, and self-healing authoring routes are correct"

http_code=$(curl -sS -o /dev/null -w '%{http_code}' \
    --noproxy '*' \
    --resolve "$dojo_host:$http_port:$listen_address" \
    "http://$dojo_host:$http_port/")
[[ $http_code == 301 || $http_code == 302 || $http_code == 307 || $http_code == 308 ]]
pass "HTTP redirects to HTTPS"

lan_health=$(curl -fsS --noproxy '*' "http://$listen_address:$http_port/lan-health")
[[ $lan_health == "AISecEdu LAN endpoint ready" ]]
downloaded_fingerprint=$(curl -fsS --noproxy '*' "http://$listen_address:$http_port/local-tls.crt" \
    | openssl x509 -noout -fingerprint -sha256)
local_fingerprint=$(openssl x509 -in "$repo_dir/data/local-tls/ca.crt" \
    -noout -fingerprint -sha256)
[[ $downloaded_fingerprint == "$local_fingerprint" ]]
pass "LAN health and local CA certificate endpoints are ready"

body=$(curl -sS --fail \
    --noproxy '*' \
    --cacert "$repo_dir/data/local-tls/ca.crt" \
    --resolve "$dojo_host:$https_port:$listen_address" \
    "https://$dojo_host:$https_port/")
grep -Fq 'brand-mono-bold wordmark-large' <<<"$body"
grep -Fq '在动手实践中学习网络安全。' <<<"$body"
grep -Fq '<span class="brand-white">AISecEdu</span>' <<<"$body"
if grep -Fiq 'pwn.college' <<<"$body"; then
    echo "Legacy pwn.college branding remains on the AISecEdu homepage" >&2
    exit 1
fi
pass "the AISecEdu course homepage renders with the local CA"

session_headers=$(curl -sS -D - -o /dev/null \
    --noproxy '*' \
    --cacert "$repo_dir/data/local-tls/ca.crt" \
    --resolve "$dojo_host:$https_port:$listen_address" \
    "https://$dojo_host:$https_port/")
grep -Eiq '^set-cookie: __Host-aisecedu-session=.*; Secure; HttpOnly; Path=/; SameSite=Lax' \
    <<<"$session_headers"
pass "the IP-mode application session uses an isolated secure cookie"

for path in /login /register /reset_password; do
    learner_page=$(curl -sS --fail \
        --noproxy '*' \
        --cacert "$repo_dir/data/local-tls/ca.crt" \
        --resolve "$dojo_host:$https_port:$listen_address" \
        "https://$dojo_host:$https_port$path")
    grep -Fq 'brand-mono-bold wordmark' <<<"$learner_page"
    grep -Fq '>AISecEdu</span>' <<<"$learner_page"
    if grep -Fiq 'pwn.college' <<<"$learner_page"; then
        echo "Legacy pwn.college branding remains on $path" >&2
        exit 1
    fi
done
pass "authentication pages use AISecEdu branding"

for asset in ui learning-common learning-overview learning-dashboard learning-studio learning-tutor learning-guide learning-score; do
    curl -sS --fail -o /dev/null \
        --noproxy '*' \
        --cacert "$repo_dir/data/local-tls/ca.crt" \
        --resolve "$dojo_host:$https_port:$listen_address" \
        "https://$dojo_host:$https_port/themes/dojo_theme/static/js/dojo/$asset.min.js"
done
pass "all native learning theme scripts are served"

if grep -Eq 'installAlertPromoter|promoteInlineAlert' \
    "$repo_dir/dojo_theme/static/js/dojo/ui.js"; then
    echo "Global inline-alert promotion must remain disabled" >&2
    exit 1
fi
unexpected_dialog_users=$(
    find "$repo_dir/dojo_theme/static/js/dojo" -maxdepth 1 -type f -name '*.js' \
        ! -name 'ui.js' \
        ! -name 'learning-studio.js' \
        -exec grep -El 'window\.AISecEduUI\.(notify|dialog)[[:space:]]*\(' {} + || true
)
if [[ -n $unexpected_dialog_users ]]; then
    echo "Ordinary learner notices leaked into blocking dialogs:" >&2
    echo "$unexpected_dialog_users" >&2
    exit 1
fi
native_dialog_users=$(
    find "$repo_dir/dojo_theme/static/js/dojo" -maxdepth 1 -type f -name '*.js' \
        -exec grep -El 'window\.(confirm|prompt|alert)[[:space:]]*\(' {} + || true
)
if [[ -n $native_dialog_users ]]; then
    echo "Browser-native dialogs remain in the AISecEdu interface:" >&2
    echo "$native_dialog_users" >&2
    exit 1
fi
grep -Fq 'id="workspace-notification-banner"' \
    "$repo_dir/dojo_theme/templates/components/actionbar.html"
grep -Fq 'pointer-events: none;' \
    "$repo_dir/dojo_theme/templates/components/actionbar.html"
grep -Fq 'function showStudioNotice' \
    "$repo_dir/dojo_theme/static/js/dojo/learning-studio.js"
if grep -Eq 'id="studio-level"|id="studio-validate"' \
    "$repo_dir/dojo_theme/templates/learning_studio.html"; then
    echo "Teacher authoring still exposes manual strategy or validation controls" >&2
    exit 1
fi
if grep -Fq 'data.get("level"' \
    "$repo_dir/dojo_plugin/api/v1/learning.py"; then
    echo "Teacher-controlled strategy still reaches the authoring API" >&2
    exit 1
fi
grep -Fq 'Agent 自动选择出题策略' \
    "$repo_dir/dojo_plugin/api/v1/learning.py"
grep -Fq 'autonomously_validate_draft' \
    "$repo_dir/dojo_plugin/api/v1/learning.py"
grep -Fq 'validation-repair-' \
    "$repo_dir/dojo_plugin/learning/authoring.py"
pass "learner notices stay inline and deliberate confirmations use the unified UI"
pass "teacher authoring uses automatic strategy selection and visible validation-repair rounds"

grep -Fq 'assess_attempt(learning_attempt, run_model=False)' \
    "$repo_dir/dojo_plugin/__init__.py"
grep -Fq 'challengeAttemptWithTimeout' \
    "$repo_dir/dojo_theme/static/js/dojo/actionbar.js"
grep -Fq '.finally(function () {' \
    "$repo_dir/dojo_theme/static/js/dojo/actionbar.js"
grep -Fq 'id="challenge-stop"' \
    "$repo_dir/dojo_theme/templates/components/actionbar.html"
grep -Fq '<span>重启</span>' \
    "$repo_dir/dojo_theme/templates/components/actionbar.html"
grep -Fq 'data-tutor-status' \
    "$repo_dir/dojo_theme/templates/components/learning_tutor.html"
grep -Fq 'data-workspace-web-link' \
    "$repo_dir/dojo_theme/templates/components/actionbar.html"
grep -Fq 'href: `/learning/scores/latest/${challengeId}`' \
    "$repo_dir/dojo_theme/static/js/dojo/actionbar.js"
grep -Fq 'id="learning-score-page"' \
    "$repo_dir/dojo_theme/templates/learning_score.html"
if grep -Eq 'data-tutor-notice|data-tutor-context-badges|容器待就绪' \
    "$repo_dir/dojo_theme/templates/components/learning_tutor.html" \
    "$repo_dir/dojo_theme/static/js/dojo/learning-tutor.js"; then
    echo "Legacy Tutor readiness content remains in the workspace panel" >&2
    exit 1
fi
pass "Flag submission, Tutor readiness, and container lifecycle regressions are guarded"

dojo_listing=$(curl -sS --fail \
    --noproxy '*' \
    --cacert "$repo_dir/data/local-tls/ca.crt" \
    --resolve "$dojo_host:$https_port:$listen_address" \
    "https://$dojo_host:$https_port/dojos")
grep -Fq 'AISecEdu</span><span class="brand-dot brand-blink">.</span><span class="brand-green">课程</span>' <<<"$dojo_listing"
grep -Fq 'class="container course-catalog"' <<<"$dojo_listing"
grep -Fq 'class="card-list"' <<<"$dojo_listing"
if grep -Fiq 'pwn.college' <<<"$dojo_listing"; then
    echo "Legacy pwn.college branding remains in the course catalog" >&2
    exit 1
fi
pass "the grouped AISecEdu course catalog renders directly"

forgot_redirect=$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' \
    --noproxy '*' \
    --cacert "$repo_dir/data/local-tls/ca.crt" \
    --resolve "$dojo_host:$https_port:$listen_address" \
    "https://$dojo_host:$https_port/forgot-password")
[[ $forgot_redirect == "308 https://$dojo_host/reset_password" || $forgot_redirect == "308 https://$dojo_host:$https_port/reset_password" ]]
pass "the removed frontend password URL redirects to the canonical authentication page"

if [[ -n $future_host ]]; then
    future_redirect=$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' \
        --noproxy '*' \
        --cacert "$repo_dir/data/local-tls/ca.crt" \
        --resolve "$future_host:$https_port:$listen_address" \
        "https://$future_host:$https_port/dojos")
    [[ $future_redirect == "308 https://$dojo_host/dojos" || $future_redirect == "308 https://$dojo_host:$https_port/dojos" ]]
    pass "the historical Future host redirects to the canonical AISecEdu UI"
fi

auth_config=$(curl -sS --fail \
    --noproxy '*' \
    --cacert "$repo_dir/data/local-tls/ca.crt" \
    --resolve "$dojo_host:$https_port:$listen_address" \
    "https://$dojo_host:$https_port/pwncollege_api/v1/auth/config")
grep -Fq 'registrationEnabled' <<<"$auth_config"
commitment=$(jq -r '.data.commitment.text' <<<"$auth_config")
grep -Fq 'AISecEdu 课程题目' <<<"$commitment"
if grep -Fq 'AISecEdu DOJO' <<<"$commitment"; then
    echo "Legacy product name was returned by authentication configuration" >&2
    exit 1
fi
pass "authentication compatibility API is ready"

for host in "${endpoint_hosts[@]}"; do
    if [[ $host =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ || $host == *:* ]]; then
        openssl x509 -in "$repo_dir/data/local-tls/fullchain.pem" -noout -checkip "$host" \
            | grep -Fq 'does match certificate'
        openssl verify -CAfile "$repo_dir/data/local-tls/ca.crt" \
            -purpose sslserver -verify_ip "$host" \
            "$repo_dir/data/local-tls/fullchain.pem" | grep -Fq ': OK'
    else
        openssl x509 -in "$repo_dir/data/local-tls/fullchain.pem" -noout -checkhost "$host" \
            | grep -Fq 'does match certificate'
        openssl verify -CAfile "$repo_dir/data/local-tls/ca.crt" \
            -purpose sslserver -verify_hostname "$host" \
            "$repo_dir/data/local-tls/fullchain.pem" | grep -Fq ': OK'
    fi
done
pass "CA-signed TLS certificate matches all configured endpoint addresses"

if [[ -n ${DOJO_TLS_IPS:-} ]]; then
    IFS=, read -r -a tls_ip_addresses <<<"$DOJO_TLS_IPS"
    for address in "${tls_ip_addresses[@]}"; do
        openssl x509 -in "$repo_dir/data/local-tls/fullchain.pem" -noout -checkip "$address" \
            | grep -Fq 'does match certificate'
        openssl verify -CAfile "$repo_dir/data/local-tls/ca.crt" \
            -purpose sslserver -verify_ip "$address" \
            "$repo_dir/data/local-tls/fullchain.pem" | grep -Fq ': OK'
    done
    pass "local TLS certificate matches configured IP addresses"
fi

workspace_trust=$(curl -sS --fail \
    --noproxy '*' \
    --cacert "$repo_dir/data/local-tls/ca.crt" \
    --resolve "$workspace_host:$workspace_https_port:$listen_address" \
    "https://$workspace_host:$workspace_https_port/trust-check")
[[ $workspace_trust == "AISecEdu Workspace TLS is trusted and reachable" ]]
pass "the IP Workspace port is reachable with the local CA"

unsigned_code=$(curl -sS -o /dev/null -w '%{http_code}' \
    --noproxy '*' \
    --cacert "$repo_dir/data/local-tls/ca.crt" \
    --resolve "$workspace_host:$workspace_https_port:$listen_address" \
    "https://$workspace_host:$workspace_https_port/workspace/fake/invalid/7681/")
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
docker exec "$container" grep -qx 'DOJO_WORKSPACE=full' /data/config.env
workspace_profile=$(docker exec "$container" readlink /data/workspace/nix/var/nix/profiles/dojo-workspace)
docker exec "$container" readlink "/data/workspace/nix${workspace_profile#/nix}" \
    | grep -Fq 'dojo-workspace-full'
pass "full workspace Nix profile is installed and persistent"

echo "All non-challenge health checks passed"
