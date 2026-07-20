#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
vendor_dir="$repo_dir/cache/build-vendor"
export_dir="$vendor_dir/export"
dockerfile="$repo_dir/cache/Dockerfile.local"
kata_commit=acae4480ac84701d7354e679714cc9d084b37f44
ctfd_commit=af5e88de115f332427894284e681ac10bb81670e
profiles_commit=f9bc03ec19b2dc4c091449b08e88f85c0caa9f0b
seccomp_sha256=536529b665dd0972c37bfb569f5d4ac8a53592e7b00752bc39ff063ca9864c74
image=${DOJO_IMAGE:-pwncollege/dojo:local-$(git -C "$repo_dir" rev-parse --short=8 HEAD)}

ensure_repo() {
    local url=$1
    local commit=$2
    local path=$3

    if [[ ! -d "$path/.git" ]]; then
        git clone --filter=blob:none --no-checkout "$url" "$path"
    fi
    if ! git -C "$path" cat-file -e "$commit^{commit}" 2>/dev/null; then
        git -C "$path" fetch --depth=1 origin "$commit"
    fi
    git -C "$path" checkout --detach "$commit"
    [[ $(git -C "$path" rev-parse HEAD) == "$commit" ]]
}

mkdir -p "$vendor_dir"
ensure_repo https://github.com/kata-containers/kata-containers.git "$kata_commit" "$vendor_dir/kata-containers"
ensure_repo https://github.com/CTFd/CTFd.git "$ctfd_commit" "$vendor_dir/CTFd"

curl -fsSL \
    "https://raw.githubusercontent.com/moby/profiles/$profiles_commit/seccomp/default.json" \
    -o "$vendor_dir/default.json"
printf '%s  %s\n' "$seccomp_sha256" "$vendor_dir/default.json" | sha256sum -c -

rm -rf "$export_dir"
mkdir -p "$export_dir/kata-containers" "$export_dir/CTFd"
git -C "$vendor_dir/kata-containers" archive HEAD | tar -x -C "$export_dir/kata-containers"
git -C "$vendor_dir/CTFd" archive HEAD | tar -x -C "$export_dir/CTFd"
cp "$vendor_dir/default.json" "$export_dir/default.json"

sed \
    -e '1{/^# syntax=docker\/dockerfile:1$/d;}' \
    -e 's|^ADD https://github.com/kata-containers/kata-containers.git#${KATA_VERSION} /src/kata-containers$|COPY --from=vendor kata-containers /src/kata-containers|' \
    -e 's|^ADD https://raw.githubusercontent.com/moby/profiles/master/seccomp/default.json /etc/docker/seccomp.json$|COPY --from=vendor default.json /etc/docker/seccomp.json|' \
    -e 's|^ADD https://github.com/CTFd/CTFd.git#3.6.0 /opt/CTFd$|COPY --from=vendor CTFd /opt/CTFd|' \
    "$repo_dir/Dockerfile" > "$dockerfile"

if grep -q '^ADD https://' "$dockerfile"; then
    echo "The generated Dockerfile still contains a remote ADD" >&2
    exit 1
fi

build_args=()
for name in HTTP_PROXY HTTPS_PROXY NO_PROXY; do
    if [[ -n ${!name:-} ]]; then
        build_args+=(--build-arg "$name=${!name}")
    fi
done

docker build \
    --progress=plain \
    --network host \
    --build-context "vendor=$export_dir" \
    "${build_args[@]}" \
    -f "$dockerfile" \
    -t "$image" \
    -t pwncollege/dojo:latest \
    "$repo_dir"

printf '%s\n' "$image" > "$repo_dir/cache/local-image"
echo "Built $image"
