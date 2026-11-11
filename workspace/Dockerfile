FROM alpine:latest

RUN apk add --no-cache nix flock
RUN apk add --no-cache git
RUN cat >> /etc/nix/nix.conf <<EOF
experimental-features = nix-command flakes
accept-flake-config = true
substituters = https://cache.nixos.org/
EOF

COPY --chmod=755 <<'EOF' /docker-entrypoint.sh
#!/bin/sh -e

NIX_PROFILES_DIR=/nix/var/nix/profiles
NIX_FLAKE_LOCK_FILE=/nix/var/nix/dojo-workspace-flake.lock
mkdir -p "$NIX_PROFILES_DIR"
exec 9>/nix/var/nix/dojo-workspace-build.lock
flock -x 9

TIMESTAMP=$(date +%Y%m%d%H%M%S)
NIX_PROFILE=${NIX_PROFILES_DIR}/dojo-workspace-${TIMESTAMP}
NIX_LOCK_OUTPUT=$(mktemp /nix/var/nix/dojo-workspace-flake.XXXXXX)
trap 'rm -f "$NIX_LOCK_OUTPUT"' EXIT
if [ -s "$NIX_FLAKE_LOCK_FILE" ]; then
    cp "$NIX_FLAKE_LOCK_FILE" "$NIX_LOCK_OUTPUT"
else
    cp flake.lock "$NIX_LOCK_OUTPUT"
fi

nix build ".#${DOJO_WORKSPACE:-default}" \
    --out-link "$NIX_PROFILE" \
    --reference-lock-file "$NIX_LOCK_OUTPUT" \
    --output-lock-file "$NIX_LOCK_OUTPUT" \
    --print-build-logs
mv -f "$NIX_LOCK_OUTPUT" "$NIX_FLAKE_LOCK_FILE"

SUID_FILE="$NIX_PROFILE/suid"
if [ -e "$SUID_FILE" ]; then
    while IFS= read -r path; do
        if [ -e "$path" ]; then
            echo "Setting SUID bit on $path"
            chmod u+s "$path"
        else
            echo "Warning: file not found: $path" >&2
        fi
    done < "$SUID_FILE"
else
    echo "Warning: SUID file not found: $SUID_FILE" >&2
fi

ln -sfn "$NIX_PROFILE" "${NIX_PROFILES_DIR}/dojo-workspace"
echo "Updated profile to $NIX_PROFILE"

echo "Removing old profiles..."
find "$NIX_PROFILES_DIR" -maxdepth 1 -name 'dojo-workspace-*' -type l -mmin +600 -print -exec rm -f {} +
echo "Removed old profiles"

if  [ "$NIX_GARBAGE_COLLECT" = "true" ]; then
    echo "Garbage collecting..."
    nix-collect-garbage -d
    echo "Garbage collected"
fi
EOF

WORKDIR /workspace
COPY . .

ENTRYPOINT ["/docker-entrypoint.sh"]
