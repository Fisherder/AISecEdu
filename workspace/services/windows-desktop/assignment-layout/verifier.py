import argparse
import hashlib
import json
import pathlib
import secrets
import socket
import struct
import sys
import os
import time

sys.path.insert(0, str(pathlib.Path(__file__).with_name("vendor")))

try:
    import capstone
except (ImportError, OSError):
    capstone = None
import pefile
from unicorn import Uc, UcError, UC_ARCH_X86, UC_MODE_32, UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_EBX, UC_X86_REG_EDI, UC_X86_REG_ESP, UC_X86_REG_EBP


ROOT = pathlib.Path('/opt/windows/originals')
DEMO_HASH = 'a6b9037d2bbbeb1cb81aa2959bb861979e64f4098242218d8b8941e8e35c09f7'
CRACKME_HASH = 'aded6a0ffca68e72222afe284b28bd0c298d1b5d14176eb8cd6212befbf99500'

ENTRY_VA = 0x4015e2
SUCCESS_VA = 0x401620
FAILURE_VA = 0x401637
EMULATE_END_VA = 0x401658
REGION_SLACK = 16
MAX_CHANGED_BYTES = 40
FILE_SIZE = 20480
REGISTRATION_PASSWORD = 'crackmepassword'
WRONG_PASSWORDS = ('not-the-password', 'crackmepassworX', '0')

CONDITION_PAIRS = (
    ('je', 'jne'), ('jz', 'jnz'), ('jg', 'jle'), ('jge', 'jl'),
    ('ja', 'jbe'), ('jae', 'jb'), ('jns', 'js'), ('jnp', 'jp'), ('jo', 'jno'),
)
CONDITIONAL_JUMPS = {name for pair in CONDITION_PAIRS for name in pair} | {
    'jb', 'jbe', 'jl', 'jle', 'jp', 'js', 'jo', 'jno', 'jnp', 'jcxz', 'jecxz',
}

class VerifierUnavailable(RuntimeError):
    pass


class MethodReviewRequired(RuntimeError):
    pass


try:
    DISASSEMBLER = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32) if capstone else None
    if DISASSEMBLER is not None:
        DISASSEMBLER.detail = False
except Exception:
    DISASSEMBLER = None


def require_disassembler():
    if DISASSEMBLER is None:
        raise VerifierUnavailable('判题服务缺少可用的指令分析依赖，请联系管理员修复。你的文件未被判定为错误，无需重新修改。')


_region_cache = {}
_original_cache = {}


def memory(data):
    pe = pefile.PE(data=data)
    machine = Uc(UC_ARCH_X86, UC_MODE_32)
    base = pe.OPTIONAL_HEADER.ImageBase
    size = (pe.OPTIONAL_HEADER.SizeOfImage + 4095) & ~4095
    machine.mem_map(base, size)
    machine.mem_write(base, pe.get_memory_mapped_image())
    machine.mem_map(0x10000000, 0x20000)
    machine.reg_write(UC_X86_REG_ESP, 0x10010000)
    machine.reg_write(UC_X86_REG_EBP, 0x10010080)
    return machine


def _mapped_byte(data, pe, address):
    try:
        offset = pe.get_offset_from_rva(address - pe.OPTIONAL_HEADER.ImageBase)
    except Exception:
        return None
    if 0 <= offset < len(data):
        return data[offset]
    return None


def registration_trace(data, password):
    """Emulate one registration attempt: executed addresses + outcome.

    The outcome is True (success branch), False (failure branch) or
    ``('return', eax)`` when the patched code returns from the function before
    the original result branches -- a legitimate "always succeed" crack that the
    caller then judges by the return value.
    """
    machine = memory(data)
    machine.mem_write(0x10001000, password.encode('ascii') + b'\0')
    machine.reg_write(UC_X86_REG_EAX, 0x10001000)
    machine.reg_write(UC_X86_REG_EBX, 0)
    machine.reg_write(UC_X86_REG_EDI, 0x10002000)
    pe = pefile.PE(data=data)
    addresses = []
    outcome = []

    def observe(uc, address, size, context):
        if ENTRY_VA <= address <= EMULATE_END_VA:
            addresses.append(address)
        if address in (SUCCESS_VA, FAILURE_VA):
            outcome.append(address == SUCCESS_VA)
            uc.emu_stop()
            return
        if _mapped_byte(data, pe, address) in (0xC3, 0xC2):
            outcome.append(('return', int(uc.reg_read(UC_X86_REG_EAX))))
            uc.emu_stop()

    machine.hook_add(UC_HOOK_CODE, observe)
    try:
        machine.emu_start(ENTRY_VA, EMULATE_END_VA, timeout=200000, count=4000)
    except UcError:
        if not outcome:
            raise
    if not outcome:
        raise ValueError('unreachable')
    return addresses, outcome[0]


def crackme_outcome(data, password, success_is_zero=True):
    outcome = registration_trace(data, password)[1]
    if isinstance(outcome, tuple):
        value = outcome[1]
        return value == 0 if success_is_zero else value != 0
    return outcome


def branch_outcome(data, comparison):
    machine = memory(data)
    machine.mem_write(0x1001007c, struct.pack('<i', comparison))
    result = []

    def observe(uc, address, size, context):
        if address in (0x4010e7, 0x4010f6):
            result.append(address == 0x4010f6)
            uc.emu_stop()

    machine.hook_add(UC_HOOK_CODE, observe)
    machine.emu_start(0x4010e1, 0x401107, timeout=100000, count=50)
    if not result:
        raise ValueError('The demo no longer reaches the original result branches.')
    return result[0]


def original_crackme(originals=ROOT):
    key = str(originals)
    if key not in _original_cache:
        _original_cache[key] = (pathlib.Path(originals) / 'crackme-original.exe').read_bytes()
    return _original_cache[key]


def _instruction_at(original, pe, address):
    if DISASSEMBLER is None:
        return None
    offset = pe.get_offset_from_rva(address - pe.OPTIONAL_HEADER.ImageBase)
    for instruction in DISASSEMBLER.disasm(original[offset:offset + 16], address):
        return instruction
    return None


def region_of(original):
    """Discover by emulation which bytes actually decide the registration.

    Nothing is hard-coded to one compiler layout: a successful and a failed
    attempt are both traced, and every executed instruction between the entry
    point and the outcome branches counts as authentication code that a student
    may edit.
    """
    require_disassembler()
    key = hashlib.sha256(original).hexdigest()
    if key in _region_cache:
        return _region_cache[key]
    correct, _ = registration_trace(original, REGISTRATION_PASSWORD)
    wrong, _ = registration_trace(original, WRONG_PASSWORDS[1])
    pe = pefile.PE(data=original)
    base = pe.OPTIONAL_HEADER.ImageBase
    executed = sorted({address for address in correct + wrong if ENTRY_VA <= address <= EMULATE_END_VA})
    offsets = [pe.get_offset_from_rva(address - base) for address in executed]
    start, end = min(offsets) - REGION_SLACK, max(offsets) + REGION_SLACK

    condition = _instruction_at(original, pe, wrong[-1]) if wrong else None
    if condition is None or condition.mnemonic not in CONDITIONAL_JUMPS:
        for address in reversed(wrong):
            candidate = _instruction_at(original, pe, address)
            if candidate is not None and candidate.mnemonic in CONDITIONAL_JUMPS:
                condition = candidate
                break
    # The comparison usually sits a few instructions before the jump
    # (e.g. test eax,eax / push / push / jne), so walk back over the trace.
    comparison = None
    for address in reversed(wrong[:-1] if wrong else []):
        candidate = _instruction_at(original, pe, address)
        if candidate is None:
            continue
        if candidate.mnemonic in ('test', 'cmp'):
            comparison = candidate
            break
        if candidate.mnemonic in ('jmp', 'ret', 'retn', 'call'):
            break
    # Convention: ``test eax,eax`` + ``jne <failure>`` means EAX == 0 is success.
    success_is_zero = True
    if condition is not None:
        target = condition.op_str.strip()
        try:
            target_value = int(target, 16)
        except ValueError:
            target_value = None
        if target_value == FAILURE_VA and condition.mnemonic in ('je', 'jz', 'jle', 'jbe', 'jl', 'jb'):
            success_is_zero = False
    result = {
        'start': start,
        'end': end,
        # Instruction-level analysis must start on a real instruction boundary,
        # while the allowed edit window keeps its slack on both sides.
        'codeStart': min(offsets),
        'codeEnd': max(offsets) + 1,
        'jumpVa': condition.address if condition else None,
        'comparisonVa': comparison.address if comparison else None,
        'jumpText': f'{condition.mnemonic} {condition.op_str}'.strip() if condition else '',
        'comparisonText': f'{comparison.mnemonic} {comparison.op_str}'.strip() if comparison else '',
        'successIsZero': success_is_zero,
    }
    _region_cache[key] = result
    return result


def changed_bytes(original, candidate):
    if len(original) != len(candidate):
        return None
    return [index for index in range(len(original)) if original[index] != candidate[index]]


def describe_change(address, original_bytes, candidate_bytes):
    if not original_bytes:
        return '0x%X 新增字节 %s' % (address, candidate_bytes.hex(' '))
    if not candidate_bytes:
        return '0x%X 删除原字节 %s' % (address, original_bytes.hex(' '))
    return '0x%X %s → %s' % (address, original_bytes.hex(' '), candidate_bytes.hex(' '))


def _decoded(blob, address):
    if DISASSEMBLER is None:
        return None
    try:
        return next(iter(DISASSEMBLER.disasm(bytes(blob), address)), None)
    except capstone.CsError:
        return None


def _is_inverted(replacement, original_bytes, address):
    new = _decoded(replacement, address)
    old = _decoded(original_bytes, address)
    if new is None or old is None:
        return False
    return any({old.mnemonic, new.mnemonic} == {left, right} for left, right in CONDITION_PAIRS)


def classify_method(original, candidate):
    """Judge one working copy: behaviour first, then a localised, explained diff."""
    require_disassembler()
    if len(candidate) != FILE_SIZE:
        return None, (
            '文件大小是 %d 字节，不是原始的 %d 字节；请从 crackme-original.exe 重新复制一份'
            '（用 OllyDbg 保存不会改变大小），再改认证判断。' % (len(candidate), FILE_SIZE)
        )
    differences = changed_bytes(original, candidate)
    if not differences:
        return None, (
            '核验收到的固定 method1.exe / method2.exe 与原始材料相同；请确认保存到题目 work 目录下的规定文件名'
            '（另存为 method1-new.exe 等其他名字不会自动成为提交对象）。请在题目目录运行 check.cmd，先核对其显示的完整输入路径。'
        )
    region = region_of(original)
    inside = [index for index in differences if region['start'] <= index < region['end']]
    outside = len(differences) - len(inside)
    if outside or len(differences) > MAX_CHANGED_BYTES:
        return None, (
            '改动范围超出了认证判断代码：共改动 %d 字节，其中 %d 字节在认证代码之外；'
            '只允许改认证判断附近的指令（最多 %d 字节），其余代码、界面和提示文字必须保持原样。'
            % (len(differences), outside, MAX_CHANGED_BYTES)
        )
    success_is_zero = region.get('successIsZero', True)
    pe = pefile.PE(data=original)
    base = pe.OPTIONAL_HEADER.ImageBase
    code_start = region.get('codeStart', region['start'])
    start_rva = pe.get_rva_from_offset(code_start)
    instructions = (
        list(DISASSEMBLER.disasm(original[code_start:region['end']], base + start_rva))
        if DISASSEMBLER is not None
        else []
    )
    changes = []
    covered = set()
    for instruction in instructions:
        offset = pe.get_offset_from_rva(instruction.address - base)
        touched = [index for index in differences if offset <= index < offset + instruction.size]
        if not touched:
            continue
        covered.update(touched)
        changes.append(
            {
                'address': instruction.address,
                'mnemonic': instruction.mnemonic,
                'original': original[offset:offset + instruction.size],
                'candidate': candidate[offset:offset + instruction.size],
                'branch': instruction.address == region['jumpVa'],
                'comparison': instruction.address == region['comparisonVa'],
            }
        )
    inserted = [
        index
        for index in differences
        if index not in covered and code_start <= index < region['end']
    ]
    marginal = [
        index for index in differences if index not in covered and index < code_start
    ]
    summary = '；'.join(
        describe_change(item['address'], item['original'], item['candidate']) for item in changes[:3]
    )
    if inserted:
        summary = (summary + '；' if summary else '') + (
            '另有 %d 字节不在指令边界上（可能是插入或删除）' % len(inserted)
        )
    if marginal and not changes:
        summary = (summary + '；' if summary else '') + (
            '改动落在了认证代码边界之外（%s）' % describe_change(
                base + marginal[0], bytes(original[marginal[0]:marginal[0] + 1]),
                bytes(candidate[marginal[0]:marginal[0] + 1]),
            )
        )

    def with_detail(message):
        return message + ('（检测到的改动：' + summary + '）' if summary else '')

    try:
        wrong_passwords_succeed = all(
            crackme_outcome(candidate, value, success_is_zero)
            for value in WRONG_PASSWORDS + (secrets.token_hex(12),)
        )
        correct_succeeds = crackme_outcome(candidate, REGISTRATION_PASSWORD, success_is_zero)
    except (ValueError, UcError):
        return None, with_detail(
            '改动之后程序执行不到原来的成功/失败分支了（多半把指令改坏了，或跳到了别处）；'
            '请只改认证判断那一条指令（条件跳转，或它前面的比较），别动其它字节。'
        )
    if not wrong_passwords_succeed:
        hint = ''
        branch_change = next((item for item in changes if item['branch']), None)
        if branch_change is not None:
            target = jump_target(branch_change['candidate'], branch_change['address'])
            if target == FAILURE_VA:
                hint = '你把 0x%X 改成了跳向 0x%X，而那正是失败分支；应该改成不跳（落到成功分支）或跳向成功分支 0x%X。' % (
                    branch_change['address'], target, SUCCESS_VA
                )
            elif target is not None:
                hint = '你把 0x%X 改成了跳向 0x%X，那不是原来的成功分支（0x%X）。' % (
                    branch_change['address'], target, SUCCESS_VA
                )
        return None, with_detail(
            '补丁没有生效：错误密码仍然走到失败分支。' + hint +
            '请确认改动保存进了这个文件，并且确实改掉了成功/失败的判断。'
        )

    branch_change = next((item for item in changes if item['branch']), None)
    comparison_change = next((item for item in changes if item['comparison']), None)
    if branch_change is not None and not inserted:
        replacement = branch_change['candidate']
        new_instruction = _decoded(replacement, branch_change['address'])
        if replacement and all(byte == 0x90 for byte in replacement):
            method = 'remove-condition'
        elif new_instruction is not None and new_instruction.mnemonic in ('jmp', 'ret', 'retn'):
            method = 'force-jump'
        elif _is_inverted(replacement, branch_change['original'], branch_change['address']):
            method = 'invert-condition'
        else:
            method = 'custom-condition'
    elif comparison_change is not None and not inserted and len(changes) == 1:
        method = 'force-comparison'
    elif not inserted and len(changes) == 1 and changes[0]['mnemonic'] in ('test', 'cmp'):
        method = 'force-comparison'
    elif any(item['candidate'][:1] in (b'\xe9', b'\xeb', b'\xc3') for item in changes):
        method = 'redirect'
    else:
        method = 'custom'

    if not correct_succeeds:
        # Wrong passwords pass while the original one no longer does: the
        # condition itself was inverted, whatever the encoding.
        method = 'invert-condition'
    elif returns_early(candidate, success_is_zero) and method in ('custom', 'redirect'):
        method = 'early-success'
    return method, ('；检测到的改动：' + summary if summary else '')


def jump_target(replacement, address):
    instruction = _decoded(replacement, address)
    if instruction is None or instruction.mnemonic != 'jmp':
        return None
    try:
        return int(instruction.op_str.strip(), 16)
    except ValueError:
        return None


def returns_early(data, success_is_zero=True):
    """True when the patched code returns from the function before the branches."""
    try:
        outcome = registration_trace(data, WRONG_PASSWORDS[0])[1]
    except (ValueError, UcError):
        return False
    if not isinstance(outcome, tuple):
        return False
    value = outcome[1]
    return value == 0 if success_is_zero else value != 0


def repair_transfer(original, data):
    """Undo a dropped or duplicated byte from the serial transfer.

    The guest sends the working copies over a serial link without flow control
    and without a checksum, so one lost byte shifts everything after it and the
    submission looks like a huge, nonsensical patch. Such a shift is easy to
    recognise (the tail matches the original offset by one or two bytes) and to
    repair by re-inserting the missing byte, so a correct submission is not
    rejected because of the transport.
    """
    if len(data) != len(original):
        return data, False
    differences = changed_bytes(original, data)
    if not differences or len(differences) <= MAX_CHANGED_BYTES:
        return data, False
    tail_start = max(0, len(original) - 1024)
    tail_length = len(original) - tail_start
    for shift in (1, -1, 2, -2):
        matches = 0
        for index in range(tail_start, len(original)):
            source = index + shift
            if 0 <= source < len(original) and data[index] == original[source]:
                matches += 1
        if matches < 0.98 * tail_length:
            continue
        point = len(original)
        for index in range(len(original) - 1 - abs(shift), -1, -1):
            source = index + shift
            if data[index] == original[source]:
                point = index
            else:
                break
        # Zero runs make the exact insertion point ambiguous, so try a few
        # candidates and keep the repair that changes the least.
        candidates = {point, differences[0], max(0, point - 1), len(original) - abs(shift)}
        step = max(1, (point - differences[0]) // 8) if point > differences[0] else 1
        candidates.update(range(differences[0], max(differences[0], point), step))
        best = None
        best_score = None
        for candidate_point in sorted(candidates):
            if not 0 <= candidate_point <= len(original):
                continue
            if shift > 0:
                attempt = data[:candidate_point] + original[candidate_point:candidate_point + shift] + data[candidate_point:]
            else:
                attempt = data[:candidate_point] + data[candidate_point - shift:]
            attempt = attempt[:len(original)]
            if len(attempt) != len(original):
                continue
            score = len(changed_bytes(original, attempt) or [])
            if best_score is None or score < best_score:
                best, best_score = attempt, score
        if best is not None:
            return best, True
    return data, False


def patch(data, rva, code):
    result = bytearray(data)
    offset = pefile.PE(data=data).get_offset_from_rva(rva)
    result[offset:offset + len(code)] = code
    return bytes(result)


def check(demo, first, second, originals=ROOT):
    require_disassembler()
    original_demo = (pathlib.Path(originals) / 'demo-original.exe').read_bytes()
    original = original_crackme(originals)
    if hashlib.sha256(original_demo).hexdigest() != DEMO_HASH or hashlib.sha256(original).hexdigest() != CRACKME_HASH:
        raise VerifierUnavailable('判题参考文件完整性检查失败，请联系管理员修复。你的文件未被判定为错误。')
    methods = []
    repaired = []
    candidates = []
    for index, data in enumerate((first, second), 1):
        data, fixed = repair_transfer(original, data)
        if fixed:
            repaired.append('method%d.exe' % index)
        method, detail = classify_method(original, data)
        if method is None:
            raise ValueError('Method %d（method%d.exe）：%s' % (index, index, detail))
        methods.append(method)
        candidates.append(data)
    if candidates[0] == candidates[1]:
        raise ValueError('本次实际收到的 method1.exe 与 method2.exe 内容完全相同。请在题目目录运行 check.cmd，核对其显示的 work\\method1.exe、work\\method2.exe 完整路径；fc 若比较的是另存文件，则比较对象不同。两份提交仍须使用不同方法。')
    if any(method in ('custom', 'custom-condition', 'redirect') for method in methods):
        raise MethodReviewRequired('两份文件均通过执行验证，但判题器暂时无法确认修改方法的类别。请保留现有文件并联系教师复核；这不代表两份文件使用了同一种方法。')
    if methods[0] == methods[1]:
        raise ValueError(
            '两份文件用的是同一种方法（%s），请换一种不同种类的改法：'
            '例如一份反转条件跳转，另一份改掉比较结果。' % methods[0]
        )
    result = {'methods': methods, 'wrong_password_trials_per_method': len(WRONG_PASSWORDS) + 1}
    if repaired:
        result['transferRepaired'] = repaired
    return result


def receive(connection, size):
    result = bytearray()
    while len(result) < size:
        block = connection.recv(size - len(result))
        if not block:
            raise ConnectionError('The guest closed the verification channel.')
        result.extend(block)
    return bytes(result)


def self_test():
    require_disassembler()
    original = original_crackme()
    first = patch(original, 0x161e, b'\x90\x90')
    second = patch(original, 0x1618, b'\x33\xc0')
    result = check(b'', first, second)
    if result['methods'] != ['remove-condition', 'force-comparison']:
        raise VerifierUnavailable('判题方法分类自检失败，请联系管理员修复。你的文件未被判定为错误。')
    return {'ready': True, 'revision': '20261007-v1', 'capstone': capstone.__version__, 'python': sys.executable, **result}


def write_status(path, payload):
    if path is None:
        return
    target = pathlib.Path(path)
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps({'pid': os.getpid(), **payload}, ensure_ascii=False))
    temporary.chmod(0o600)
    temporary.replace(target)


def serve(socket_path='/var/lib/windows-lab/serial.sock', status_path='/var/lib/windows-lab/grader-status.json'):
    startup_error = None
    try:
        status = self_test()
    except Exception as error:
        startup_error = error
        status = {'ready': False, 'reason': str(error)}
    write_status(status_path, {**status, 'connected': False})
    channel = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    for _ in range(120):
        try:
            channel.connect(socket_path)
            break
        except (FileNotFoundError, ConnectionRefusedError):
            time.sleep(0.5)
    else:
        raise RuntimeError('The Windows serial channel did not start.')
    write_status(status_path, {**status, 'connected': True})
    while True:
        window = bytearray()
        while bytes(window[-8:]) != b'OLLYLAB2':
            window.extend(receive(channel, 1))
            if len(window) > 16:
                del window[:-8]
        channel.settimeout(20)
        try:
            sizes = struct.unpack('<III', receive(channel, 12))
            if sizes[1:] != (FILE_SIZE, FILE_SIZE):
                raise ValueError(
                    'method1.exe / method2.exe 的大小不是原始的 %d 字节；'
                    '请从 C:\\Lab\\crackme-original.exe 重新复制一份，再改认证判断。' % FILE_SIZE
                )
            payloads = [receive(channel, size) for size in sizes]
            if startup_error is not None:
                raise VerifierUnavailable('判题服务自检未通过，请联系管理员修复。你的文件未被判定为错误，无需重新修改。')
            result = check(*payloads)
            flag = pathlib.Path('/flag').read_text().strip()
            response = 'OK\n' + flag + '\n两种不同的破解方法都已验证通过。Flag 已复制并保存到 C:\\Lab\\flag.txt。'
            pathlib.Path('/var/lib/windows-lab/verified.json').write_text(
                json.dumps(result, ensure_ascii=False)
            )
            published = pathlib.Path('/usr/share/novnc/lab-result.json')
            temporary = published.with_suffix('.tmp')
            temporary.write_text(json.dumps({'flag': flag}))
            temporary.replace(published)
            published.chmod(0o644)
        except VerifierUnavailable as error:
            response = 'ERROR\n[系统错误] ' + str(error)
        except MethodReviewRequired as error:
            response = 'ERROR\n[需要复核] ' + str(error)
        except (ValueError, UcError) as error:
            response = 'ERROR\n' + str(error)
        except Exception as error:
            response = (
                'ERROR\n[系统错误] 判题服务发生异常（%s），本次未作出判定。'
                '请保留文件并联系管理员处理，无需反复修改。' % type(error).__name__
            )
        raw = response.encode('utf-8')
        channel.sendall(struct.pack('<I', len(raw)) + raw)
        channel.settimeout(None)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--self-test', action='store_true')
    parser.add_argument('--socket', default='/var/lib/windows-lab/serial.sock')
    parser.add_argument('--status', default='/var/lib/windows-lab/grader-status.json')
    arguments = parser.parse_args()
    if arguments.self_test:
        print(json.dumps(self_test(), ensure_ascii=False))
    else:
        serve(arguments.socket, arguments.status)
