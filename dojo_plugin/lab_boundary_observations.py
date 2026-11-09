import json

GDB_TRACE_PROGRAM = r'''
import gdb
import json
from pathlib import Path

CONFIG = __TRACE_CONFIG__
trace = {'status': 'unavailable', 'engine': 'gdb-python', 'engineVersion': gdb.VERSION,
         'granularity': 'source-line-step-over', 'maxSteps': 160, 'events': [], 'reason': ''}
last_signal = None
executed_declarations = set()
source_path = str(Path(CONFIG['sourceFile']).resolve())


def save():
    Path(CONFIG['traceFile']).write_text(json.dumps(trace, ensure_ascii=False))


def stopped(event):
    global last_signal
    if isinstance(event, gdb.SignalEvent):
        last_signal = event.stop_signal


def snapshot():
    address = int(gdb.parse_and_eval('&__aisecedu_box'))
    data = list(bytes(gdb.selected_inferior().read_memory(address, 32)))
    return {'buffer': data[8:16], 'guard-before': data[:8], 'guard-after': data[16:]}


def current_location():
    frame = gdb.newest_frame()
    sal = frame.find_sal()
    return frame, str(Path(sal.symtab.fullname()).resolve()) if sal.symtab else None, sal.line


def locals_for(frame, filename):
    values = {}
    if filename != source_path:
        return values
    try:
        block = frame.block()
        while block and not block.is_global and not block.is_static:
            for symbol in block:
                if not (symbol.is_argument or symbol.is_variable) or not symbol.name or symbol.name in values:
                    continue
                if not symbol.is_argument and (frame.name(), int(symbol.line)) not in executed_declarations:
                    continue
                if symbol.type.strip_typedefs().code not in (gdb.TYPE_CODE_INT, gdb.TYPE_CODE_BOOL, gdb.TYPE_CODE_ENUM):
                    continue
                try:
                    value = frame.read_var(symbol)
                    if value.is_optimized_out:
                        continue
                    number = int(value)
                    values[symbol.name] = number if abs(number) <= 9007199254740991 else str(number)
                except (gdb.error, ValueError, OverflowError):
                    pass
                if len(values) >= 16:
                    return values
            block = block.superblock
    except gdb.error:
        pass
    return values


def changed(before, after):
    return [{'region': region, 'index': index, 'before': left, 'after': right}
            for region in ('buffer', 'guard-before', 'guard-after')
            for index, (left, right) in enumerate(zip(before[region], after[region])) if left != right]


def completed():
    after = snapshot()
    returned = int(gdb.parse_and_eval('__aisecedu_return'))
    expected = int(gdb.parse_and_eval('__aisecedu_expected'))
    guard = all(value == 165 for region in ('guard-before', 'guard-after') for value in after[region])
    text = CONFIG['inputText'].encode()
    correct = returned == expected and guard
    correct = correct and (after['buffer'][:len(text) + 1] == list(text + b'\0') if expected == 0 else after['buffer'][0] == 0)
    trace.update({'status': 'complete', 'reason': '', 'actualReturn': returned, 'expectedReturn': expected,
                  'afterBytes': after['buffer'], 'guardUnchanged': guard, 'passed': bool(correct)})
    if trace['events']:
        trace['events'][-1]['returnValue'] = returned
    save()


try:
    for command in ('set pagination off', 'set confirm off', 'set auto-load off', 'set startup-with-shell off',
                    'set debuginfod enabled off', 'set disable-randomization off', 'set print thread-events off'):
        gdb.execute(command, to_string=True)
    gdb.events.stop.connect(stopped)
    begin = gdb.Breakpoint('__aisecedu_capture_begin', internal=True)
    gdb.execute('run ' + str(CONFIG['caseIndex']), to_string=True)
    if last_signal or gdb.newest_frame().name() != '__aisecedu_capture_begin':
        raise RuntimeError('未到达初始化后的观察入口')
    begin.delete()
    entry = gdb.Breakpoint('strcpy_s', internal=True)
    done = gdb.Breakpoint('__aisecedu_capture_done', internal=True)
    gdb.execute('continue', to_string=True)
    if last_signal or gdb.newest_frame().name() != 'strcpy_s':
        raise RuntimeError('未进入当前源码的 strcpy_s 函数')
    entry.delete()
    trace['status'] = 'truncated'
    trace['reason'] = '执行追踪尚未到达函数返回'
    save()
    for index in range(trace['maxSteps']):
        frame, filename, line = current_location()
        if filename != source_path or not line:
            if frame.name() != '__aisecedu_capture_done':
                gdb.execute('continue', to_string=True)
            if last_signal or gdb.newest_frame().name() != '__aisecedu_capture_done':
                raise RuntimeError('执行离开追踪源码但未到达返回观察点')
            completed()
            break
        before = snapshot()
        before_locals = locals_for(frame, filename)
        function = frame.name()
        last_signal = None
        gdb.execute('next', to_string=True)
        after = snapshot()
        if not last_signal:
            executed_declarations.add((function, int(line)))
        next_frame, next_file, _ = current_location()
        event = {'index': index, 'file': 'strcpy_s.c', 'line': int(line), 'function': function,
                 'beforeBytes': before['buffer'], 'afterBytes': after['buffer'],
                 'changes': changed(before, after),
                 'guardUnchanged': all(value == 165 for region in ('guard-before', 'guard-after') for value in after[region]),
                 'returnValue': None, 'beforeLocals': before_locals,
                 'afterLocals': locals_for(next_frame, next_file),
                 'status': 'interrupted' if last_signal else 'completed'}
        trace['events'].append(event)
        save()
        if last_signal:
            trace.update({'status': 'error', 'reason': '被调试程序停止于信号 ' + last_signal})
            save()
            break
    else:
        trace.update({'status': 'truncated', 'reason': '到达160个实际源码步骤上限，未继续推测后续执行'})
        save()
except (gdb.error, RuntimeError, ValueError, OSError) as error:
    trace.update({'status': 'error' if trace['events'] else 'unavailable', 'reason': str(error)[:500]})
    save()
finally:
    try:
        if gdb.selected_inferior().pid:
            gdb.execute('kill', to_string=True)
    except gdb.error:
        pass
'''

SAFE_COPY_OBSERVATION_PROGRAM = r'''
import hashlib,json,os,resource,signal,stat,subprocess,sys,tempfile,time
from pathlib import Path

GDB_PROGRAM = __GDB_TRACE_PROGRAM__

HEADER = """#ifndef SAFE_COPY_HOMEWORK_H
#define SAFE_COPY_HOMEWORK_H
#include <stddef.h>
#include <stdint.h>
#include <errno.h>
typedef int errno_t;
typedef size_t rsize_t;
#define HOMEWORK_RSIZE_MAX (SIZE_MAX >> 1)
errno_t strcpy_s(char *restrict s1, rsize_t s1max, const char *restrict s2);
#endif
"""
WRAPPER = r"""#include "safe_copy.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
struct { unsigned char before[8]; unsigned char target[8]; unsigned char after[16]; } __aisecedu_box;
volatile int __aisecedu_return;
volatile int __aisecedu_expected;
volatile int __aisecedu_marker;
void __aisecedu_capture_begin(void) { __aisecedu_marker = 1; }
void __aisecedu_capture_done(void) { __aisecedu_marker = 2; }
int main(int argc, char **argv) {
    const char *inputs[] = {"", "ABCDEFG", "ABCDEFGH"};
    int which = argc == 2 ? atoi(argv[1]) : -1;
    if (which < 0 || which > 2) return 2;
    #define box __aisecedu_box
    memset(&box, 0xa5, sizeof box);
    const size_t length = strlen(inputs[which]);
    int expected = which == 2 ? ERANGE : 0;
    __aisecedu_expected = expected;
    __aisecedu_capture_begin();
    __aisecedu_return = strcpy_s((char *)box.target, 8, inputs[which]);
    __aisecedu_capture_done();
    int returned = __aisecedu_return;
    int guarded = 1;
    for (size_t i = 0; i < sizeof box.before; ++i) guarded &= box.before[i] == 0xa5;
    for (size_t i = 0; i < sizeof box.after; ++i) guarded &= box.after[i] == 0xa5;
    int correct = returned == expected && guarded;
    if (!expected) correct &= memcmp(box.target, inputs[which], length + 1) == 0;
    else correct &= box.target[0] == 0;
    printf("\n__AISECEDU_BOUNDARY__{\"actualReturn\":%d,\"expectedReturn\":%d,\"guardUnchanged\":%s,\"passed\":%s,\"afterHex\":\"", returned, expected, guarded ? "true" : "false", correct ? "true" : "false");
    for (size_t i = 0; i < 8; ++i) printf(i ? " %02x" : "%02x", box.target[i]);
    printf("\"}\n");
    return 0;
}
"""

def limits(trace=False):
    os.setsid()
    resource.setrlimit(resource.RLIMIT_CPU, (8, 8) if trace else (3, 3))
    memory = (512 if trace else 256) * 1024 * 1024
    resource.setrlimit(resource.RLIMIT_AS, (memory, memory))
    resource.setrlimit(resource.RLIMIT_FSIZE, (4 * 1024 * 1024, 4 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))

def run(command, cwd, timeout, trace=False):
    with tempfile.TemporaryFile() as output:
        process = subprocess.Popen(command, cwd=cwd, stdout=output, stderr=subprocess.STDOUT, preexec_fn=lambda: limits(trace))
        timed_out = False
        try:
            process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
        finally:
            try: os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError: pass
            process.wait()
        output.seek(0)
        return process.returncode, output.read(12000).decode('utf-8', 'replace'), timed_out

def main():
    source_path = Path(sys.argv[1]) / 'strcpy_s.c'
    fd = os.open(source_path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > 1048576:
            raise ValueError('源码文件不可读或超过大小限制')
        source = stream.read(1048577)
    if len(source) > 1048576: raise ValueError('源码超过大小限制')
    result = {'kind': 'boundary-observation', 'status': 'unavailable', 'capacity': 8,
              'sourceSha256': hashlib.sha256(source).hexdigest(), 'compiler': '/usr/bin/gcc',
              'cases': [], 'startedAt': time.time(),
              'source': {'file': 'strcpy_s.c', 'sha256': hashlib.sha256(source).hexdigest(), 'text': source.decode('utf-8', 'replace'), 'lineCount': len(source.splitlines())},
              'executionMode': 'debug-source-snapshot'}
    with tempfile.TemporaryDirectory(prefix='aisecedu-boundary-') as directory:
        root = Path(directory)
        (root / 'strcpy_s.c').write_bytes(source)
        (root / 'safe_copy.h').write_text(HEADER)
        (root / 'observe.c').write_text(WRAPPER)
        code, output, timed_out = run(['/usr/bin/gcc', '-std=c11', '-Wall', '-Wextra', '-Wpedantic', '-Werror', '-O0', '-g3', '-fno-omit-frame-pointer', '-fno-inline', '-I.', 'strcpy_s.c', 'observe.c', '-o', 'observe'], directory, 8)
        result['compilation'] = {'status': 'timeout' if timed_out else 'error' if code else 'success', 'exitCode': code, 'output': output}
        if timed_out or code:
            result['status'] = 'compile-timeout' if timed_out else 'compile-error'
        else:
            result['status'] = 'completed'
            for identity, text in [('empty', ''), ('exact', 'ABCDEFG'), ('short', 'ABCDEFGH')]:
                index = len(result['cases'])
                case = {'id': identity, 'inputText': text, 'inputBytes': list(text.encode()), 'capacity': 8,
                        'expectedReturn': None, 'actualReturn': None, 'beforeHex': ' '.join(['a5'] * 8),
                        'afterHex': None, 'guardUnchanged': None, 'passed': None, 'status': 'runtime-error'}
                trace_path = root / ('trace-' + str(index) + '.json')
                config = {'sourceFile': str(root / 'strcpy_s.c'), 'traceFile': str(trace_path), 'caseIndex': index, 'inputText': text}
                trace_script = root / ('trace-' + str(index) + '.py')
                trace_script.write_text(GDB_PROGRAM.replace('__TRACE_CONFIG__', repr(config)))
                code, output, timed_out = run(['/usr/bin/gdb', '-q', '-nx', '-nh', '--batch', '-iex', 'set auto-load off', '-x', str(trace_script), '--args', str(root / 'observe')], directory, 12, trace=True)
                trace = json.loads(trace_path.read_text()) if trace_path.is_file() and trace_path.stat().st_size < 2000000 else {'status': 'unavailable', 'engine': 'gdb-python', 'events': [], 'reason': '调试器未返回执行轨迹'}
                if timed_out:
                    trace.update({'status': 'timeout', 'reason': '执行追踪超时，保留已经采集的真实步骤'})
                case['trace'] = trace
                case['exitCode'] = code
                case['output'] = output[:2000]
                if trace.get('status') == 'complete':
                    case.update({key: trace[key] for key in ['actualReturn', 'expectedReturn', 'guardUnchanged', 'passed']})
                    case['afterHex'] = ' '.join(format(value, '02x') for value in trace['afterBytes'])
                    case['status'] = 'observed'
                else:
                    case['status'] = 'timeout' if timed_out else 'trace-incomplete'
                    if trace.get('events'):
                        case['afterHex'] = ' '.join(format(value, '02x') for value in trace['events'][-1]['afterBytes'])
                        case['guardUnchanged'] = trace['events'][-1]['guardUnchanged']
                result['cases'].append(case)
    result['finishedAt'] = time.time()
    print(json.dumps(result, ensure_ascii=False))

try:
    main()
except (OSError, ValueError, KeyError, TypeError) as error:
    print(json.dumps({'kind': 'boundary-observation', 'status': 'unavailable', 'capacity': 8, 'cases': [], 'error': str(error)[:500]}, ensure_ascii=False))
'''


def observe_safe_copy_boundary(container, manifest):
    if manifest.get('taskId') != 'secure-copy-homework1':
        return None
    try:
        result = container.exec_run(['/usr/bin/timeout', '50', '/usr/local/bin/python3', '-I', '-c',
                                     SAFE_COPY_OBSERVATION_PROGRAM.replace('__GDB_TRACE_PROGRAM__', repr(GDB_TRACE_PROGRAM)), manifest['workspace']], user='1000')
        if result.exit_code or len(result.output) > 8000000:
            return {'kind': 'boundary-observation', 'status': 'unavailable', 'capacity': 8,
                    'cases': [], 'error': '边界观察未完成，公开自测结果不受影响。'}
        data = json.loads(result.output)
        if not isinstance(data, dict) or data.get('kind') != 'boundary-observation':
            raise ValueError('Invalid observation')
        return data
    except Exception:
        return {'kind': 'boundary-observation', 'status': 'unavailable', 'capacity': 8,
                'cases': [], 'error': '无法读取边界观察结果，公开自测结果不受影响。'}
