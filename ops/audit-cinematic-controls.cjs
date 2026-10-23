const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output=path.resolve(process.argv[2]||'cache/cinematic-controls/before');
const artifactId='artifact_3a118a4bd41b41a29e0723484231cd3a';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const report={at:new Date().toISOString(),artifactId,devices:[]};
 try{for(const dpr of [1,2]){
  const context=await browser.newContext({storageState:'cache/acceptance/browser-state.json',viewport:{width:1440,height:1000},deviceScaleFactor:dpr});
  const page=await context.newPage(),device={dpr,qualities:[],errors:[]};
  page.on('pageerror',e=>device.errors.push(String(e.message).split('\n')[0]));
  await page.goto('http://10.92.35.7:8080/teacher/artifacts/'+artifactId,{waitUntil:'domcontentloaded'});
  await page.locator('#teaching-artifact[data-preview-state="ready"]').waitFor({timeout:90000});
  let frame,host;for(let i=0;i<50;i++){
   for(const item of page.frames()){if(await item.locator('#cinema[data-cinematic="v1"]').count())frame=item;if(await item.locator('[data-aisecedu-cinematic-preview]').count())host=item;}
   if(frame&&host)break;await page.waitForTimeout(300);
  }
  if(!frame||!host)throw new Error('Cinematic preview missing');
  await frame.waitForFunction(()=>globalThis.__cinematic);
  await host.getByRole('button',{name:'沉浸演示',exact:true}).click();
  await frame.evaluate(()=>globalThis.__cinematic.seek(20));
  for(const quality of ['low','auto','high']){
   await frame.locator('#quality').selectOption(quality);await page.waitForTimeout(150);
   const metrics=await frame.evaluate(()=>{const c=document.getElementById('cinematic-canvas'),gl=c.getContext('webgl2')||c.getContext('webgl');return {actualDpr:devicePixelRatio,runtime:document.getElementById('cinema').dataset.cinematicRuntime,state:globalThis.__cinematic.getState(),canvas:[c.width,c.height],buffer:gl?[gl.drawingBufferWidth,gl.drawingBufferHeight]:null,css:[c.clientWidth,c.clientHeight],note:document.getElementById('renderer-note').textContent,qualityOutput:document.getElementById('quality-output')?.textContent};});
   const shot=await frame.locator('#cinematic-canvas').screenshot({path:path.join(output,`dpr-${dpr}-${quality}.png`),timeout:20000});
   device.qualities.push({quality,...metrics,sha256:crypto.createHash('sha256').update(shot).digest('hex')});
  }
  const read=()=>frame.evaluate(()=>globalThis.__cinematic.getState());
  await frame.locator('#animation-reset').click();device.before=await read();
  const box=await frame.locator('#cinematic-canvas').boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.5+70,box.y+box.height*.5+30,{steps:6});await page.mouse.up();await page.waitForTimeout(80);device.afterDrag=await read();
  await page.mouse.wheel(0,-180);await page.waitForTimeout(200);device.afterWheel=await read();
  report.devices.push(device);await context.close();
 }}finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(String(e.message).split('\n')[0]);process.exitCode=1;});
