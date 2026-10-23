# coding: utf-8
import os
import sys
import json
import shutil
import hashlib
import ctypes
import subprocess
import struct
import _winreg

VERSION = '20261012-shortcuts-r10'
MODE = sys.argv[1]
assert MODE in ('ollydbg','stack-lab2')
LAB = u'C:\\Lab'
SUPPORT = LAB + u'\\Environment'
TASK = LAB + (u'\\StackLab2' if MODE == 'stack-lab2' else u'')
RECEIPT = SUPPORT + u'\\tidy-layout-' + VERSION + u'.json'
kernel = ctypes.windll.kernel32
kernel.GetFileAttributesW.argtypes = [ctypes.c_wchar_p]
kernel.GetFileAttributesW.restype = ctypes.c_ulong
kernel.SetFileAttributesW.argtypes = [ctypes.c_wchar_p,ctypes.c_ulong]
report = {'version':VERSION,'mode':MODE,'moved':[],'attributes':{},'registry':[],'created':[]}

def digest(path):
    return hashlib.sha256(open(path,'rb').read()).hexdigest()

def emit(data):
    raw = json.dumps(data,ensure_ascii=True)
    assert len(raw) < 131000
    block = struct.pack('<8sI','AISETIDY',len(raw)) + raw
    block += '\0' * ((-len(block)) % 512)
    disk = open(r'\\.\PhysicalDrive1','r+b',0)
    disk.seek(131072)
    disk.write(block)
    disk.flush()
    disk.close()

def attributes(path,hidden):
    if not os.path.exists(path):
        return
    old = kernel.GetFileAttributesW(path)
    assert old != 0xffffffff,path
    report['attributes'][path] = old
    new = old | 2 if hidden else old & ~2
    assert kernel.SetFileAttributesW(path,new),path

def registry(hive,path,name,value,kind=_winreg.REG_DWORD):
    key = _winreg.CreateKey(hive,path)
    try:
        old,old_kind = _winreg.QueryValueEx(key,name)
    except WindowsError:
        old,old_kind = None,None
    if old_kind == _winreg.REG_BINARY:
        old = old.encode('hex')
    report['registry'].append({'hive':'HKCU' if hive == _winreg.HKEY_CURRENT_USER else 'HKLM','path':path,'name':name,'old':old,'kind':old_kind})
    _winreg.SetValueEx(key,name,0,kind,value)
    _winreg.CloseKey(key)

def shell_folder(hive,name):
    key = _winreg.OpenKey(hive,r'Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders')
    value = _winreg.QueryValueEx(key,name)[0]
    _winreg.CloseKey(key)
    return value

def archive(path,area):
    if not os.path.isfile(path):
        return
    directory = SUPPORT + u'\\DesktopArchive\\' + area
    if not os.path.isdir(directory):
        os.makedirs(directory)
    target = directory + u'\\' + os.path.basename(path)
    fingerprint = digest(path)
    if os.path.exists(target):
        target += u'.' + fingerprint[:12]
    counter = 0
    base = target
    while os.path.exists(target):
        counter += 1
        target = base + u'.' + unicode(counter)
    shutil.move(path,target)
    assert digest(target) == fingerprint
    report['moved'].append({'from':path,'to':target,'sha256':fingerprint})

def file_text(path,text):
    if os.path.exists(path):
        assert open(path,'rb').read() == text.encode('utf-16'),path
        return
    open(path,'wb').write(text.encode('utf-16'))
    report['created'].append(path)

def shortcut_lines(path,target,working,description,icon=None):
    def quoted(value):
        return u'"' + value.replace(u'"',u'""') + u'"'
    lines = [u'Set l = s.CreateShortcut(' + quoted(path) + u')',u'l.TargetPath = ' + quoted(target),u'l.WorkingDirectory = ' + quoted(working),u'l.Description = ' + quoted(description)]
    if target.lower().endswith(u'notepad++.exe'):
        lines.append(u'l.Arguments = ' + quoted(u'\"' + working + u'\\main.cpp\"'))
    if icon:
        lines.append(u'l.IconLocation = ' + quoted(icon))
    lines.append(u'l.Save')
    report['created'].append(path)
    return lines

def visible_names(path):
    return sorted(name for name in os.listdir(path) if not kernel.GetFileAttributesW(os.path.join(path,name)) & 2)

assert os.path.isdir(TASK)
if not os.path.isdir(SUPPORT):
    os.makedirs(SUPPORT)
protected = []
for base in (LAB,LAB+u'\\StackLab2'):
    if os.path.isdir(base):
        for name in os.listdir(base):
            path = os.path.join(base,name)
            if os.path.isfile(path) and not name.endswith(u'.lnk') and name != u'00 题目说明.txt':
                protected.append(path)
before = dict((path,digest(path)) for path in protected)
snapshot = SUPPORT + u'\\tidy-before-' + VERSION + u'.json'
if not os.path.isfile(snapshot):
    initial = {'mode':MODE,'hashes':before,'attributes':dict((path,kernel.GetFileAttributesW(path)) for path in protected)}
    open(snapshot,'wb').write(json.dumps(initial,ensure_ascii=True,indent=2))
desktops = [(shell_folder(_winreg.HKEY_CURRENT_USER,'Desktop'),u'Personal'),(shell_folder(_winreg.HKEY_LOCAL_MACHINE,'Common Desktop'),u'Common')]
obsolete = set([u'Depends.exe',u'depends.dll',u'fuzz',u'python-2.7.1.msi',u'rubyinstaller-1.9.1-p430.exe',u'ue_chinese.exe',u'vc6.lnk',u'快捷方式 Ollydbg.exe.lnk',u'快捷方式 Uedit32.exe.lnk',u'Home Ftp Server.lnk',u'OllyDbg调试器.bat',u'VC6开发环境.bat',u'检查并获取Flag.bat'])
for desktop,area in desktops:
    for name in os.listdir(desktop):
        if name in obsolete:
            archive(os.path.join(desktop,name),area)

root_support = [u'Environment',u'Optional',u'README.txt',u'compile.bat',u'demo-original.exe',u'demo.exe',u'main.c',u'submit.bat',u'submit.exe']
if MODE == 'stack-lab2':
    root_support += [u'crackme-original.exe',u'main.cpp',u'method1.exe',u'method2.exe']
else:
    root_support += [u'StackLab2']
for name in root_support:
    attributes(os.path.join(LAB,name),True)
if MODE == 'stack-lab2':
    for name in [u'Originals',u'Materials',u'Practice',u'README.txt',u'edit-input.bat',u'editor.py',u'inspect.bat',u'inspect.exe',u'overflow_exe.dsp',u'overflow_exe.dsw',u'run.bat',u'run.py',u'submit.exe',u'submit.py']:
        attributes(os.path.join(TASK,name),True)
    core = [u'main.cpp',u'password.txt',u'overflow_exe.exe']
else:
    core = [u'main.cpp',u'crackme-original.exe',u'method1.exe',u'method2.exe']
for name in core:
    assert os.path.isfile(os.path.join(TASK,name)),name
    attributes(os.path.join(TASK,name),False)
attributes(SUPPORT,True)

advanced = r'Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced'
for name,value in [('Hidden',2),('ShowSuperHidden',0),('HideFileExt',0),('WebView',0)]:
    registry(_winreg.HKEY_CURRENT_USER,advanced,name,value)
registry(_winreg.HKEY_CURRENT_USER,'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Streams','Settings','09000000040000000000000000777e137335cf11ae6908002b2e12620300000001000000'.decode('hex'),_winreg.REG_BINARY)
registry(_winreg.HKEY_CURRENT_USER,'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Streams\\Defaults','{F3364BA0-65B9-11CE-A9BA-00AA004AE837}','1c000000040000000000000000006c000000000001000000fffffffff0f0f0f0140003006c0000000000000030000000fddfdffd0e000400200010002800000000000000010000000200000003000000b40060007800780000000000010000000200000003000000ffffffff'.decode('hex'),_winreg.REG_BINARY)
policies = r'Software\Microsoft\Windows\CurrentVersion\Policies\Explorer'
for name in ('NoNetHood','NoInternetIcon'):
    registry(_winreg.HKEY_CURRENT_USER,policies,name,1)
registry(_winreg.HKEY_CURRENT_USER,r'Control Panel\Colors','Background','208 216 224',_winreg.REG_SZ)
shell = ctypes.windll.shell32
key = _winreg.OpenKey(_winreg.HKEY_CURRENT_USER,r'Software\Microsoft\Windows\CurrentVersion\Explorer',0,_winreg.KEY_READ | _winreg.KEY_WRITE)
try:
    shell_state,kind = _winreg.QueryValueEx(key,'ShellState')
    if kind == _winreg.REG_BINARY and len(shell_state) >= 8:
        report['shellStateBefore'] = shell_state.encode('hex')
        flags = struct.unpack('<I',shell_state[4:8])[0]
        flags = (flags | 2) & ~((1 << 0) | (1 << 13) | (1 << 15))
        _winreg.SetValueEx(key,'ShellState',0,kind,shell_state[:4]+struct.pack('<I',flags)+shell_state[8:])
except WindowsError:
    pass
finally:
    _winreg.CloseKey(key)
# Windows 2000 exposes SHGetSetSettings by ordinal 68, without the newer named export.
settings = shell[68]
settings.argtypes = [ctypes.c_void_p,ctypes.c_ulong,ctypes.c_int]
settings.restype = None
state = (ctypes.c_ulong * 16)()
mask = 0x00000001 | 0x00000002 | 0x00020000 | 0x00040000
settings(ctypes.byref(state),mask,0)
report['shellFlagsBefore'] = state[0]
state[0] = (state[0] | 2) & ~((1 << 0) | (1 << 13) | (1 << 15))
settings(ctypes.byref(state),mask,1)
settings(None,0,1)
colors = (ctypes.c_int * 1)(1)
values = (ctypes.c_ulong * 1)(208 | (216 << 8) | (224 << 16))
ctypes.windll.user32.SetSysColors(1,colors,values)

if MODE == 'ollydbg':
    scope = {'__name__':'assignment_layout'}
    execfile(SUPPORT+u'\\assignment-layout.py',scope)
    report['assignmentLayout'] = scope['ensure_layout']()
    TASK = report['assignmentLayout']['root']
    attributes(LAB,True)
    title = u'第一次作业：Ollydbg程序分析'
    text = u'玄甲 · 软件安全\r\n' + title + u'\r\n\r\n工作目录：' + TASK + u'\r\n\r\n1. 阅读平台完整题面。\r\n2. main.cpp 是参考源码；materials 保存原始题目材料。\r\n3. 两个工作副本位于 work：method1.exe、method2.exe。所有编辑和保存请使用这个目录，并保持 method1.exe、method2.exe 文件名。另存的 method1-new.exe 等副本不会自动参与核验。\r\n4. 完成后在题目目录中双击 check.cmd。核验读取本目录的工作副本；按平台提示提交动态完成凭证。\r\n\r\n不要求提交报告。课堂补充材料通过 materials 中的入口查看，不参与本题判定。\r\n原有 C:\\Lab 路径保留兼容；不要在新旧目录之间来回编辑。环境重启保留已有作业。\r\n'
    readme = TASK+u'\\README.txt'
    if os.path.isfile(readme) and open(readme,'rb').read() != text.encode('utf-16'):
        archive(readme,u'AssignmentDocs')
    file_text(readme,text)
    with open(TASK+u'\\check.cmd','wb') as stream:
        stream.write('@echo off\r\nC:\\Python27\\python.exe C:\\Lab\\Environment\\assignment-check.py\r\n')
    for old in (u'00 题目说明.txt',u'01 检查结果.lnk',u'02 参考资料.lnk'):
        archive(LAB+u'\\'+old,u'LegacyEntries')
else:
    title = u'第二次作业：Windows API 复用'
    text = u'玄甲 · 软件安全\r\n' + title + u'\r\n\r\n请先阅读平台完整题面。main.cpp 为参考源码，password.txt 为工作文件，overflow_exe.exe 保持原样。\r\n完成后使用题目目录中的“检查结果”入口，按题面提交完成凭证。平台不要求报告或截图。\r\n'
    readme = TASK+u'\\00 题目说明.txt'
    if os.path.isfile(readme) and open(readme,'rb').read() != text.encode('utf-16'):
        archive(readme,u'AssignmentDocs')
    file_text(readme,text)
vbs = [u'Set s = CreateObject("WScript.Shell")']
scope = {'__name__':'desktop_shortcuts'}
execfile(SUPPORT+u'\\desktop-shortcuts.py',scope)
report['desktopShortcuts'] = scope['configure_desktop'](MODE,TASK)
if MODE == 'stack-lab2':
    for name,target in [(u'01 编辑输入',u'edit-input.bat'),(u'02 查看环境',u'inspect.bat'),(u'03 运行题目',u'run.bat'),(u'04 检查结果',u'submit.exe')]:
        vbs += shortcut_lines(TASK+u'\\'+name+u'.lnk',TASK+u'\\'+target,TASK,name)
else:
    if os.path.isdir(LAB+u'\\Optional'):
        vbs += shortcut_lines(TASK+u'\\materials\\课堂补充.lnk',LAB+u'\\Optional',LAB+u'\\Optional',u'课堂补充材料，不参与本题核验')
script = SUPPORT+u'\\tidy-shortcuts.vbs'
open(script,'wb').write((u'\r\n'.join(vbs)+u'\r\n').encode('utf-16'))
response = subprocess.call([r'C:\WINNT\system32\cscript.exe','//B','//NoLogo',script],creationflags=0x08000000)
assert response == 0,response
for path in report['created']:
    assert os.path.isfile(path),path
after = dict((path,digest(path)) for path in protected)
assert before == after,'Original task file contents changed'
report['protectedFileHashes'] = before
report['visibleTaskFiles'] = visible_names(TASK)
report['visibleDesktopFiles'] = dict((path,visible_names(path)) for path,area in desktops)
report['originalTaskFilesUnchanged'] = True
open(RECEIPT,'wb').write(json.dumps(report,ensure_ascii=True,indent=2))
shell.SHChangeNotify(0x08000000,0,None,None)
user = ctypes.windll.user32
user.SendMessageTimeoutW.argtypes = [ctypes.c_void_p,ctypes.c_uint,ctypes.c_ulong,ctypes.c_void_p,ctypes.c_uint,ctypes.c_uint,ctypes.POINTER(ctypes.c_ulong)]
for label in (u'ShellState',u'Policy'):
    message = ctypes.create_unicode_buffer(label)
    result = ctypes.c_ulong()
    user.SendMessageTimeoutW(0xffff,0x001a,0,ctypes.cast(message,ctypes.c_void_p),2,1000,ctypes.byref(result))
emit(report)
