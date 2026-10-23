const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
const base=process.env.AISECEDU_BASE_URL||'http://10.92.35.7:8080',dir=process.env.AISECEDU_EVIDENCE_DIR;
const artifactId=process.argv[2],report={artifactId,checks:[],errors:[]};
const hash=value=>crypto.createHash('sha256').update(value||'').digest('hex');
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({storageState:path.join(dir,'browser-state.json'),viewport:{width:1440,height:1000}});
 const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
 const read=async route=>{const r=await context.request.get(base+'/pwncollege_api/v1'+route);const d=await r.json();assert.equal(r.status(),200);assert.equal(d.success,true);return d.data;};
 try{
  const before=process.env.AISECEDU_RESUME_JOB?JSON.parse(fs.readFileSync(path.join(dir,'affected-before.json'),'utf8')):(await read('/teaching/artifacts/'+artifactId)).artifact;
  report.beforeRevision=before.currentRevision;
  fs.writeFileSync(path.join(dir,'affected-before.json'),JSON.stringify(before,null,2),{mode:0o600});
  await page.goto(base+'/teacher/artifacts/'+artifactId,{waitUntil:'domcontentloaded'});
  if(process.env.AISECEDU_RESUME_JOB){report.jobId=process.env.AISECEDU_RESUME_JOB;}else{
  await page.locator('#artifact-inspector-toggle').click();
  await page.locator('#artifact-instruction').fill('落实之前“攻击过程要设计成动画效果”的修改要求：将各页中心区域改成真正运行的 Three.js 三维概念动画，不能只修改说明文字、PPT 页面或点击后的日志。结合本页学习目标，用工程站、隔离边界、控制器、机械模型、独立监测之间的图形关系展示历史事件的概念因果；机械模型确实旋转，光点沿关系线移动，各阶段状态可见变化。提供可工作的播放、暂停、单步、可回拖时间轴、重置，重置后与初态完全一致。保留知识主题和中文讲解；所有数值只作无量纲教学示意，不提供真实设备参数、命令、攻击载荷或网络连接。使用平台内置 Three.js，并兼容 2D 降级。');
  const submission=page.waitForResponse(response=>response.url().endsWith('/artifacts/'+artifactId+'/revise')&&response.request().method()==='POST');
  await page.locator('#artifact-revise').click();
  const response=await submission,submitted=await response.json();assert.ok([200,202].includes(response.status()),JSON.stringify(submitted));assert.equal(submitted.success,true);
  report.jobId=submitted.data.job.id;console.log('Revision submitted',report.jobId);
  }
  let status='';
  for(let i=0;i<360;i++){
   const job=(await read('/teaching/jobs/'+report.jobId)).job;
   const next=job.status+':'+job.progress;if(next!==status){console.log(next);status=next;}
   if(job.status==='SUCCEEDED')break;
   if(['FAILED','CANCELED'].includes(job.status))throw Error(job.failureMessage||job.status);
   if(i===359)throw Error('Revision did not finish within 12 minutes');
   await page.waitForTimeout(2000);
  }
  const after=(await read('/teaching/artifacts/'+artifactId)).artifact;
  assert.equal(after.currentRevision,before.currentRevision+1);
  const oldPages=before.revision.content.lesson.artifacts,newPages=after.revision.content.lesson.artifacts;
  assert.equal(newPages.length,oldPages.length);
  report.pages=newPages.map((item,index)=>({id:item.id,changed:hash(item.content.html)!==hash(oldPages[index].content.html),mode:item.content.renderingMode}));
  assert.ok(report.pages.every(item=>item.changed&&item.mode==='animated-html'));
  report.afterRevision=after.currentRevision;report.checks.push('Every page now contains changed executable animation HTML; prior revision retained');
  fs.writeFileSync(path.join(dir,'affected-after.json'),JSON.stringify(after,null,2),{mode:0o600});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#teaching-artifact[data-preview-state="ready"]').waitFor({timeout:90000});
  let frame;for(let i=0;i<40;i++){for(const candidate of page.frames()){if(await candidate.locator('#animation-play').count()){frame=candidate;break;}}if(frame)break;await page.waitForTimeout(1000);}
  assert.ok(frame,'Animation not rendered');
  const progress=frame.locator('#animation-progress');
  await frame.locator('#animation-reset').click();const start=Number(await progress.inputValue());
  await frame.locator('#animation-play').click();await page.waitForTimeout(800);await frame.locator('#animation-pause').click();
  const advanced=Number(await progress.inputValue());assert.ok(advanced>start);await page.waitForTimeout(300);assert.equal(Number(await progress.inputValue()),advanced);
  await frame.locator('#animation-step').click();assert.ok(Number(await progress.inputValue())>advanced);
  await frame.locator('#animation-reset').click();assert.equal(Number(await progress.inputValue()),start);
  report.checks.push('Revised scene plays, pauses, steps and resets in real browser');
  await page.screenshot({path:path.join(dir,'affected-revised-animation.png'),timeout:15000});
  assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(error){report.failure=error.message;console.error(error.message);await page.screenshot({path:path.join(dir,'revision-failure.png'),timeout:10000}).catch(()=>{});process.exitCode=1;}
 finally{fs.writeFileSync(path.join(dir,'revision-browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}
})();
