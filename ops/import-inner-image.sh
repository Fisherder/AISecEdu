#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 IMAGE" >&2
    exit 2
fi

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
container=${DOJO_CONTAINER:-pwncollege-dojo}
image=$1
platform=${DOJO_IMAGE_PLATFORM:-linux/amd64}
crane_version=v0.21.7
crane_archive_sha256=1a57bc98207fa1c0d04bf760699099e26f8383499bfd55b99c1b919a928a7230
crane=${CRANE_BIN:-$repo_dir/cache/tools/crane}
tmp_dir=$(mktemp -d)
remote_path="/tmp/dojo-image-import-$$.tar"

cleanup() {
    rm -rf "$tmp_dir"
    docker exec "$container" rm -f "$remote_path" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [[ ${FORCE_IMAGE_IMPORT:-false} != true ]] && \
    docker exec "$container" docker image inspect "$image" >/dev/null 2>&1; then
    echo "Already present: $image"
    exit 0
fi

if [[ ! -x "$crane" ]]; then
    mkdir -p "$(dirname "$crane")"
    archive="$tmp_dir/go-containerregistry_Linux_x86_64.tar.gz"
    curl -fsSL \
        "https://github.com/google/go-containerregistry/releases/download/$crane_version/go-containerregistry_Linux_x86_64.tar.gz" \
        -o "$archive"
    printf '%s  %s\n' "$crane_archive_sha256" "$archive" | sha256sum -c -
    tar -xzf "$archive" -C "$(dirname "$crane")" crane
fi

tar_path="$tmp_dir/image.tar"
"$crane" pull --platform "$platform" "$image" "$tar_path"
docker cp "$tar_path" "$container:$remote_path"
docker exec "$container" docker load -i "$remote_path"
docker exec "$container" docker image inspect "$image" >/dev/null
echo "Imported: $image ($platform)"
