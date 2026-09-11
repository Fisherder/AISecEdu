#!/usr/bin/env bash
set -Eeuo pipefail

route_table=10443
rule_priority=10443
connection_mark=0x40000000/0x40000000
chain=AISECEDU_RETURN

default_route=$(ip -4 route show default | head -n 1)
gateway=$(awk '{for (i = 1; i <= NF; i++) if ($i == "via") print $(i + 1)}' <<<"$default_route")
device=$(awk '{for (i = 1; i <= NF; i++) if ($i == "dev") print $(i + 1)}' <<<"$default_route")
if [[ -z $gateway || -z $device ]]; then
    echo "Unable to determine the outer-container default route: $default_route" >&2
    exit 1
fi

existing_rule=$(ip -4 rule show priority "$rule_priority" | xargs)
expected_rule="$rule_priority: from all fwmark $connection_mark lookup $route_table"
if [[ -n $existing_rule && $existing_rule != "$expected_rule" ]]; then
    echo "Routing priority $rule_priority is already in use: $existing_rule" >&2
    exit 1
fi
existing_table=$(ip -4 route show table "$route_table" 2>/dev/null || true)
if [[ -n $existing_table && -z $existing_rule ]]; then
    echo "Routing table $route_table is already in use without the managed rule" >&2
    exit 1
fi

ip -4 route replace table "$route_table" default via "$gateway" dev "$device" onlink
if [[ -z $existing_rule ]]; then
    ip -4 rule add priority "$rule_priority" fwmark "$connection_mark" table "$route_table"
fi

if ! iptables -w 5 -t mangle -S "$chain" >/dev/null 2>&1; then
    iptables -w 5 -t mangle -N "$chain"
fi

ensure_rule() {
    local target_chain=$1
    shift
    if ! iptables -w 5 -t mangle -C "$target_chain" "$@" 2>/dev/null; then
        iptables -w 5 -t mangle -A "$target_chain" "$@"
    fi
}

# VPN addresses can overlap workspace_net. Mark only incoming published-service
# connections, then route their replies through ingress without diverting lab traffic.
ensure_rule "$chain" -i "$device" -p tcp -m multiport --dports 22,80,443,4443 \
    -m addrtype --dst-type LOCAL -m conntrack --ctstate NEW --ctdir ORIGINAL \
    -j CONNMARK --set-xmark "$connection_mark"
ensure_rule "$chain" -m conntrack --ctdir REPLY -m connmark --mark "$connection_mark" \
    -j CONNMARK --restore-mark --nfmask 0x40000000 --ctmask 0x40000000
ensure_rule PREROUTING -j "$chain"
ensure_rule OUTPUT -m conntrack --ctdir REPLY -m connmark --mark "$connection_mark" \
    -j CONNMARK --restore-mark --nfmask 0x40000000 --ctmask 0x40000000

printf 'Configured published-service replies: mark %s, table %s, gateway %s on %s\n' \
    "$connection_mark" "$route_table" "$gateway" "$device"
