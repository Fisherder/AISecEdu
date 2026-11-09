ARG BASE_IMAGE=aisecedu/windows2000-stack-lab:2
FROM ${BASE_IMAGE}
COPY windows-desktop/acceleration.py /usr/local/lib/windows-lab/acceleration.py
COPY windows2000-desktop/patch_acceleration.py /tmp/patch-windows2000-acceleration.py
RUN python3 /tmp/patch-windows2000-acceleration.py /usr/local/lib/windows-lab/start.py \
    && rm /tmp/patch-windows2000-acceleration.py
