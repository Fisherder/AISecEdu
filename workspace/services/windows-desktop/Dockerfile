ARG BASE_IMAGE=aisecedu/windows-course-runtime:20260911-v2
FROM debian:bookworm-slim AS checker-builder
RUN apt-get update && apt-get install -y --no-install-recommends gcc-mingw-w64-x86-64-win32 \
    && rm -rf /var/lib/apt/lists/*
COPY guest-check.c /tmp/guest-check.c
RUN x86_64-w64-mingw32-gcc -Os -s -Wall -Wextra -Werror /tmp/guest-check.c -o /tmp/guest-check.exe -lshell32

FROM ${BASE_IMAGE}
LABEL org.aisecedu.runtime="windows-qemu" org.aisecedu.runtime.version="1" org.aisecedu.runtime.bootstrap="/usr/local/bin/windows-runtime-start"
ENV TZ=Asia/Shanghai
COPY --chmod=0444 seed/course-seed.qcow2 /opt/windows/course-seed.qcow2
COPY --chmod=0444 seed/vars.fd /opt/windows/firmware-vars.fd
COPY seed/tpm/ /opt/windows/tpm-base/
COPY runtime.py gateway.py client.py /usr/local/lib/windows-runtime/
COPY --from=checker-builder /tmp/guest-check.exe /usr/local/lib/windows-runtime/guest-check.exe
COPY guest-check.cmd /usr/local/lib/windows-runtime/
COPY install-display.py /usr/local/lib/windows-runtime/install-display.py
RUN python3 /usr/local/lib/windows-runtime/install-display.py \
    && chmod 0755 /usr/local/lib/windows-runtime/runtime.py /usr/local/lib/windows-runtime/client.py \
    && ln -s /usr/local/lib/windows-runtime/runtime.py /usr/local/bin/windows-runtime-start \
    && ln -s /usr/local/lib/windows-runtime/client.py /usr/local/bin/windows-exec \
    && ln -s /usr/local/lib/windows-runtime/client.py /usr/local/bin/windows-request \
    && chmod -R a-w /opt/windows/tpm-base
