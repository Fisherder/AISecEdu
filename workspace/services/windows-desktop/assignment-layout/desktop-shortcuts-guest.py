# coding: utf-8
import os
import sys
import json
import shutil
import ctypes
import subprocess
import struct
import _winreg


def configure_desktop(mode, task):
    assert mode in ('ollydbg', 'stack-lab2')
    assert os.path.isdir(task), task
    folders = []
    for hive, value, area in [(_winreg.HKEY_CURRENT_USER, 'Desktop', u'Personal'), (_winreg.HKEY_LOCAL_MACHINE, 'Common Desktop', u'Common')]:
        key = _winreg.OpenKey(hive, r'Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders')
        folders.append((_winreg.QueryValueEx(key, value)[0], area))
        _winreg.CloseKey(key)
    desktop = folders[0][0]
    entries = [
        (u'lab1 题目目录' if mode == 'ollydbg' else u'lab2 题目目录', task, u''),
        (u'OllyDbg', u'C:\\OllyDBG_1.10_cao_cong\\Ollydbg.exe', u''),
        (u'Notepad++', u'C:\\Tools\\Notepad++\\notepad++.exe', u'"' + task + u'\\main.cpp"'),
    ]
    for label, target, arguments in entries:
        assert os.path.exists(target), target
    obsolete = set([u'01 题目目录.lnk', u'02 OllyDbg.lnk', u'03 检查结果.lnk', u'04 代码编辑.lnk', u'04 代码编辑器.lnk', u'检查结果.lnk'])
    removed = []
    for directory, area in folders:
        for name in os.listdir(directory):
            if name not in obsolete and not (area == u'Common' and name == u'Notepad++.lnk'):
                continue
            path = os.path.join(directory, name)
            if not os.path.isfile(path):
                continue
            archive = u'C:\\Lab\\Environment\\DesktopArchive\\ShortcutLabels\\' + area
            if not os.path.isdir(archive):
                os.makedirs(archive)
            target = os.path.join(archive, name)
            index = 0
            while os.path.exists(target):
                index += 1
                target = os.path.join(archive, name + u'.' + unicode(index))
            shutil.move(path, target)
            removed.append(path)
    def quoted(value):
        return u'"' + value.replace(u'"', u'""') + u'"'
    lines = [u'Set s = CreateObject("WScript.Shell")']
    for label, target, arguments in entries:
        assert os.path.exists(target), target
        lines.extend([u'Set l = s.CreateShortcut(' + quoted(os.path.join(desktop, label + u'.lnk')) + u')', u'l.TargetPath = ' + quoted(target), u'l.WorkingDirectory = ' + quoted(task), u'l.Arguments = ' + quoted(arguments), u'l.Save', u'WScript.Echo l.TargetPath & vbTab & l.WorkingDirectory & vbTab & l.Arguments'])
    script = u'C:\\Lab\\Environment\\desktop-shortcuts.vbs'
    with open(script, 'wb') as stream:
        stream.write((u'\r\n'.join(lines) + u'\r\n').encode('utf-16'))
    output = subprocess.check_output([r'C:\WINNT\system32\cscript.exe', '//NoLogo', script], creationflags=0x08000000).decode('mbcs')
    actual = [line.split(u'\t') for line in output.splitlines()]
    assert len(actual) == len(entries), actual
    for (label, target, arguments), row in zip(entries, actual):
        assert len(row) == 3 and os.path.normcase(row[0]) == os.path.normcase(target) and os.path.normcase(row[1]) == os.path.normcase(task) and row[2] == arguments, (label, row)
    for label, target, arguments in entries:
        assert os.path.isfile(os.path.join(desktop, label + u'.lnk')), label
    readme = os.path.join(task, u'README.txt')
    if mode == 'ollydbg' and os.path.isfile(readme):
        with open(readme, 'rb') as stream:
            original = stream.read()
        if original.startswith('\xff\xfe'):
            text = original.decode('utf-16')
            revised = text.replace(u'完成后双击 check.cmd，或桌面的“03 检查结果”。', u'完成后在题目目录中双击 check.cmd。')
            if revised != text:
                backup = u'C:\\Lab\\Environment\\README-before-shortcut-labels.txt'
                if not os.path.exists(backup):
                    shutil.copy2(readme, backup)
                with open(readme, 'wb') as stream:
                    stream.write(revised.encode('utf-16'))
    ctypes.windll.shell32.SHChangeNotify(0x08000000, 0, None, None)
    return {'mode': mode, 'root': task, 'desktop': desktop, 'labels': [entry[0] for entry in entries], 'removed': removed, 'desktopFiles': dict((directory, sorted(os.listdir(directory))) for directory, area in folders)}


if __name__ == '__main__':
    mode = sys.argv[1]
    task = u'C:\\Lab\\StackLab2' if mode == 'stack-lab2' else u'C:\\Courses\\software-security\\lab01-auth-analysis'
    if mode == 'ollydbg' and not os.path.isdir(task):
        task = u'C:\\Lab'
    report = configure_desktop(mode, task)
    raw = json.dumps(report, ensure_ascii=True)
    block = struct.pack('<8sI', 'AISELINK', len(raw)) + raw
    block += '\0' * ((-len(block)) % 512)
    with open(r'\\.\PhysicalDrive1', 'r+b', 0) as disk:
        disk.seek(131072)
        disk.write(block)
        disk.flush()
