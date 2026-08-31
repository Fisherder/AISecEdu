import { expect, test, type Frame, type Page } from '@playwright/test';
import { renderCodeHtml, type CodeConfig } from '../../lib/generation/widget-workflow';

const STARTER_CODE = `# EDUCATIONAL PURPOSE ONLY — authorized classroom use
from Crypto.PublicKey import RSA
from Crypto.Cipher import PKCS1_OAEP
from Crypto.Signature import pss
from Crypto.Hash import SHA256

def rsa_encrypt_decrypt():
    pass

def rsa_sign_verify():
    pass

def rsa_tamper_detect():
    pass
`;

const SOLUTION_CODE = `# EDUCATIONAL PURPOSE ONLY — authorized classroom use
from Crypto.PublicKey import RSA
from Crypto.Cipher import PKCS1_OAEP
from Crypto.Signature import pss
from Crypto.Hash import SHA256

MESSAGE = b"OpenMAIC OAEP"

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
`;

const STORED_LESSON_SOLUTION = `# EDUCATIONAL PURPOSE ONLY — authorized classroom use
from Crypto.PublicKey import RSA
from Crypto.Cipher import PKCS1_OAEP
from Crypto.Signature import pss
from Crypto.Hash import SHA256

def rsa_encrypt_decrypt():
    key = RSA.generate(2048)
    ciphertext = PKCS1_OAEP.new(key.publickey()).encrypt(b"hello")
    plaintext = PKCS1_OAEP.new(key).decrypt(ciphertext)
    return plaintext.decode()

def rsa_sign_verify():
    key = RSA.generate(2048)
    message = b"important message"
    digest = SHA256.new(message)
    signature = pss.new(key).sign(digest)
    try:
        pss.new(key.publickey()).verify(digest, signature)
        valid = True
    except (ValueError, TypeError):
        valid = False
    try:
        pss.new(key.publickey()).verify(SHA256.new(b"important message!"), signature)
        tampered_rejected = False
    except (ValueError, TypeError):
        tampered_rejected = True
    return valid and tampered_rejected

def rsa_tamper_detect():
    key = RSA.generate(2048)
    ciphertext = bytearray(PKCS1_OAEP.new(key.publickey()).encrypt(b"secret"))
    ciphertext[0] ^= 1
    try:
        PKCS1_OAEP.new(key).decrypt(bytes(ciphertext))
    except (ValueError, TypeError):
        return True
    return False
`;

const config: CodeConfig = {
  type: 'code',
  language: 'python',
  description: '使用 OAEP 与 PSS 完成 RSA 加密、签名和篡改检测。',
  starterCode: STARTER_CODE,
  testCases: [
    { input: 'rsa_encrypt_decrypt()', expected: "b'OpenMAIC OAEP'", description: 'OAEP 往返' },
    { input: 'rsa_sign_verify()', expected: 'True', description: 'PSS 篡改检测' },
    { input: 'rsa_tamper_detect()', expected: 'True', description: 'OAEP 密文篡改检测' },
  ],
  hints: ['OAEP 加密器分别使用公钥与私钥创建。', 'PSS 验签失败会抛出 ValueError。'],
  solution: SOLUTION_CODE,
};

async function loginTeacher(page: Page): Promise<void> {
  const login = await page.request.post('/api/auth/login', {
    data: { username: 'xuanjia_teacher', password: 'XuanjiaTeacher#2026' },
  });
  expect(login.ok()).toBeTruthy();
  const sessionValue = login.headers()['set-cookie']?.match(/openmaic_session=([^;]+)/)?.[1];
  expect(sessionValue).toBeTruthy();
  await page.context().addCookies([
    {
      name: 'openmaic_session',
      value: sessionValue!,
      url: new URL(login.url()).origin,
      httpOnly: true,
      sameSite: 'Lax',
      secure: false,
    },
  ]);
}

async function findCodeFrame(page: Page): Promise<Frame> {
  await expect
    .poll(
      async () => {
        for (const frame of page.frames()) {
          if (
            await frame
              .locator('#run-btn')
              .count()
              .catch(() => 0)
          )
            return true;
        }
        return false;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  for (const frame of page.frames()) {
    if (
      frame !== page.mainFrame() &&
      (await frame
        .locator('#run-btn')
        .count()
        .catch(() => 0))
    ) {
      return frame;
    }
  }
  throw new Error('Python code widget iframe not found');
}

async function runStoredRsaSolution(frame: Frame): Promise<void> {
  await frame.evaluate((solution) => {
    const editor = document.getElementById('code') as HTMLTextAreaElement | null;
    if (!editor || typeof (window as typeof window & { run?: () => void }).run !== 'function') {
      throw new Error('Python code widget is not ready');
    }
    editor.value = solution;
    (window as typeof window & { run: () => void }).run();
  }, STORED_LESSON_SOLUTION);
}

test('student Python is executed in a real container and RSA tests distinguish pass from fail', async ({
  page,
}) => {
  await loginTeacher(page);

  // Use a same-origin document without a React hydration process that could
  // replace the fixture immediately after setContent.
  await page.goto('/api/auth/me');
  await page.setContent(renderCodeHtml(config), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#run-btn')).toContainText('Python 隔离容器');

  await page.locator('#run-btn').dispatchEvent('click');
  await expect(page.locator('#output')).toContainText('通过 0/3 个测试', { timeout: 25_000 });

  await page.locator('#code').fill(SOLUTION_CODE);
  await page.locator('#run-btn').dispatchEvent('click');
  await expect(page.locator('#output')).toContainText('全部测试通过（3/3）', { timeout: 25_000 });
  await expect(page.locator('#output')).toContainText('Python 隔离容器');
  await expect(page.locator('#output')).toContainText('OAEP 往返');
  await expect(page.locator('#output')).toContainText('PSS 篡改检测');
});

test('the existing teacher prep preview runs its migrated RSA exercise', async ({ page }) => {
  test.setTimeout(75_000);
  await page.context().clearCookies();
  await page.goto('/teacher/login');
  await page.getByPlaceholder('用户名').fill('xuanjia_teacher');
  await page.getByPlaceholder('密码').fill('XuanjiaTeacher#2026');
  await page.getByRole('button', { name: '登录', exact: true }).last().dispatchEvent('click');
  await page.waitForURL('**/teacher', { timeout: 15_000 });
  const lessonResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/api/lessons/RLL0hFb62O'),
    { timeout: 20_000 },
  );
  await page.goto('/teacher/prep/RLL0hFb62O');
  const lessonResponse = await lessonResponsePromise;
  const lessonResponseText = await lessonResponse.text();
  expect(
    lessonResponse.ok(),
    `${lessonResponse.status()} ${lessonResponseText.slice(0, 1000)}`,
  ).toBeTruthy();
  await expect(page.locator('input').first()).toHaveValue('公钥密码学核心原理与应用实践', {
    timeout: 20_000,
  });
  const codeArtifact = page.locator('[data-testid="artifact-card"][data-artifact-type="code"]');
  await expect(codeArtifact).toHaveCount(1);
  await codeArtifact.getByRole('button', { name: '预览', exact: true }).dispatchEvent('click');
  const codeFrame = await findCodeFrame(page);
  await expect(codeFrame.locator('#run-btn')).toContainText('Python 隔离容器');
  await runStoredRsaSolution(codeFrame);
  await expect(codeFrame.locator('#output')).toContainText('全部测试通过（3/3）', {
    timeout: 25_000,
  });
});

test('the migrated published classroom runs Python through the null-origin iframe bridge', async ({
  page,
}) => {
  await loginTeacher(page);
  await page.goto('/classroom/2IJcj11MGa');
  await expect(page.getByText('Loading classroom...')).toBeHidden({ timeout: 20_000 });
  const codeRunnerRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/code/run')) codeRunnerRequests.push(request.method());
  });
  await page.evaluate(() => {
    const target = window as typeof window & { __codeRunnerTrace?: string[] };
    target.__codeRunnerTrace = [];
    window.addEventListener('message', (event) => {
      const data = event.data as { __openmaicCodeRunner?: boolean; kind?: string } | undefined;
      if (data?.__openmaicCodeRunner === true)
        target.__codeRunnerTrace?.push(data.kind ?? 'unknown');
    });
  });

  const codeScene = page
    .locator('[data-testid="scene-item"]')
    .filter({ hasText: 'Python实现RSA加解密与签名验签' });
  await expect(codeScene).toHaveCount(1);
  await codeScene.dispatchEvent('click');

  const codeFrame = await findCodeFrame(page);
  await runStoredRsaSolution(codeFrame);
  await page.waitForTimeout(1_500);
  const bridgeTrace = await page.evaluate(
    () => (window as typeof window & { __codeRunnerTrace?: string[] }).__codeRunnerTrace ?? [],
  );
  expect(bridgeTrace, JSON.stringify({ bridgeTrace, codeRunnerRequests })).toContain('run-request');
  expect(codeRunnerRequests, JSON.stringify({ bridgeTrace, codeRunnerRequests })).toContain('POST');
  await expect(codeFrame.locator('#output')).toContainText('全部测试通过（3/3）', {
    timeout: 25_000,
  });
  await expect(codeFrame.locator('#output')).toContainText('OAEP 加密后能正确解密');
  await expect(codeFrame.locator('#output')).toContainText('合法签名验签通过');
});
