#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
# shellcheck source=load-deployment-env.sh
source "$repo_dir/ops/load-deployment-env.sh"

validate_ipv4() {
    local name=$1
    local address=$2
    local octet
    local -a octets

    if [[ ! $address =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
        echo "$name must be an IPv4 address: $address" >&2
        exit 1
    fi
    IFS=. read -r -a octets <<<"$address"
    for octet in "${octets[@]}"; do
        if ((10#$octet > 255)); then
            echo "$name must be an IPv4 address: $address" >&2
            exit 1
        fi
    done
}

declare -a route_addresses=()
add_route_address() {
    local route_name=$1
    local route_address=$2

    if [[ -z $route_address || $route_address == 0.0.0.0 || $route_address == 127.* ]]; then
        return 0
    fi
    validate_ipv4 "$route_name" "$route_address"
    if [[ " ${route_addresses[*]-} " != *" $route_address "* ]]; then
        route_addresses+=("$route_address")
    fi
}

add_route_address DOJO_LISTEN_ADDRESS "${DOJO_LISTEN_ADDRESS:-}"
add_route_address DOJO_CLIENT_ADDRESS "${DOJO_CLIENT_ADDRESS:-}"
while read -r nameserver; do
    if [[ $nameserver =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
        add_route_address DNS_NAMESERVER "$nameserver"
    fi
done < <(awk '$1 == "nameserver" {print $2}' /etc/resolv.conf)

if ((${#route_addresses[@]} == 0)); then
    exit 0
fi

default_route=$(ip -4 route show default | head -n 1)
gateway=$(awk '{for (i = 1; i <= NF; i++) if ($i == "via") print $(i + 1)}' <<<"$default_route")
device=$(awk '{for (i = 1; i <= NF; i++) if ($i == "dev") print $(i + 1)}' <<<"$default_route")
if [[ -z $gateway || -z $device ]]; then
    echo "Unable to determine the outer-container default route: $default_route" >&2
    exit 1
fi

# workspace_net intentionally owns 10.0.0.0/8.  aTrust can also allocate 10/8
# addresses to the server, client, and DNS resolver, so preserve those return
# paths through the outer Docker gateway with more-specific routes.
for route_address in "${route_addresses[@]}"; do
    ip -4 route replace "$route_address/32" via "$gateway" dev "$device"

    resolved_route=$(ip -4 route get "$route_address")
    if [[ $resolved_route != *"via $gateway dev $device"* ]]; then
        echo "Return route did not resolve through $gateway on $device: $resolved_route" >&2
        exit 1
    fi

    printf 'Configured return route: %s/32 via %s dev %s\n' \
        "$route_address" "$gateway" "$device"
done
