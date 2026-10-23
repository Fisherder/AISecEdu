const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const pw=require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.AISECEDU_BASE_URL || 'http://10.92.35.7:8080';
const dir=process.env.AISECEDU_EVIDENCE_DIR;
const report={checks:[],errors:[],jobs:[]};
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
(async()=>{
 const browser=await pw.chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({storageState:path.join(dir,'browser-state.json'),viewport:{width:1440,height:1000}});
 const page=await context.newPage();
 const read=async route=>{const r=await context.request.get(base+'/pwncollege_api/v1'+route);if(r.status()!==200)throw Error(route+' HTTP '+r.status());const data=await r.json();assert.equal(data.success,true);return data.data;};
 page.on('pageerror',error=>report.errors.push(error.message));
 page.on('response',async response=>{if(!response.url().includes('/teaching/threads/')||response.request().method()!=='POST')return;try{const body=await response.json();if(body.data?.thread){report.threadId=body.data.thread.id;report.dojoId=body.data.thread.dojoId;}if(body.data?.job){report.jobs.push(body.data.job.id);console.log('Job',body.data.job.kind,body.data.job.status);}}catch{}});
 try{
  const before=new Set((await read('/teaching/artifacts?scope=projects')).artifacts.map(item=>item.id));
  if(process.env.AISECEDU_RESUME_THREAD){
   const thread=(await read('/teaching/threads/'+process.env.AISECEDU_RESUME_THREAD)).thread;
   report.threadId=thread.id;report.dojoId=thread.dojoId;
   await page.goto(base+'/teacher?view=conversation&thread='+thread.id,{waitUntil:'domcontentloaded'});
  }else{
  await page.goto(base+'/teacher/projects',{waitUntil:'domcontentloaded'});
  await page.locator('#project-list').waitFor({state:'attached'});
  await page.getByRole('link',{name:'＋ 新建项目'}).click();
  await page.locator('#teacher-agent[data-ready="true"]').waitFor();
  assert.equal(await page.locator('#teaching-dojo').inputValue(),'');
  await page.locator('#teaching-input').fill('只生成一个单页 Three.js 动画项目：工业控制反馈偏差的三维概念演示。四个连续阶段是正常控制、反馈偏差出现、独立测量发现不一致、恢复一致。画布有真正旋转的机械模型和沿工程站、控制器、物理过程、监测反馈移动的光点，所有数值为无量纲教学示意；播放、暂停、单步、进度拖动和重置均可操作。不要 PPT，不要创建题目，不涉及设备命令或真实连接。无需指定课程。');
  await page.locator('#teaching-send').click();console.log('Submitted independent project request');
  }
  await page.locator('[data-generation-option-picker-message]').waitFor({timeout:180000});
  assert.equal(report.dojoId,null);
  assert.equal(await page.locator('[data-generation-option-view-id]').count(),3);
  report.checks.push('No-course request offers three choices');
  console.log('Three no-course choices displayed');
  await page.screenshot({path:path.join(dir,'project-three-options.png'),timeout:15000,animations:'disabled'});
  const selectionResponse=page.waitForResponse(response=>response.url().includes('/generation-options/')&&response.request().method()==='POST');
  await page.locator('[data-generation-option-panel]:not([hidden]) [data-generation-option-id]').click();
  const selection=await selectionResponse;
  const selectionData=await selection.json();
  assert.equal(selection.status(),200,JSON.stringify(selectionData));
  assert.equal(selectionData.success,true,JSON.stringify(selectionData));
  console.log('Selected independent project option');
  let artifact=null,previous='';
  for(let i=0;i<240;i++){
   const projects=(await read('/teaching/artifacts?scope=projects')).artifacts;
   artifact=projects.find(item=>!before.has(item.id));
   if(artifact){const status=artifact.status+':'+artifact.currentRevision;if(status!==previous){console.log('Artifact',artifact.id,status);previous=status;}if(['DRAFT','READY'].includes(artifact.status))break;if(['FAILED','CANCELED','VALIDATION_FAILED'].includes(artifact.status))throw Error('Generation failed: '+status);}
   await page.waitForTimeout(2000);
  }
  assert.ok(artifact&&['DRAFT','READY'].includes(artifact.status),'Generated project did not become ready');
  assert.equal(artifact.dojoId,null); report.artifactId=artifact.id;
  const detail=(await read('/teaching/artifacts/'+artifact.id)).artifact;
  assert.equal(detail.revision.content.lesson.artifacts.length,1,'Single-page request was split into slides');
  assert.equal(detail.revision.content.lesson.artifacts[0].content.renderingMode,'animated-html');
  fs.writeFileSync(path.join(dir,'generated-project.json'),JSON.stringify(detail,null,2),{mode:0o600});
  report.checks.push('Generated project persists with no course');
  await page.goto(base+'/teacher/artifacts/'+artifact.id,{waitUntil:'domcontentloaded'});
  await page.locator('#teaching-artifact[data-preview-state="ready"]').waitFor({timeout:90000});
  let frame;
  for(let i=0;i<40;i++){for(const candidate of page.frames()){if(await candidate.locator('#animation-play').count()){frame=candidate;break;}}if(frame)break;await page.waitForTimeout(1000);}
  assert.ok(frame,'Animated scene not found in preview');
  const timeline=frame.locator('#animation-progress');
  await frame.locator('#animation-reset').click();
  const initial=Number(await timeline.inputValue());
  await frame.locator('#animation-play').click();await page.waitForTimeout(1000);
  await frame.locator('#animation-pause').click();await page.waitForTimeout(100);
  const played=Number(await timeline.inputValue());assert.ok(played>initial,'Playback did not advance');
  await page.waitForTimeout(400);assert.equal(Number(await timeline.inputValue()),played,'Pause did not freeze time');
  await frame.locator('#animation-step').click();assert.ok(Number(await timeline.inputValue())>played,'Step did not advance');
  await timeline.evaluate(element=>{element.value=String(Number(element.max)*0.7);element.dispatchEvent(new Event('input',{bubbles:true}));});
  const seeked=Number(await timeline.inputValue());assert.ok(seeked>played,'Seek did not work');
  await frame.locator('#animation-reset').click();assert.equal(Number(await timeline.inputValue()),initial,'Reset did not restore initial time');
  report.checks.push('Play, pause, step, seek and reset operate in the rendered iframe');
  report.animation={initial,played,seeked};
  await page.screenshot({path:path.join(dir,'generated-animation.png'),timeout:15000});
  if(!await page.locator('#artifact-instruction').isVisible()) await page.locator('#artifact-inspector-toggle').click();
  await page.locator('#artifact-instruction').waitFor({state:'visible',timeout:5000});
  report.checks.push('Independent project has teacher refinement controls');
  await page.goto(base+'/teacher/projects');await page.locator('[data-bind="'+artifact.id+'"]').waitFor();
  for(const width of [1440,375,320]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(dir,'project-collection.png'),timeout:15000});
  report.checks.push('Project remains in collection after reload; 320/375/1440px layout fits');
  assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(error){report.failure=error.message;console.log('Failure',error.message);await page.screenshot({path:path.join(dir,'project-failure.png'),timeout:10000}).catch(()=>{});throw error;}
 finally{fs.writeFileSync(path.join(dir,'project-browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
