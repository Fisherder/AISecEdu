# coding: utf-8
import ctypes
import hashlib
import json
import os
import shutil
import struct
import subprocess
import sys
import time
import zipfile
import _winreg

REVISION = 'hxd-1.7.7.0-20261103-v1'
ARCHIVE_SHA256 = 'e64e7c6481d596bc62b8ec731bfadf21fe6609b953e104449cd5bb09be6744ba'
TARGET = u'C:\\Tools\\HxD'
TASK = u'C:\\Courses\\software-security\\lab03-shellcode'
ENVIRONMENT = u'C:\\Lab\\Environment'
FILES = ('changelog.txt', 'HxD.exe', 'license.txt', 'readme.txt')


def file_hash(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest() if os.path.isfile(path) else None


def install():
    archive = None
    for attempt in range(15):
        for letter in 'DEFGHIJKLMNOPQRSTUVWXYZ':
            drive = unicode(letter + ':\\')
            if ctypes.windll.kernel32.GetDriveTypeW(drive) == 5 and os.path.isfile(drive + 'HxDchs.zip'):
                archive = drive + 'HxDchs.zip'
                break
        if archive is not None:
            break
        time.sleep(1)
    if archive is None:
        raise RuntimeError('HxD installation media is unavailable')
    if file_hash(archive) != ARCHIVE_SHA256:
        raise RuntimeError('HxD archive digest mismatch')
    payload = os.path.join(TASK, 'work', 'payload.txt')
    before = file_hash(payload)
    if not os.path.isdir(TARGET):
        os.makedirs(TARGET)
    backups = []
    package = zipfile.ZipFile(archive)
    try:
        if sorted(package.namelist()) != sorted(FILES):
            raise RuntimeError('Unexpected files in HxD archive')
        for name in FILES:
            content = package.read(name)
            destination = os.path.join(TARGET, name)
            digest = hashlib.sha256(content).hexdigest()
            if file_hash(destination) == digest:
                continue
            if os.path.exists(destination):
                backup = os.path.join(ENVIRONMENT, 'EditorBackups', REVISION, str(int(time.time())))
                if not os.path.isdir(backup):
                    os.makedirs(backup)
                shutil.copy2(destination, os.path.join(backup, name))
                backups.append(os.path.join(backup, name))
            with open(destination + '.installing', 'wb') as output:
                output.write(content)
            if os.path.exists(destination):
                os.remove(destination)
            os.rename(destination + '.installing', destination)
            if file_hash(destination) != digest:
                raise RuntimeError('Installed file digest mismatch: ' + name)
    finally:
        package.close()
    configuration = os.path.join(TARGET, 'HxD.ini')
    if not os.path.exists(configuration):
        with open(configuration, 'wb') as output:
            output.write('[\\]\r\nMakeBackupFiles=1\r\nDiskReadOnlyByDefault=1\r\n')
    if not os.path.isdir(TASK):
        raise RuntimeError('The lab03 workspace is unavailable')
    launcher = ('@echo off\r\nsetlocal\r\n'
                'cd /d "C:\\Courses\\software-security\\lab03-shellcode"\r\n'
                'if exist "work\\payload.txt" (\r\n'
                '  start "" "C:\\Tools\\HxD\\HxD.exe" "C:\\Courses\\software-security\\lab03-shellcode\\work\\payload.txt"\r\n'
                ') else (\r\n  start "" "C:\\Tools\\HxD\\HxD.exe"\r\n)\r\n')
    with open(os.path.join(TASK, 'edit-payload.cmd'), 'wb') as output:
        output.write(launcher)
    guide = u'''实验三：二进制编辑工具\r\n\r\n原 UltraEdit 为已到期试用版，其到期窗口还会触发旧 IE 脚本错误。\r\n本实验改用免费 HxD 1.7.7.0，支持 Windows 2000，不需要注册或续试用。\r\n\r\n双击本目录 edit-payload.cmd，或桌面的“HxD 十六进制编辑”。\r\n已有 work\\payload.txt 会直接打开；若文件尚不存在，用 HxD 新建并另存到本实验 work\\payload.txt。\r\n在左侧十六进制区输入字节，在右侧字符区输入的是字符。\r\nInsert 键切换插入/覆盖；Ctrl+S 保存。注意状态栏的编辑模式。\r\n完成后使用原 check.cmd 检查，检测规则与提交方式保持不变。\r\n不要修改 materials 中的原始程序。已有学生文件不会被本次工具安装覆盖。\r\n\r\nHxD 原始软件及许可证位于 C:\\Tools\\HxD。\r\n来源：https://mh-nexus.de/en/hxd/\r\n'''
    with open(os.path.join(TASK, u'十六进制编辑说明.txt'), 'wb') as output:
        output.write(guide.encode('utf-16'))
    key = _winreg.OpenKey(_winreg.HKEY_CURRENT_USER, r'Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders')
    desktop = _winreg.QueryValueEx(key, 'Desktop')[0]
    _winreg.CloseKey(key)
    if not os.path.isdir(desktop):
        raise RuntimeError('The user desktop is unavailable')
    shortcut = os.path.join(desktop, u'HxD 十六进制编辑.lnk')
    def quoted(value):
        return u'"' + value.replace(u'"', u'""') + u'"'
    script = (u'Set s=CreateObject("WScript.Shell")\r\n'
              u'Set l=s.CreateShortcut(' + quoted(shortcut) + u')\r\n'
              u'l.TargetPath="C:\\Tools\\HxD\\HxD.exe"\r\n'
              u'l.WorkingDirectory=' + quoted(TASK) + u'\r\n'
              u'l.IconLocation="C:\\Tools\\HxD\\HxD.exe,0"\r\n' +
              (u'l.Arguments=' + quoted(u'"' + payload + u'"') + u'\r\n' if os.path.isfile(payload) else u'') +
              u'l.Save\r\n')
    script_path = os.path.join(ENVIRONMENT, 'hxd-shortcut.vbs')
    with open(script_path, 'wb') as output:
        output.write(script.encode('utf-16'))
    subprocess.check_call([r'C:\WINNT\system32\cscript.exe', '//NoLogo', script_path], creationflags=0x08000000)
    for name, value in [(r'Software\Classes\*\shell\HxD', u'用 HxD 十六进制编辑'),
                        (r'Software\Classes\*\shell\HxD\command', u'"C:\\Tools\\HxD\\HxD.exe" "%1"')]:
        key = _winreg.CreateKey(_winreg.HKEY_CURRENT_USER, name)
        _winreg.SetValueEx(key, None, 0, _winreg.REG_SZ, value)
        _winreg.CloseKey(key)
    ctypes.windll.shell32.SHChangeNotify(0x08000000, 0, None, None)
    after = file_hash(payload)
    if before != after:
        raise RuntimeError('Student payload changed during installation')
    report = {'revision': REVISION, 'archiveSha256': ARCHIVE_SHA256,
              'files': dict((name, file_hash(os.path.join(TARGET, name))) for name in FILES),
              'shortcut': shortcut, 'payloadBefore': before, 'payloadAfter': after,
              'payloadPreserved': before == after, 'backups': backups}
    with open(os.path.join(ENVIRONMENT, 'hxd-install.json'), 'wb') as output:
        output.write(json.dumps(report, ensure_ascii=True))
    return report


if __name__ == '__main__':
    import traceback
    try:
        report = install()
        status = 0
    except Exception:
        report = {'revision': REVISION, 'error': traceback.format_exc()}
        status = 1
    raw = json.dumps(report, ensure_ascii=True)
    block = struct.pack('<8sI', 'AISEHXDI', len(raw)) + raw
    block += '\0' * ((-len(block)) % 512)
    with open(r'\\.\PhysicalDrive1', 'r+b', 0) as disk:
        disk.seek(131072)
        disk.write(block)
        disk.flush()
    sys.exit(status)
