import re


ENGINE_VERSION = "aes128/1"
STANDARD_URL = "https://csrc.nist.gov/pubs/fips/197/final"


def block(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-fA-F]{32}", value):
        raise ValueError("请输入 32 个十六进制字符，表示 16 字节。")
    return list(bytes.fromhex(value))


def multiply(a, b):
    result = 0
    for _ in range(8):
        if b & 1:
            result ^= a
        a = ((a << 1) ^ (0x11b if a & 0x80 else 0)) & 255
        b >>= 1
    return result


def inverse(value):
    result, power, exponent = 1, value, 254
    while exponent:
        if exponent & 1:
            result = multiply(result, power)
        power = multiply(power, power)
        exponent >>= 1
    return result if value else 0


def substitute(value):
    value = inverse(value)
    result = value ^ 0x63
    for offset in (1, 2, 3, 4):
        result ^= ((value << offset) | (value >> (8 - offset))) & 255
    return result


SBOX = tuple(substitute(value) for value in range(256))
INVERSE_SBOX = tuple(SBOX.index(value) for value in range(256))


def round_keys(key):
    expanded, rcon = block(key), 1
    while len(expanded) < 176:
        word = expanded[-4:]
        if len(expanded) % 16 == 0:
            word = [SBOX[value] for value in word[1:] + word[:1]]
            word[0] ^= rcon
            rcon = multiply(rcon, 2)
        for value in word:
            expanded.append(expanded[-16] ^ value)
    return [expanded[offset:offset + 16] for offset in range(0, 176, 16)]


def transform(state, operation, key=None):
    if len(state) != 16:
        raise ValueError("状态必须包含 16 个字节。")
    if operation == "subBytes":
        return [SBOX[value] for value in state]
    if operation == "invSubBytes":
        return [INVERSE_SBOX[value] for value in state]
    if operation in {"shiftRows", "invShiftRows"}:
        direction = 1 if operation == "shiftRows" else -1
        return [state[4 * ((column + direction * row) % 4) + row]
                for column in range(4) for row in range(4)]
    if operation == "addRoundKey":
        if key is None or len(key) != 16:
            raise ValueError("轮密钥必须包含 16 个字节。")
        return [value ^ key[index] for index, value in enumerate(state)]
    if operation in {"mixColumns", "invMixColumns"}:
        factors = [2, 3, 1, 1] if operation == "mixColumns" else [14, 11, 13, 9]
        output = []
        for column in range(4):
            values = state[4 * column:4 * column + 4]
            for row in range(4):
                output.append(multiply(values[0], factors[(-row) % 4])
                              ^ multiply(values[1], factors[(1 - row) % 4])
                              ^ multiply(values[2], factors[(2 - row) % 4])
                              ^ multiply(values[3], factors[(3 - row) % 4]))
        return output
    raise ValueError("不支持的 AES 变换。")


OPERATIONS = {
    "input": ("输入明文", "把 16 字节按列放入状态矩阵。每个格子是一字节，不是一个字符。"),
    "addRoundKey": ("轮密钥加", "当前状态与本轮轮密钥逐字节异或，把密钥引入数据变换。"),
    "subBytes": ("字节代换", "每个字节通过同一张 S 盒独立代换。位置不变，数值可能变化。"),
    "shiftRows": ("行移位", "第 0、1、2、3 行分别向左循环移动 0、1、2、3 格，字节数值不变。"),
    "mixColumns": ("列混合", "每一列在有限域中进行确定的线性变换，使一个输入字节影响多个输出字节。"),
}


def encrypt_trace(plaintext, key):
    state, keys = block(plaintext), round_keys(key)
    trace = []

    def append(round_number, operation, previous):
        label, explanation = OPERATIONS[operation]
        trace.append({"round": round_number, "operation": operation,
                      "label": label, "explanation": explanation,
                      "before": previous, "state": state[:],
                      "roundKey": keys[round_number] if operation == "addRoundKey" else None})

    append(0, "input", state[:])
    previous, state = state[:], transform(state, "addRoundKey", keys[0])
    append(0, "addRoundKey", previous)
    for round_number in range(1, 11):
        operations = ["subBytes", "shiftRows"]
        if round_number < 10:
            operations.append("mixColumns")
        operations.append("addRoundKey")
        for operation in operations:
            previous, state = state[:], transform(state, operation, keys[round_number])
            append(round_number, operation, previous)
    return {"engineVersion": ENGINE_VERSION, "plaintext": plaintext.lower(), "key": key.lower(),
            "ciphertext": bytes(state).hex(), "trace": trace,
            "roundKeys": [bytes(value).hex() for value in keys]}


def decrypt(ciphertext, key):
    state, keys = block(ciphertext), round_keys(key)
    state = transform(state, "addRoundKey", keys[10])
    for round_number in range(9, -1, -1):
        state = transform(state, "invShiftRows")
        state = transform(state, "invSubBytes")
        state = transform(state, "addRoundKey", keys[round_number])
        if round_number:
            state = transform(state, "invMixColumns")
    return bytes(state).hex()


def self_check():
    vectors = [
        ("000102030405060708090a0b0c0d0e0f", "00112233445566778899aabbccddeeff", "69c4e0d86a7b0430d8cdb78070b4c55a"),
        ("00000000000000000000000000000000", "00000000000000000000000000000000", "66e94bd4ef8a2c3b884cfa59ca342b2e"),
        ("2b7e151628aed2a6abf7158809cf4f3c", "6bc1bee22e409f96e93d7e117393172a", "3ad77bb40d7a3660a89ecaf32466ef97"),
    ]
    for key, plaintext, expected in vectors:
        result = encrypt_trace(plaintext, key)
        if result["ciphertext"] != expected or decrypt(expected, key) != plaintext:
            raise ValueError("AES 标准样例检查失败，不能发布。")
        if len(result["trace"]) != 41 or any(step["operation"] == "mixColumns" for step in result["trace"] if step["round"] == 10):
            raise ValueError("AES 轮次结构检查失败，不能发布。")
    return {"status": "PASS", "engineVersion": ENGINE_VERSION, "vectors": len(vectors),
            "checks": ["标准密文", "解密恢复", "41 个状态", "末轮无列混合"]}
