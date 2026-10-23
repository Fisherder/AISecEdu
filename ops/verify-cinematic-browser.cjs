const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const directory=path.resolve(process.argv[2]||'cache/cinematic-reference');
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1600,height:1000}}),report=[];
 try{
 for(const name of fs.readdirSync(directory).filter(name=>name.endsWith('.html'))){
  const page=await context.newPage(),entry={name,errors:[],requests:[],shots:[]};report.push(entry);
  page.on('pageerror',e=>entry.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')entry.errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))entry.requests.push(r.url());});
  await page.setContent('<style>html,body{margin:0;width:100%;height:100%;background:#060b15}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="allow-scripts" allow="fullscreen" title="scene"></iframe>');
  await page.locator('iframe').evaluate((el,html)=>{el.srcdoc=html;},fs.readFileSync(path.join(directory,name),'utf8'));
  const frame=await page.locator('iframe').elementHandle().then(el=>el.contentFrame());
  await frame.waitForFunction(()=>globalThis.__cinematic,{timeout:30000});
  const read=()=>frame.evaluate(()=>globalThis.__cinematic.getState());entry.initial=await read();
  assert.equal(entry.initial.renderer,'webgl');assert.ok(entry.initial.meshes>20,'Detailed models missing');
  const chapters=await frame.evaluate(()=>globalThis.__cinematic.scene.chapters.map(item=>item.at));
  for(const [index,at]of chapters.entries()){
   await frame.evaluate(time=>globalThis.__cinematic.seek(time),at);await page.waitForTimeout(100);
   const image=await page.screenshot({path:path.join(directory,name.replace('.html','-shot-'+index+'.png')),timeout:20000});
   entry.shots.push({at,state:await read(),sha256:crypto.createHash('sha256').update(image).digest('hex')});
  }
  assert.ok(new Set(entry.shots.map(item=>JSON.stringify(item.state.camera))).size>=3,'Camera did not change');
  await frame.locator('#animation-reset').click();await frame.locator('#animation-play').click();await page.waitForTimeout(1100);await frame.locator('#animation-pause').click();
  const paused=await read();assert.ok(paused.time>0);await page.waitForTimeout(300);assert.equal((await read()).time,paused.time);
  await frame.locator('#animation-step').click();assert.ok((await read()).time>paused.time);
  await frame.locator('#explode-mode').click();assert.equal((await read()).exploded,true);
  await frame.locator('#zoom-in').click();assert.equal((await read()).explore,true);assert.ok((await read()).zoom<1);
  await frame.locator('#animation-reset').click();assert.equal((await read()).time,0);assert.equal((await read()).exploded,false);
  await frame.locator('#animation-play').click();
  const frameStart=await read();
  entry.frameIntervals=await frame.evaluate(()=>new Promise(resolve=>{const values=[];let last=performance.now();function step(now){values.push(now-last);last=now;if(values.length<90)requestAnimationFrame(step);else resolve(values);}requestAnimationFrame(step);}));
  const frameEnd=await read();entry.approxFps=(frameEnd.frames-frameStart.frames)*1000/entry.frameIntervals.reduce((a,b)=>a+b,0);
  assert.ok(frameEnd.frames-frameStart.frames>10,'Scene did not actually render during FPS measurement');
  await frame.locator('#animation-pause').click();await frame.locator('#animation-reset').click();
  await page.setViewportSize({width:390,height:900});await page.waitForTimeout(200);assert.ok(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(directory,name.replace('.html','-mobile.png')),timeout:20000});await page.setViewportSize({width:1600,height:1000});
  assert.deepEqual(entry.errors,[]);assert.deepEqual(entry.requests,[]);entry.passed=true;console.log(JSON.stringify({name,meshes:entry.initial.meshes,shots:entry.shots.length,fps:entry.approxFps,passed:true}));await page.close();
 }
 const fallback=await context.newPage();await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /^webgl/.test(kind)?null:original.call(this,kind,...args);};});
 await fallback.goto('file://'+path.join(directory,fs.readdirSync(directory).find(name=>name.endsWith('.html'))));await fallback.waitForFunction(()=>globalThis.__cinematic);assert.equal(await fallback.evaluate(()=>globalThis.__cinematic.getState().renderer),'2d');await fallback.locator('#animation-play').click();await fallback.waitForTimeout(150);assert.ok(await fallback.evaluate(()=>globalThis.__cinematic.getState().time>0));console.log('No-WebGL fallback controls passed');
 }finally{fs.writeFileSync(path.join(directory,'browser-report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
