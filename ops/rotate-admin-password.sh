#!/usr/bin/env bash
set -Eeuo pipefail

container=${DOJO_CONTAINER:-pwncollege-dojo}
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

cleanup() {
    docker exec "$container" rm -f \
        /data/CTFd/uploads/.admin-password \
        /data/CTFd/uploads/.set-admin-password.py >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker exec "$container" sh -c 'umask 077; openssl rand -hex 24 > /data/CTFd/uploads/.admin-password'
docker cp "$repo_dir/ops/set-admin-password.py" "$container:/data/CTFd/uploads/.set-admin-password.py"
docker exec "$container" dojo flask -- /var/uploads/.set-admin-password.py
docker exec "$container" mv /data/CTFd/uploads/.admin-password /data/admin-password.txt
docker exec "$container" chmod 600 /data/admin-password.txt

echo "Administrator username: admin"
echo "Administrator password: /data/admin-password.txt inside $container"
