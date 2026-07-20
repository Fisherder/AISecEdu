#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
container=${DOJO_CONTAINER:-pwncollege-dojo}

for _ in $(seq 1 60); do
    if docker exec "$container" docker info >/dev/null 2>&1; then
        break
    fi
    sleep 1
done
docker exec "$container" docker info >/dev/null

images=(
    docker/dockerfile:1
    prom/node-exporter:latest
    python:3.12-slim
    postgres:17.5
    redis:8
    gcr.io/cadvisor/cadvisor:latest
    edoburu/pgbouncer:latest
    prom/prometheus:latest
    busybox:uclibc
    grafana/grafana:latest
    oven/bun:1
    python:3.13-slim
    alpine:3.20.3
    python:3.13.4-slim
    nginx:bookworm
    alpine:latest
    pwncollege/challenge-simple:latest
    pwncollege/challenge-lecture:latest
)

for image in "${images[@]}"; do
    DOJO_CONTAINER="$container" "$repo_dir/ops/import-inner-image.sh" "$image"
done

docker exec "$container" docker tag pwncollege/challenge-simple:latest pwncollege/challenge-legacy:latest
docker exec "$container" docker tag pwncollege/challenge-simple:latest pwncollege-smoke:latest

if [[ $(docker exec "$container" systemctl is-active pwn.college.service || true) != active ]]; then
    docker exec "$container" systemctl reset-failed pwn.college.service
    docker exec "$container" systemctl start --no-block pwn.college.service
fi
