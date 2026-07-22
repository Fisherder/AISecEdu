#!/usr/bin/env bash
set -Eeuo pipefail

container=${DOJO_CONTAINER:-pwncollege-dojo}
username=${AISECEDU_TEACHER_USERNAME:-teacher}
email=${AISECEDU_TEACHER_EMAIL:-teacher@aisecedu.local}
course=${AISECEDU_TEACHER_COURSE:-manual-platform-check}
: "${AISECEDU_TEACHER_PASSWORD:?Set AISECEDU_TEACHER_PASSWORD before provisioning}"

docker exec "$container" docker exec \
    --env "AISECEDU_TEACHER_USERNAME=$username" \
    --env "AISECEDU_TEACHER_EMAIL=$email" \
    --env "AISECEDU_TEACHER_PASSWORD=$AISECEDU_TEACHER_PASSWORD" \
    --env "AISECEDU_TEACHER_COURSE=$course" \
    ctfd flask shell -- \
    /opt/CTFd/CTFd/plugins/dojo_plugin/scripts/provision_teacher.py
