# coding: utf-8
import os
import json
import ctypes
import hashlib
import shutil

ROOT = u'C:\\Courses\\software-security\\lab01-auth-analysis'
LEGACY = u'C:\\Lab'
SUPPORT = LEGACY + u'\\Environment'
VERSION = '1.0.0'
PAIRS = [(u'main.cpp',u'main.cpp'),(u'materials\\crackme-original.exe',u'crackme-original.exe'),(u'work\\method1.exe',u'method1.exe'),(u'work\\method2.exe',u'method2.exe')]

def fingerprint(path):
    with open(path,'rb') as stream:
        return hashlib.sha256(stream.read()).hexdigest()

def ensure_layout():
    api = ctypes.windll.kernel32
    api.GetFileAttributesW.argtypes = [ctypes.c_wchar_p]
    api.GetFileAttributesW.restype = ctypes.c_ulong
    api.SetFileAttributesW.argtypes = [ctypes.c_wchar_p,ctypes.c_ulong]
    for directory in (ROOT,ROOT+u'\\work',ROOT+u'\\materials'):
        if not os.path.isdir(directory):
            os.makedirs(directory)
    links,conflicts = [],[]
    for relative,old in PAIRS:
        target,source = os.path.join(ROOT,relative),os.path.join(LEGACY,old)
        assert os.path.isfile(source),source
        if not os.path.exists(target):
            shutil.copy2(source,target)
            assert fingerprint(target) == fingerprint(source)
            links.append(relative)
        elif not os.path.isfile(target) or fingerprint(target) != fingerprint(source):
            conflicts.append(relative)
        assert api.SetFileAttributesW(target,api.GetFileAttributesW(target) & ~2)
    manifest = {'schemaVersion':1,'layoutVersion':VERSION,'courseId':'3839952','course':'software-security','assignment':'lab01-auth-analysis','challengeId':'ollydbg-auth','runtime':'windows2000','root':ROOT,'editable':['work/method1.exe','work/method2.exe'],'materials':['main.cpp','materials/crackme-original.exe'],'checkEntry':'check.cmd','checkFeedbackVersion':'2026.10.13.paths1','formalProtocol':'existing-dynamic-flag','graderVersion':'legacy-auth-unchanged','legacyRoot':LEGACY,'reportRequired':False,'compatibility':'copy-once migration; explicit check synchronizes working files with recoverable backups'}
    with open(ROOT+u'\\lab.json','wb') as stream:
        stream.write(json.dumps(manifest,ensure_ascii=True,indent=2))
    return {'root':ROOT,'migratedFiles':links,'divergedPairs':conflicts,'manifest':manifest}

def synchronize_work():
    import shutil
    import time
    copied = []
    for relative,old in PAIRS:
        if not relative.startswith(u'work\\'):
            continue
        source,target = os.path.join(ROOT,relative),os.path.join(LEGACY,old)
        if not os.path.isfile(source):
            raise RuntimeError('Missing working file: '+relative)
        if fingerprint(source) == fingerprint(target):
            continue
        archive = SUPPORT + u'\\LayoutHistory'
        if not os.path.isdir(archive):
            os.makedirs(archive)
        backup = os.path.join(archive,old+u'.'+fingerprint(target)+u'.'+unicode(int(time.time()*1000)))
        assert not os.path.exists(backup),backup
        shutil.copy2(target,backup)
        assert fingerprint(backup) == fingerprint(target)
        shutil.copyfile(source,target)
        assert fingerprint(source) == fingerprint(target)
        copied.append(relative)
    return copied
