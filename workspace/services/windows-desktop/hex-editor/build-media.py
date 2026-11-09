import argparse
import hashlib
import json
import pathlib
import subprocess
import tempfile


parser = argparse.ArgumentParser()
parser.add_argument('editor_iso', type=pathlib.Path)
parser.add_argument('--root', type=pathlib.Path, default=pathlib.Path(__file__).resolve().parent)
args = parser.parse_args()
manifest_path = args.root / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
if hashlib.sha256((args.root / 'HxDchs.zip').read_bytes()).hexdigest() != manifest['archiveSha256']:
    raise ValueError('HxD archive digest mismatch')
names = subprocess.check_output(['isoinfo', '-J', '-f', '-i', str(args.editor_iso)], text=True).splitlines()
if sorted(names) != ['/editor-manifest.json', '/editor.zip']:
    raise ValueError('Unexpected original editor media; inspect before combining')
with tempfile.TemporaryDirectory(prefix='hxd-media-') as temporary:
    source = pathlib.Path(temporary)
    for name in names:
        data = subprocess.check_output(['isoinfo', '-J', '-i', str(args.editor_iso), '-x', name])
        (source / name.lstrip('/')).write_bytes(data)
    (source / 'HxDchs.zip').write_bytes((args.root / 'HxDchs.zip').read_bytes())
    subprocess.run(['genisoimage', '-quiet', '-J', '-r', '-V', 'AISECEDITORS', '-o', str(args.root / 'tools.iso'), str(source)], check=True)
manifest['baseEditorMediaSha256'] = hashlib.sha256(args.editor_iso.read_bytes()).hexdigest()
manifest['mediaSha256'] = hashlib.sha256((args.root / 'tools.iso').read_bytes()).hexdigest()
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'mediaSha256': manifest['mediaSha256'], 'baseEditorMediaSha256': manifest['baseEditorMediaSha256']}))
