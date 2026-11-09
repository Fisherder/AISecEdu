import ast
import pathlib
import sys


def patch(source):
    replacements = [
        ("import time\n", "import time\n\nfrom acceleration import acceleration, guest_options, identity_groups\n"),
        ('    identity = ["/usr/bin/setpriv", "--reuid=60000", "--regid=60000", "--groups=" + str(os.stat("/dev/kvm").st_gid), "--no-new-privs"]',
         '    mode = acceleration()\n    identity = ["/usr/bin/setpriv", "--reuid=60000", "--regid=60000", *identity_groups(mode), "--no-new-privs"]'),
        ('"AISecEdu-Windows2000-Course", "-enable-kvm",',
         '"AISecEdu-Windows2000-Course", *guest_options(mode, legacy=True),'),
        ('"-machine", "pc", "-cpu", "pentium3", "-m", "256", "-smp", "1",',
         '"-machine", "pc", "-m", "256",'),
        ('    if not os.access("/dev/kvm", os.R_OK | os.W_OK):\n        raise SystemExit("KVM must be available to this workspace.")',
         '    acceleration()'),
    ]
    for before, after in replacements:
        if source.count(before) != 1:
            raise RuntimeError("Unexpected Windows 2000 runtime; refusing a partial acceleration patch")
        source = source.replace(before, after, 1)
    ast.parse(source)
    return source


if __name__ == "__main__":
    path = pathlib.Path(sys.argv[1])
    path.write_text(patch(path.read_text()))
