const fs = require('node:fs');
const path = require('node:path');
const pw = require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.AISECEDU_BASE_URL || 'http://10.92.35.7:8080';
const evidence = process.env.AISECEDU_EVIDENCE_DIR;
(async () => {
  const browser = await pw.chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000}});
    const page = await context.newPage();
    await page.goto(base + '/login', {waitUntil:'domcontentloaded'});
    await page.locator('input[name="name"]').fill(process.env.AISECEDU_TEST_USERNAME);
    await page.locator('input[name="password"]').fill(process.env.AISECEDU_TEST_PASSWORD);
    await page.locator('button[type="submit"], input[type="submit"]').click();
    await page.waitForURL(url => !url.pathname.includes('/login'), {timeout:20000});
    const response = await context.request.get(base + '/pwncollege_api/v1/teaching/artifacts');
    if (response.status() !== 200) throw new Error('Artifact list HTTP ' + response.status());
    const body = await response.json();
    const items = body.data.artifacts;
    console.log(JSON.stringify(items.map(item => ({id:item.id,title:item.title,type:item.type,revision:item.currentRevision,dojoId:item.dojoId,status:item.status})),null,2));
    if (evidence) {
      fs.mkdirSync(evidence,{recursive:true,mode:0o700});
      await context.storageState({path:path.join(evidence,'browser-state.json')});
      fs.chmodSync(path.join(evidence,'browser-state.json'),0o600);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
