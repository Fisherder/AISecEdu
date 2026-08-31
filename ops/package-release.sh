#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"

if [[ -n $(git status --porcelain --untracked-files=normal) ]]; then
    echo "Refusing to package a dirty working tree; commit or stash source changes first." >&2
    exit 1
fi

"$repo_dir/ops/repository-audit.sh"

commit=$(git rev-parse HEAD)
short_commit=$(git rev-parse --short=12 HEAD)
version=$(git describe --tags --exact-match HEAD 2>/dev/null || printf '%s' "$short_commit")
version=${version//\//-}
bundle_name="xuanjia-$version"
release_dir=${1:-$repo_dir/output/releases}
archive="$release_dir/$bundle_name.tar.gz"

mkdir -p "$release_dir"
git archive --format=tar --prefix="$bundle_name/" "$commit" | gzip -n > "$archive"
(
    cd "$release_dir"
    sha256sum "$bundle_name.tar.gz" > "$bundle_name.tar.gz.sha256"
)

printf '%s\n' "$commit" > "$release_dir/$bundle_name.commit"
printf 'Created %s\n' "$archive"
printf 'Checksum: %s\n' "$archive.sha256"
