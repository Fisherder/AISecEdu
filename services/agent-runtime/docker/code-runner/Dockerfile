ARG BASE_IMAGE=aisecedu/runtime:toolchain-test
FROM ${BASE_IMAGE}

# The host still applies all isolation flags at `docker run` time. Keeping a
# dedicated image gives the teaching platform a stable, auditable runtime name
# while reusing the Python 3.11 + PyCryptodome toolchain already shipped with
# the 玄甲 stack.
USER 65534:65534
WORKDIR /tmp
ENTRYPOINT ["/usr/bin/python3", "-I", "-B", "-"]
