ARG BASE_IMAGE=aisecedu/windows-course-runtime:20260911-v2
FROM ${BASE_IMAGE}
LABEL org.aisecedu.runtime="windows-qemu" org.aisecedu.runtime.version="1" org.aisecedu.runtime.bootstrap="/usr/local/bin/windows-runtime-start"
ENV TZ=Asia/Shanghai
COPY --chmod=0444 seed/course-seed.qcow2 /opt/windows/course-seed.qcow2
COPY --chmod=0444 seed/vars.fd /opt/windows/firmware-vars.fd
COPY seed/tpm/ /opt/windows/tpm-base/
COPY runtime.py gateway.py client.py /usr/local/lib/windows-runtime/
COPY install-display.py /usr/local/lib/windows-runtime/install-display.py
RUN python3 /usr/local/lib/windows-runtime/install-display.py \
    && chmod 0755 /usr/local/lib/windows-runtime/runtime.py /usr/local/lib/windows-runtime/client.py \
    && ln -s /usr/local/lib/windows-runtime/runtime.py /usr/local/bin/windows-runtime-start \
    && ln -s /usr/local/lib/windows-runtime/client.py /usr/local/bin/windows-exec \
    && ln -s /usr/local/lib/windows-runtime/client.py /usr/local/bin/windows-request \
    && chmod -R a-w /opt/windows/tpm-base
