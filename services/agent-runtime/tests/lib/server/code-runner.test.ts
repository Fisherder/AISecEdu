import { describe, expect, it } from 'vitest';
import {
  buildDockerArgs,
  buildPythonHarness,
  CodeRunnerError,
  runPythonInContainer,
  validatePythonCodeRunRequest,
  type PythonCodeRunRequest,
} from '@/lib/server/code-runner';

const RSA_SOLUTION = `from Crypto.PublicKey import RSA
from Crypto.Cipher import PKCS1_OAEP
from Crypto.Signature import pss
from Crypto.Hash import SHA256

MESSAGE = b"玄甲 OAEP"

def rsa_encrypt_decrypt():
    key = RSA.generate(2048)
    ciphertext = PKCS1_OAEP.new(key.publickey(), hashAlgo=SHA256).encrypt(MESSAGE)
    return PKCS1_OAEP.new(key, hashAlgo=SHA256).decrypt(ciphertext)

def rsa_sign_verify():
    key = RSA.generate(2048)
    signature = pss.new(key).sign(SHA256.new(MESSAGE))
    pss.new(key.publickey()).verify(SHA256.new(MESSAGE), signature)
    try:
        pss.new(key.publickey()).verify(SHA256.new(b"tampered"), signature)
        return False
    except (ValueError, TypeError):
        return True

def rsa_tamper_detect():
    key = RSA.generate(2048)
    ciphertext = bytearray(PKCS1_OAEP.new(key.publickey(), hashAlgo=SHA256).encrypt(MESSAGE))
    ciphertext[-1] ^= 1
    try:
        PKCS1_OAEP.new(key, hashAlgo=SHA256).decrypt(bytes(ciphertext))
        return False
    except ValueError:
        return True

def container_isolation_active():
    import os
    import socket
    if os.geteuid() == 0:
        return False
    sock = socket.socket()
    sock.settimeout(0.2)
    try:
        sock.connect(("1.1.1.1", 80))
        return False
    except OSError:
        return True
    finally:
        sock.close()
`;

const RSA_REQUEST: PythonCodeRunRequest = {
  language: 'python',
  code: RSA_SOLUTION,
  testCases: [
    {
      input: 'rsa_encrypt_decrypt()',
      expected: "b'玄甲 OAEP'",
      description: 'OAEP 往返返回原始明文',
    },
    {
      input: 'rsa_sign_verify()',
      expected: 'True',
      description: 'PSS 验签并拒绝篡改消息',
    },
    {
      input: 'rsa_tamper_detect()',
      expected: 'True',
      description: 'OAEP 拒绝被篡改的密文',
    },
    {
      input: 'container_isolation_active()',
      expected: 'True',
      description: '运行器为非 root 且无网络',
    },
  ],
};

describe('Python container code runner', () => {
  it('validates size, language and executable test expressions', () => {
    expect(validatePythonCodeRunRequest(RSA_REQUEST)).toEqual(RSA_REQUEST);
    expect(() =>
      validatePythonCodeRunRequest({ language: 'python', code: 'pass', testCases: [] }),
    ).toThrow(CodeRunnerError);
    expect(() =>
      validatePythonCodeRunRequest({
        language: 'java',
        code: 'class Main {}',
        testCases: [{ input: 'main()', expected: 'ok' }],
      }),
    ).toThrow('目前仅支持 Python');
  });

  it('uses a no-network, read-only, non-root, resource-limited Docker profile', () => {
    const args = buildDockerArgs('aisecedu-code-test', 'aisecedu/code-runner:test');
    expect(args).toEqual(
      expect.arrayContaining([
        '--network',
        'none',
        '--interactive',
        '--read-only',
        '--cap-drop',
        'ALL',
        '--user',
        '65534:65534',
        '--pids-limit',
        '64',
        '--memory',
        '256m',
      ]),
    );
    expect(args).not.toContain('-v');
    expect(args).not.toContain('--volume');
  });

  it('encodes untrusted source instead of interpolating it into the harness', () => {
    const malicious = `'''\nraise RuntimeError("escaped")\n'''`;
    const harness = buildPythonHarness({
      language: 'python',
      code: malicious,
      testCases: [{ input: '1 + 1', expected: '2' }],
    });
    expect(harness).not.toContain(malicious);
    expect(harness).toContain('__AISECEDU_AGENT_CODE_RESULT__');
  });

  const dockerIt =
    (process.env.GLOBAL_AGENT_TEST_DOCKER_RUNNER ||
      process.env.OPENMAIC_TEST_DOCKER_RUNNER) === '1'
      ? it
      : it.skip;
  dockerIt(
    'executes the RSA exercise and verifies container isolation for real',
    async () => {
      const result = await runPythonInContainer(RSA_REQUEST, { timeoutMs: 20_000 });
      expect(result.status).toBe('passed');
      expect(result.passed).toBe(true);
      expect(result.tests).toHaveLength(4);
      expect(result.tests.every((test) => test.passed)).toBe(true);
      expect(result.runtime).toBe('python-container');
    },
    30_000,
  );
});
