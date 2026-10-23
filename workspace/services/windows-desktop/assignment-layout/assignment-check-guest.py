# coding: utf-8
import os
import sys
import subprocess
import traceback
import glob
import hashlib


def fingerprint(path):
    with open(path,'rb') as stream:
        return hashlib.sha256(stream.read()).hexdigest()


def check_paths(root, legacy):
    original = os.path.join(root,'materials','crackme-original.exe')
    if not os.path.isfile(original):
        raise ValueError('Missing original material: '+original)
    original_hash = fingerprint(original)
    working, alternate = [], []
    for index in (1,2):
        name = 'method%d.exe' % index
        path = os.path.join(root,'work',name)
        if not os.path.isfile(path):
            raise ValueError('Missing required working file: '+path)
        working.append(path)
        if fingerprint(path) != original_hash:
            continue
        for directory in (os.path.join(root,'work'),root,legacy):
            for saved in sorted(glob.glob(os.path.join(directory,'method%d*' % index))):
                if os.path.abspath(saved) in (os.path.abspath(path),os.path.abspath(os.path.join(legacy,name))):
                    continue
                if os.path.isfile(saved) and saved.lower().endswith(('.exe','.bak','.ext')) and fingerprint(saved) != original_hash:
                    alternate.append({'required':path,'savedAs':saved})
    return {'workingFiles':working,'alternateSaves':alternate}


def main():
    root = r'C:\Courses\software-security\lab01-auth-analysis'
    legacy = r'C:\Lab'
    try:
        paths = check_paths(root,legacy)
        print('Actual input files:')
        for path in paths['workingFiles']:
            print('  '+path)
        if paths['alternateSaves']:
            print('CHECK NOT STARTED: required files are unchanged, but modified Save As copies were found.')
            for item in paths['alternateSaves']:
                print('  Saved as: '+item['savedAs'])
                print('  Required: '+item['required'])
            print('Save your own completed files under the required full paths, then run check.cmd again.')
            raw_input('No files were replaced. Press Enter to close.')
            return 1
        scope = {'__name__':'assignment_layout'}
        execfile(r'C:\Lab\Environment\assignment-layout.py',scope)
        scope['synchronize_work']()
        for path in paths['workingFiles']:
            legacy_path = os.path.join(legacy,os.path.basename(path))
            if fingerprint(path) != fingerprint(legacy_path):
                raise ValueError('Working file changed during synchronization; save it and retry: '+path)
        return subprocess.call([r'C:\Lab\submit.exe'],cwd=legacy)
    except Exception:
        traceback.print_exc()
        raw_input('Files were preserved. Close the editor/debugger and retry. Press Enter to close.')
        return 1


if __name__ == '__main__':
    sys.exit(main())
