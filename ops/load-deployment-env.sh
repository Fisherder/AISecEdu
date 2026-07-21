# shellcheck shell=bash

deployment_env_file=${DOJO_DEPLOYMENT_ENV:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/deployment.env}

if [[ -f $deployment_env_file ]]; then
    while IFS= read -r deployment_env_line || [[ -n $deployment_env_line ]]; do
        deployment_env_line=${deployment_env_line%$'\r'}
        [[ -z $deployment_env_line || $deployment_env_line == \#* ]] && continue
        if [[ ! $deployment_env_line =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
            echo "Invalid deployment environment line: $deployment_env_line" >&2
            return 1
        fi
        deployment_env_name=${BASH_REMATCH[1]}
        deployment_env_value=${BASH_REMATCH[2]}
        if [[ ! -v $deployment_env_name ]]; then
            printf -v "$deployment_env_name" '%s' "$deployment_env_value"
            export "$deployment_env_name"
        fi
    done < "$deployment_env_file"
fi

unset deployment_env_file deployment_env_line deployment_env_name deployment_env_value
