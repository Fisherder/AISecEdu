#!/usr/bin/env bash
set -Eeuo pipefail

container=${DOJO_CONTAINER:-pwncollege-dojo}
mode=${1:-enable}

case "$mode" in
    enable)
        value=true
        ;;
    disable)
        value=false
        ;;
    *)
        echo "Usage: $0 [enable|disable]" >&2
        exit 2
        ;;
esac

docker exec "$container" sed -i "s/^DOJO_OFFLINE=.*/DOJO_OFFLINE=$value/" /data/config.env
docker exec "$container" grep -qx "DOJO_OFFLINE=$value" /data/config.env
echo "DOJO_OFFLINE=$value"
