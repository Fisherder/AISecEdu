const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({storageState:'cache/acceptance/browser-state.json',viewport:{width:1440,height:1000}});
 const page=await context.newPage(),report={checks:[],errors:[]};page.on('pageerror',error=>report.errors.push(error.message));
 try{
  await page.goto('http://10.92.35.7:8080/teacher/projects');
  await page.locator('[data-bind="artifact_594e01b1d34745f9afe267a14fa5b8cf"]').waitFor();
  const count=await page.locator('.project-card').count();assert.ok(count>=2);
  const title=await page.locator('.project-card').filter({has:page.locator('[data-bind="artifact_594e01b1d34745f9afe267a14fa5b8cf"]')}).locator('h2').innerText();
  await page.locator('#project-search').fill(title);assert.equal(await page.locator('.project-card').count(),1);
  await page.locator('#project-search').fill('a-nonexistent-verification-title');assert.equal(await page.locator('.project-card').count(),0);
  await page.locator('#project-search').fill('');await page.locator('#project-type').selectOption('slide-deck');
  assert.equal(await page.locator('.project-card').filter({hasText:title}).count(),0);
  await page.locator('#project-type').selectOption('');assert.equal(await page.locator('.project-card').count(),count);
  await page.locator('[data-bind="artifact_594e01b1d34745f9afe267a14fa5b8cf"]').click();
  await page.locator('#project-course-dialog').waitFor({state:'visible'});
  await page.locator('#project-course').selectOption('813426961');
  assert.ok(await page.locator('#project-module option').count()>1);
  await page.locator('#project-module').selectOption('0');
  await page.locator('#project-course-cancel').click();assert.equal(await page.locator('#project-course-dialog').isVisible(),false);
  await page.locator('#project-refresh').click();await page.waitForTimeout(800);assert.equal(await page.locator('.project-card').count(),count);
  await page.screenshot({path:'cache/acceptance/collection-final.png',fullPage:true});
  report.checks=['Private projects listed','Title search and zero-results state','Type filtering','Optional course/module dialog populated; canceled without mutation','Refresh retains independent projects'];
  assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(error){report.failure=error.message;process.exitCode=1;}
 finally{fs.writeFileSync('cache/acceptance/collection-final.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}
})();
