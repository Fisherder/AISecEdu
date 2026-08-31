import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const SAMPLE_SHA256 = '2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881';

test('canonical ransomware lab exposes every required IOC and reaches its flag', async ({
  page,
}) => {
  const html = readFileSync(
    resolve(process.cwd(), 'lib/security/templates/ransomware-simulation-lab.html'),
    'utf8',
  );
  await page.setContent(html, { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#salaryHashEvidence')).toContainText(SAMPLE_SHA256);
  // The lab intentionally uses continuous warning animations and smooth
  // scrolling. Dispatch real DOM click events so Playwright does not wait for
  // an animated element to become geometrically stable forever.
  await page.locator('[data-file-id="salary"]').dispatchEvent('click');
  await expect(page.locator('#ransomOverlay')).toHaveClass(/active/, { timeout: 8_000 });

  await page.locator('#iocFilename').fill('salary.exe');
  await page.locator('#iocHash').fill(SAMPLE_SHA256);
  await page.locator('#iocBtc').fill('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
  await page.locator('#iocExtension').fill('.locked');
  await page.locator('#iocType').fill('ransomware');
  await page.locator('#btnValidateIOC').dispatchEvent('click');
  await expect(page.locator('#iocScore')).toContainText('全部 IOC 正确提取');

  for (const defense of ['backup', 'email', 'edr', 'training', 'leastpriv', 'segment']) {
    await page.locator(`[data-defense="${defense}"]`).dispatchEvent('click');
  }
  await page.locator('#btnCheckDefense').dispatchEvent('click');
  await expect(page.locator('#defenseFeedback')).toContainText('优秀');

  await page
    .locator('#reportText')
    .fill(
      '攻击者通过钓鱼邮件投递可执行文件，勒索软件使用 AES 加密数据；应使用离线备份和端点防御恢复。',
    );
  await page.locator('#btnSubmitReport').dispatchEvent('click');
  await expect(page.locator('#reportFeedback')).toContainText('提交成功');
  await expect(page.locator('#flagReveal')).toHaveClass(/visible/);
  await expect(page.locator('#flagReveal')).toContainText('FLAG{r4ns0mw4r3');
});
