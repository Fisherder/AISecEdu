const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
const base=process.env.AISECEDU_BASE_URL||'http://10.92.35.7:8080',evidence=process.env.AISECEDU_EVIDENCE_DIR;
const id=process.argv[2],dir=path.join(evidence,id);fs.mkdirSync(dir,{recursive:true,mode:0o700});
const report={artifactId:id,checks:[],errors:[]};
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({storageState:path.join(evidence,'browser-state.json'),viewport:{width:1440,height:1000}});
 const force2d=Boolean(process.env.AISECEDU_FORCE_2D);
 const captureDir=force2d?path.join(dir,'fallback-2d'):dir;fs.mkdirSync(captureDir,{recursive:true});
 await context.addInitScript(force=>{
  window.__aiseceduObservedContexts=new WeakMap();const original=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(...args){if(force&&String(args[0]).includes('webgl'))return null;if(force&&args[0]==='2d')args[1]={...args[1],willReadFrequently:true};const result=original.apply(this,args);if(result)window.__aiseceduObservedContexts.set(this,result);return result;};
 },force2d);
 const page=await context.newPage();
 const read=async route=>{const response=await context.request.get(base+'/pwncollege_api/v1'+route);const result=await response.json();assert.equal(response.status(),200);assert.equal(result.success,true);return result.data;};
 try{
  const before=process.env.AISECEDU_RESUME_JOB?JSON.parse(fs.readFileSync(path.join(dir,'before.json'),'utf8')):(await read('/teaching/artifacts/'+id)).artifact;
  if(process.env.AISECEDU_VERIFY_ONLY)before.currentRevision-=1;
  report.beforeRevision=before.currentRevision;fs.writeFileSync(path.join(dir,'before.json'),JSON.stringify(before,null,2));
  await page.goto(base+'/teacher/artifacts/'+id,{waitUntil:'domcontentloaded'});
  if(process.env.AISECEDU_VERIFY_ONLY){report.verificationOnly=true;}else if(process.env.AISECEDU_RESUME_JOB){report.jobId=process.env.AISECEDU_RESUME_JOB;}else{
   await page.locator('#artifact-inspector-toggle').click();
   await page.locator('#artifact-instruction').fill('保持现有全部知识主题与阶段，把各阶段合并为单页、同一个连续画布上的 Three.js 三维概念动画。不是 PPT 翻页，不是日志按钮。保留实体关系与简短中文讲解，用真正旋转的机械模型和沿连线移动的光点表现阶段变化。全部数值仅作无量纲教学示意，不提供设备参数、命令、载荷或真实连接。播放让画布真实变化；暂停冻结画布和时间；单步、可拖动时间轴、重置全部生效；重置恢复完全相同的初态。确保窗口尺寸变化可用，修复包括 onResize 在内的未定义函数和变量，先初始化全部状态再启动动画。使用平台内置 Three.js，兼容可操作的 2D 降级；至少四个连续阶段。' + (process.env.AISECEDU_EXTRA_INSTRUCTION || ''));
   const pending=page.waitForResponse(r=>r.url().endsWith('/artifacts/'+id+'/revise')&&r.request().method()==='POST');
   await page.locator('#artifact-revise').click();const response=await pending,result=await response.json();assert.ok([200,202].includes(response.status()),JSON.stringify(result));assert.equal(result.success,true);
   report.jobId=result.data.job.id;fs.writeFileSync(path.join(dir,'job.json'),JSON.stringify(report));console.log('Submitted',id,report.jobId);
  }
  let last='';
  for(let attempt=0;report.jobId&&attempt<360;attempt++){
   const job=(await read('/teaching/jobs/'+report.jobId)).job;
   const status=job.status+':'+job.progress;if(status!==last){console.log(status);last=status;}
   if(job.status==='SUCCEEDED')break;
   if(['FAILED','CANCELED'].includes(job.status))throw Error(job.failureMessage||job.status);
   assert.ok(attempt<359,'Generation timed out');await page.waitForTimeout(2000);
  }
  const after=(await read('/teaching/artifacts/'+id)).artifact;
  fs.writeFileSync(path.join(dir,'after.json'),JSON.stringify(after,null,2));
  assert.equal(after.currentRevision,before.currentRevision+1);
  assert.equal(after.revision.content.lesson.artifacts.length,1);
  assert.equal(after.revision.content.lesson.artifacts[0].content.renderingMode,'animated-html');
  await read('/teaching/artifacts/'+id+'/revisions/'+before.currentRevision);
  report.afterRevision=after.currentRevision;report.checks.push('One continuous animated scene; previous revision retained');
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&/THREE\.|Shader Error|WebGL.*INVALID|not defined|Uncaught/.test(message.text())){if(force2d&&message.text()==='THREE.WebGLRenderer: Error creating WebGL context.')(report.expectedFallbackErrors ||= []).push(message.text());else report.errors.push(message.text().slice(0,1800));}});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#teaching-artifact[data-preview-state="ready"]').waitFor({timeout:90000});
  let frame;for(let i=0;i<30;i++){for(const candidate of page.frames()){if(await candidate.locator('#animation-play').count()){frame=candidate;break;}}if(frame)break;await page.waitForTimeout(1000);}
  assert.ok(frame,'Animated preview not found');
  const progress=frame.locator('#animation-progress');let canvas;
  for(const candidate of await frame.locator('canvas:visible,svg:visible').all()){const box=await candidate.boundingBox();if(box&&box.width>120&&box.height>120){canvas=candidate;break;}}
  assert.ok(canvas,'Visible animation canvas or SVG not found');
  const screenshotMode=Boolean(process.env.AISECEDU_COMPOSITOR_PIXELS)||await canvas.evaluate(element=>element.tagName.toLowerCase()==='svg'),screenshots=new Map();
  const pixels=async()=>screenshotMode?(async()=>{
   const sharp=require('../services/agent-runtime/node_modules/sharp'),crypto=require('node:crypto');
   const {data,info}=await sharp(await canvas.screenshot({timeout:15000})).removeAlpha().raw().toBuffer({resolveWithObject:true});
   const hash=crypto.createHash('sha256').update(data).digest('hex');screenshots.set(hash,data);
   return JSON.stringify({width:info.width,height:info.height,hash,nonzero:data.reduce((sum,value)=>sum+(value>0),0)});
  })():JSON.stringify(await canvas.evaluate(element=>new Promise(resolve=>requestAnimationFrame(()=>{
   const recorded=window.__aiseceduObservedContexts.get(element),gl=recorded&&typeof recorded.readPixels==='function'?recorded:null;let data,width=element.width,height=element.height;
   if(gl){width=gl.drawingBufferWidth;height=gl.drawingBufferHeight;data=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,data);}
   else data=element.getContext('2d').getImageData(0,0,width,height).data;
   let hash=2166136261,nonzero=0;for(const value of data){hash=Math.imul(hash^value,16777619);if(value)nonzero++;}
   resolve({width,height,hash:hash>>>0,nonzero});
  }))));
  const samePixels=(left,right)=>{
   if(left===right)return true;if(!screenshotMode)return false;
   const a=JSON.parse(left),b=JSON.parse(right);if(a.width!==b.width||a.height!==b.height)return false;
   const x=screenshots.get(a.hash),y=screenshots.get(b.hash);let changed=0,total=0;
   for(let i=0;i<x.length;i+=3){const delta=Math.max(Math.abs(x[i]-y[i]),Math.abs(x[i+1]-y[i+1]),Math.abs(x[i+2]-y[i+2]));if(delta>4)changed++;total+=delta;}
   const fraction=changed/(a.width*a.height),mean=total/(a.width*a.height),equivalent=fraction<=.0001&&mean<=.02;
   (report.rasterComparisons ||= []).push({changedPixels:changed,fraction,mean,equivalent});return equivalent;
  };
  await frame.locator('#animation-reset').click();await page.waitForTimeout(400);const initial=Number(await progress.inputValue());
  await canvas.screenshot({path:path.join(captureDir,'initial.png'),timeout:15000});const initialPixels=await pixels();assert.ok(JSON.parse(initialPixels).nonzero>100,'Canvas pixel read was empty');
  await frame.locator('#animation-play').click();await page.waitForTimeout(1000);await frame.locator('#animation-pause').click();await page.waitForTimeout(400);
  const played=Number(await progress.inputValue());assert.ok(played>initial,'Play does not advance time');
  const movingPixels=await pixels();assert.ok(!samePixels(initialPixels,movingPixels),'Play does not change actual canvas pixels');
  await canvas.screenshot({path:path.join(captureDir,'playing-paused.png'),timeout:15000});
  await page.waitForTimeout(400);assert.equal(Number(await progress.inputValue()),played,'Pause does not freeze time');
  const pausedPixels=await pixels();await canvas.screenshot({path:path.join(captureDir,'still-paused.png'),timeout:15000});assert.ok(samePixels(movingPixels,pausedPixels),'Pause does not freeze the actual canvas');
  await frame.locator('#animation-step').click();await page.waitForTimeout(120);assert.ok(Number(await progress.inputValue())>played,'Step does not advance');
  await progress.scrollIntoViewIfNeeded();const box=await progress.boundingBox();await progress.click({position:{x:box.width*.72,y:box.height/2}});await page.waitForTimeout(120);
  const seeked=Number(await progress.inputValue()),limit=await progress.evaluate(element=>({min:Number(element.min||0),max:Number(element.max||100)}));
  assert.ok(seeked>=limit.min+(limit.max-limit.min)*.60&&seeked<=limit.min+(limit.max-limit.min)*.85,'Timeline mouse seek does not reach the requested region');
  for(const fraction of [.28,.52,.80]){
   await progress.scrollIntoViewIfNeeded();const box=await progress.boundingBox();await progress.click({position:{x:box.width*fraction,y:box.height/2}});if(await frame.locator('#animation-pause').isEnabled())await frame.locator('#animation-pause').click();await page.waitForTimeout(400);
   const snapshot=await pixels();await page.waitForTimeout(400);assert.ok(samePixels(snapshot,await pixels()),'A later stage continues moving while paused');
  }
  await frame.locator('#animation-reset').click();await page.waitForTimeout(400);assert.equal(Number(await progress.inputValue()),initial,'Reset does not restore time');
  const resetPixels=await pixels();await canvas.screenshot({path:path.join(captureDir,'reset.png'),timeout:15000});assert.ok(samePixels(initialPixels,resetPixels),'Reset does not restore the initial canvas');
  report.pixelBuffers={initial:JSON.parse(initialPixels),playing:JSON.parse(movingPixels),paused:JSON.parse(pausedPixels),reset:JSON.parse(resetPixels)};
  report.animation={initial,played,seeked,webgl:await frame.locator('canvas:visible').evaluateAll(elements=>elements.some(element=>typeof window.__aiseceduObservedContexts.get(element)?.readPixels==='function'))};
  assert.equal(report.animation.webgl,!force2d,'Expected the requested WebGL or 2D fallback renderer');
  report.checks.push('Actual '+(force2d?'2D fallback':'WebGL')+' pixels move, pause freezes all four stages, reset restores the initial picture, step and mouse seek work');
  report.pixelComparison=screenshotMode?'Composited pixels; <=0.01% raster-edge tolerance and mean pixel delta <=0.02':'Exact native drawing-buffer comparison';
  await page.screenshot({path:path.join(captureDir,'desktop.png'),timeout:15000});
  for(const width of [375,320,1440]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(300);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  report.checks.push('Page fits 320/375/1440px viewports');
  if(after.dojoId===null){
   if(!await page.locator('#artifact-instruction').isVisible()) await page.locator('#artifact-inspector-toggle').click();
   await page.locator('#artifact-instruction').waitFor({state:'visible',timeout:5000});
   await page.goto(base+'/teacher/projects');await page.locator('[data-bind="'+id+'"]').waitFor();await page.screenshot({path:path.join(captureDir,'collection.png'),timeout:15000});
   report.checks.push('Independent project is previewable, refinable and persisted in private project collection');
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(error){report.failure=error.message;console.error(error.message);await page.screenshot({path:path.join(dir,'failure.png'),timeout:10000}).catch(()=>{});process.exitCode=1;}
 finally{fs.writeFileSync(path.join(dir,force2d?'browser-2d.json':'browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}
})();
