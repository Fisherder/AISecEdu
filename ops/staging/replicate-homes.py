#!/usr/bin/env python3
import json
import os
from pathlib import Path
import sqlite3
import subprocess

SOURCE = Path('/srv/aisecedu-dojo/data/homes')
DEST = Path('/srv/aisecedu-development-volume/aisecedu-dojo/data/homes')
CONTROL = Path('/srv/aisecedu-development-control')


def read(args):
    return subprocess.check_output(args, text=True).strip()


def run(args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)


def main():
    if os.geteuid() != 0 or not (CONTROL / 'state.json').exists():
        raise RuntimeError('Isolated source snapshot must exist first')
    if read(['findmnt', '-n', '-o', 'SOURCE', '-T', str(DEST)]) != 'rpool/aisecedu-development':
        raise RuntimeError('Destination is not the development dataset')
    raw = DEST / 'btrfs.img'
    if raw.exists():
        if read(['losetup', '-j', str(raw)]):
            raise RuntimeError('Development home image is already attached; inspect before repeating')
        subprocess.run(['btrfstune', '-u', str(raw)], input='y\n', text=True, check=True, stdout=subprocess.DEVNULL)
        loop = read(['losetup', '--find', '--show', str(raw)])
        run(['mount', loop, str(DEST)])
        run(['mount', '--make-shared', str(DEST)])
        subvolumes = read(['btrfs', 'subvolume', 'list', str(DEST)]).splitlines()
        state = json.loads((CONTROL / 'state.json').read_text())
        state.update(stage='full-home-snapshot-ready', homeSubvolumes=len(subvolumes), homeLoop=loop)
        (CONTROL / 'state.json').write_text(json.dumps(state, indent=2))
        print(json.dumps({'stage': state['stage'], 'homeSubvolumes': len(subvolumes), 'loop': loop}), flush=True)
        return
    DEST.mkdir(parents=True, exist_ok=True)
    with open(raw, 'wb') as image:
        image.truncate(256 * 1024**3)
    run(['mkfs.btrfs', '-q', str(raw)])
    loop = read(['losetup', '--find', '--show', str(raw)])
    run(['mount', loop, str(DEST)])
    run(['mount', '--make-shared', str(DEST)])
    subs = [line.split(' path ', 1)[1] for line in read(['btrfs', 'subvolume', 'list', str(SOURCE)]).splitlines()]
    readonly = [line.split(' path ', 1)[1] for line in read(['btrfs', 'subvolume', 'list', '-r', str(SOURCE)]).splitlines()]
    for name in sorted(subs, key=lambda value: (value.count('/'), value)):
        path = DEST / name
        if not path.is_relative_to(DEST) or name.startswith('/') or '..' in Path(name).parts:
            raise RuntimeError('Invalid production home subvolume path')
        path.parent.mkdir(parents=True, exist_ok=True)
        run(['btrfs', 'subvolume', 'create', str(path)])
    print(json.dumps({'stage': 'home-subvolumes-created', 'count': len(subs)}), flush=True)
    copied = subprocess.run(['rsync', '-aHAX', '--numeric-ids', '--exclude=/homefs.db*', str(SOURCE) + '/', str(DEST) + '/'], capture_output=True, text=True)
    if copied.returncode not in (0, 24):
        raise RuntimeError('Home replication failed: ' + copied.stderr[-1200:])
    source_db = sqlite3.connect(f'file:{SOURCE}/homefs.db?mode=ro', uri=True)
    destination_db = sqlite3.connect(DEST / 'homefs.db')
    source_db.backup(destination_db)
    destination_db.close()
    source_db.close()
    for name in sorted(readonly, key=lambda value: -value.count('/')):
        run(['btrfs', 'property', 'set', '-ts', str(DEST / name), 'ro', 'true'])
    run(['btrfs', 'quota', 'enable', str(DEST)])
    state = json.loads((CONTROL / 'state.json').read_text())
    state.update(stage='full-logical-home-copy-ready', homeSubvolumes=len(subs), homeReadonlySubvolumes=len(readonly), homeLoop=loop)
    (CONTROL / 'state.json').write_text(json.dumps(state, indent=2))
    print(json.dumps({'stage': state['stage'], 'homeSubvolumes': len(subs), 'readonly': len(readonly)}), flush=True)


if __name__ == '__main__':
    main()
