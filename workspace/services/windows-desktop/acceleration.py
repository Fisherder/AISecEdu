import os


def acceleration():
    mode = os.environ.get("DOJO_WINDOWS_ACCELERATOR", "auto").strip().lower()
    if mode not in {"auto", "kvm", "tcg"}:
        raise RuntimeError("DOJO_WINDOWS_ACCELERATOR must be auto, kvm, or tcg")
    available = os.access("/dev/kvm", os.R_OK | os.W_OK)
    if mode == "kvm" and not available:
        raise RuntimeError("KVM was requested but is unavailable on this workspace node")
    return "kvm" if mode == "kvm" or mode == "auto" and available else "tcg"


def identity_groups(mode):
    return ["--groups=" + str(os.stat("/dev/kvm").st_gid)] if mode == "kvm" else ["--clear-groups"]


def guest_options(mode, *, legacy=False):
    if legacy:
        return ["-accel", mode, "-cpu", "pentium3", "-smp", "1"]
    if mode == "kvm":
        return ["-accel", "kvm", "-cpu", "host", "-smp", "4"]
    return ["-accel", "tcg,thread=multi", "-cpu", "max", "-smp", "2"]
