#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
if ((EUID != 0)); then
    echo "Run as root on Linux; verification uses isolated network namespaces" >&2
    exit 1
fi
for dependency in ip iptables sysctl python3 curl; do
    command -v "$dependency" >/dev/null
done

prefix="aisecedu-route-$$"
router="$prefix-router"
client="$prefix-client"
server="$prefix-server"
workspace="$prefix-workspace"
fixture=$(mktemp -d)
server_pids=()
cleanup() {
    for server_pid in "${server_pids[@]}"; do
        kill "$server_pid" 2>/dev/null || true
        wait "$server_pid" 2>/dev/null || true
    done
    for namespace in "$client" "$server" "$workspace" "$router"; do
        ip netns delete "$namespace" 2>/dev/null || true
    done
    rm -rf -- "$fixture"
}
trap cleanup EXIT

for namespace in "$router" "$client" "$server" "$workspace"; do
    ip netns add "$namespace"
    ip -n "$namespace" link set lo up
done

ip -n "$router" link add eth0 type veth peer name client0
ip -n "$router" link set client0 netns "$client"
ip -n "$router" addr add 192.0.2.2/30 dev eth0
ip -n "$router" link set eth0 up
ip -n "$client" addr add 192.0.2.1/30 dev client0
ip -n "$client" link set client0 up
for address in 10.38.100.134 10.38.101.200 172.20.10.3; do
    ip -n "$client" addr add "$address/32" dev lo
done
ip -n "$router" route add default via 192.0.2.1 dev eth0

ip -n "$router" link add service0 type veth peer name server0
ip -n "$router" link set server0 netns "$server"
ip -n "$router" addr add 172.31.252.1/30 dev service0
ip -n "$router" link set service0 up
ip -n "$server" addr add 172.31.252.2/30 dev server0
ip -n "$server" link set server0 up
ip -n "$server" route add default via 172.31.252.1

ip -n "$router" link add workspace_net type bridge
ip -n "$router" addr add 10.0.0.1/8 dev workspace_net
ip -n "$router" link set workspace_net up
ip -n "$router" link add lab0 type veth peer name workspace0
ip -n "$router" link set workspace0 netns "$workspace"
ip -n "$router" link set lab0 master workspace_net
ip -n "$router" link set lab0 up
ip -n "$workspace" addr add 10.0.0.11/8 dev workspace0
ip -n "$workspace" link set workspace0 up
ip -n "$workspace" route add default via 10.0.0.1

ip netns exec "$router" sysctl -qw net.ipv4.ip_forward=1
ip netns exec "$router" iptables -t nat -A PREROUTING -i eth0 \
    -p tcp -m multiport --dports 22,80,443,4443 \
    -j DNAT --to-destination 172.31.252.2:8088
printf 'return-route-ready\n' > "$fixture/health"
ip netns exec "$server" python3 -m http.server 8088 --bind 172.31.252.2 \
    --directory "$fixture" > "$fixture/server.log" 2>&1 &
server_pids+=("$!")
ip netns exec "$workspace" python3 -m http.server 8088 --bind 10.0.0.11 \
    --directory "$fixture" > "$fixture/workspace.log" 2>&1 &
server_pids+=("$!")

for attempt in {1..30}; do
    if ip netns exec "$server" curl --noproxy '*' -fsS --max-time 1 \
        http://172.31.252.2:8088/health >/dev/null 2>&1; then
        break
    fi
    sleep 0.1
done
[[ $(ip netns exec "$server" curl --noproxy '*' -fsS --max-time 2 \
    http://10.0.0.11:8088/health) == return-route-ready ]]
ip -n "$router" route get 10.38.100.134 | grep -q 'dev workspace_net'
if ip netns exec "$client" curl --noproxy '*' --interface 10.38.100.134 \
    -fsS --connect-timeout 1 --max-time 2 http://192.0.2.2:443/health \
    > "$fixture/before.body" 2> "$fixture/before.error"; then
    echo "Expected the overlapping VPN return route to fail before configuration" >&2
    exit 1
fi
printf 'PASS  reproduced VPN connection failure before the fix\n'

ip netns exec "$router" "$repo_dir/ops/configure-ingress-return-route.sh"
first_rules=$(ip netns exec "$router" iptables -t mangle -S)
ip netns exec "$router" "$repo_dir/ops/configure-ingress-return-route.sh"
[[ $first_rules == "$(ip netns exec "$router" iptables -t mangle -S)" ]]
[[ $(ip -n "$router" -4 rule show priority 10443 | wc -l) -eq 1 ]]
printf 'PASS  configuration is idempotent\n'

for address in 10.38.100.134 10.38.101.200 172.20.10.3; do
    for port in 22 80 443 4443; do
        body=$(ip netns exec "$client" curl --noproxy '*' --interface "$address" \
            -fsS --connect-timeout 2 --max-time 3 "http://192.0.2.2:$port/health")
        [[ $body == return-route-ready ]]
    done
    printf 'PASS  all published TCP services return to client %s\n' "$address"
done

ip -n "$router" route get 10.38.100.134 | grep -q 'dev workspace_net'
ip -n "$router" route get 10.38.100.134 mark 0x40000000 | grep -q 'via 192.0.2.1 dev eth0'
[[ $(ip netns exec "$server" curl --noproxy '*' -fsS --max-time 2 \
    http://10.0.0.11:8088/health) == return-route-ready ]]
[[ $(ip netns exec "$workspace" curl --noproxy '*' -fsS --max-time 2 \
    http://172.31.252.2:8088/health) == return-route-ready ]]
printf 'PASS  existing workspace routing and bidirectional application traffic are preserved\n'

ip netns exec "$router" python3 -m http.server 443 --bind 192.0.2.2 \
    --directory "$fixture" > "$fixture/local-server.log" 2>&1 &
server_pids+=("$!")
ip netns exec "$router" iptables -t nat -D PREROUTING -i eth0 \
    -p tcp -m multiport --dports 22,80,443,4443 \
    -j DNAT --to-destination 172.31.252.2:8088
for attempt in {1..30}; do
    if ip netns exec "$router" curl --noproxy '*' -fsS --max-time 1 \
        http://192.0.2.2:443/health >/dev/null 2>&1; then
        break
    fi
    sleep 0.1
done
[[ $(ip netns exec "$client" curl --noproxy '*' --interface 10.38.101.200 \
    -fsS --connect-timeout 2 --max-time 3 http://192.0.2.2:443/health) == return-route-ready ]]
printf 'PASS  locally terminated published-service replies use the same return path\n'
