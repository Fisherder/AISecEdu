const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='http://10.92.35.7:8080',root=path.resolve('cache/cinematic-production');
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
const requested=process.argv.slice(2).map(Number),indexes=requested.length?requested:[1,2,3];
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({storageState:'cache/acceptance/browser-state.json',viewport:{width:1680,height:1050}});
 try{for(const index of indexes){
  const dir=path.join(root,'example-'+index),generation=JSON.parse(fs.readFileSync(path.join(dir,'generation.json')));assert.ok(generation.artifactId);
  const page=await context.newPage(),report={artifactId:generation.artifactId,errors:[],shots:[],checks:[]};
  page.on('pageerror',error=>report.errors.push(error.message));
  try{
   const response=await context.request.get(base+'/pwncollege_api/v1/teaching/artifacts/'+report.artifactId,{maxRetries:3,timeout:20000});assert.equal(response.status(),200);const artifact=(await response.json()).data.artifact;fs.writeFileSync(path.join(dir,'artifact.json'),JSON.stringify(artifact,null,2));
   const content=artifact.revision.content.lesson.artifacts[0].content;assert.equal(content.renderingMode,'cinematic-v1');assert.ok(content.cinematicDirection);assert.ok((content.html.match(/<style>([\s\S]*?)<\/style>/)||[])[1]?.length>5000,'Production scene styles missing');report.revision=artifact.currentRevision;report.title=artifact.title;
   await page.goto(base+'/teacher/artifacts/'+report.artifactId,{waitUntil:'domcontentloaded'});await page.locator('#teaching-artifact[data-preview-state="ready"]').waitFor({timeout:90000});
   let frame,host;for(let attempt=0;attempt<40;attempt++){for(const candidate of page.frames()){if(await candidate.locator('[data-aisecedu-cinematic-preview="v1"]').count())host=candidate;if(await candidate.locator('#cinema[data-cinematic="v1"]').count())frame=candidate;}if(frame&&host)break;await page.waitForTimeout(500);}
   assert.ok(frame&&host,'Cinematic UI not loaded');await frame.waitForFunction(()=>globalThis.__cinematic);
   const read=()=>frame.evaluate(()=>globalThis.__cinematic.getState());assert.equal((await read()).renderer,'webgl');assert.equal(await host.locator('[data-aisecedu-cinematic-preview] [role="alert"]').count(),0);assert.equal(await frame.locator('#cinema').evaluate(el=>getComputedStyle(el).display),'flex');
   await frame.evaluate(()=>globalThis.__cinematic.seek(8));const pausedBefore=await read(),outerHandle=await page.locator('#artifact-preview').elementHandle(),innerHandle=await host.locator('[data-aisecedu-cinematic-preview] iframe').elementHandle();
   await page.screenshot({path:path.join(dir,'normal-preview.png'),timeout:20000});
   await host.getByRole('button',{name:'沉浸演示',exact:true}).click();await page.waitForTimeout(250);
   const outerBounds=await page.locator('#artifact-preview').boundingBox();assert.ok(outerBounds.width>=1678&&outerBounds.height>=1000,JSON.stringify(outerBounds));assert.equal((await read()).time,pausedBefore.time);
   assert.ok(await outerHandle.evaluate(el=>el===document.getElementById('artifact-preview')));assert.ok(await innerHandle.evaluate(el=>el===document.querySelector('[data-aisecedu-cinematic-preview] iframe')));
   const chapters=await frame.evaluate(()=>globalThis.__cinematic.scene.chapters.map(item=>({at:item.at,title:item.title})));report.sceneSummary={nodes:content.cinematicScene.nodes.length,models:content.cinematicScene.nodes.filter(node=>node.kind==='model').map(node=>node.model),tracks:content.cinematicScene.tracks.length,shots:content.cinematicScene.shots.length,chapters:chapters.length};
   for(const [shotIndex,chapter]of chapters.entries()){
    const end=chapters[shotIndex+1]?.at??content.cinematicScene.duration;const time=chapter.at+(end-chapter.at)*.42;
    await frame.evaluate(value=>globalThis.__cinematic.seek(value),time);await page.waitForTimeout(100);
    const image=await page.screenshot({path:path.join(dir,'shot-'+shotIndex+'.png'),timeout:20000});report.shots.push({time,title:chapter.title,state:await read(),sha256:crypto.createHash('sha256').update(image).digest('hex')});
   }
   assert.ok(new Set(report.shots.map(shot=>JSON.stringify(shot.state.camera))).size>=3);
   await frame.locator('#animation-reset').click();await frame.locator('#animation-play').click();await page.waitForTimeout(1100);await frame.locator('#animation-pause').click();const paused=await read();assert.ok(paused.time>0);await page.waitForTimeout(350);assert.equal((await read()).time,paused.time);assert.equal((await read()).frames,paused.frames);
   await frame.locator('#animation-step').click();assert.ok((await read()).time>paused.time);await frame.locator('#explode-mode').click();assert.equal((await read()).exploded,true);await frame.locator('#zoom-in').click();assert.ok((await read()).explore);await frame.locator('#quality').selectOption('low');assert.equal((await read()).quality,'low');await frame.locator('#quality').selectOption('auto');
   await frame.locator('#animation-reset').click();assert.equal((await read()).time,0);assert.equal((await read()).exploded,false);
   await frame.locator('#playback-rate').selectOption('2');assert.equal((await read()).rate,2);await frame.locator('#animation-play').click();await page.waitForTimeout(800);await frame.locator('#animation-pause').click();assert.ok((await read()).time>1.2);await frame.locator('#playback-rate').selectOption('1');
   await frame.locator('#animation-progress').focus();await page.keyboard.press('End');assert.ok(Math.abs((await read()).time-content.cinematicScene.duration)<.05);await page.keyboard.press('Home');assert.equal((await read()).time,0);
   await frame.locator('#chapters button').nth(1).click();assert.equal((await read()).time,chapters[1].at);
   await frame.locator('#camera-mode').click();const yaw=(await read()).yaw,canvasBox=await frame.locator('#cinematic-canvas').boundingBox();await page.mouse.move(canvasBox.x+canvasBox.width*.55,canvasBox.y+canvasBox.height*.55);await page.mouse.down();await page.mouse.move(canvasBox.x+canvasBox.width*.55+50,canvasBox.y+canvasBox.height*.55+20,{steps:5});await page.mouse.up();assert.notEqual((await read()).yaw,yaw);await frame.locator('#zoom-out').click();assert.ok((await read()).zoom>1);await frame.locator('#camera-mode').click();assert.equal((await read()).explore,false);
   await frame.locator('#quality').selectOption('high');assert.equal((await read()).quality,'high');await frame.locator('#quality').selectOption('auto');
   await frame.locator('#cinema-fullscreen').click();await page.waitForTimeout(250);report.nativeFullscreen=await frame.evaluate(()=>Boolean(document.fullscreenElement));if(report.nativeFullscreen){await frame.locator('#cinema-fullscreen').click();await page.waitForTimeout(250);assert.equal(await frame.evaluate(()=>Boolean(document.fullscreenElement)),false);}else report.fullscreenNotice=await frame.locator('#renderer-note').innerText();
   await frame.locator('#animation-reset').click();
   await frame.locator('#camera-mode').focus();await page.keyboard.press('Escape');await page.waitForTimeout(200);assert.equal(await host.locator('[data-immersive]').getAttribute('data-immersive'),'false');assert.ok(await outerHandle.evaluate(el=>el===document.getElementById('artifact-preview')));assert.ok(await innerHandle.evaluate(el=>el===document.querySelector('[data-aisecedu-cinematic-preview] iframe')));
   report.checks.push('Production-generated SceneIR and director metadata','All chapter images captured at interior timestamps','Play/pause/step/reset/explode/zoom/quality work','2x speed, native range keyboard seeking, chapter selection, drag orbit and return-to-director work','Native fullscreen tested, with browser-policy notice recorded if unavailable','Pause performs zero additional scene renders','Immersion fills host viewport and preserves both iframes/time','Escape exits from nested scene iframe');
   await page.setViewportSize({width:390,height:900});await host.getByRole('button',{name:'沉浸演示',exact:true}).click();await page.waitForTimeout(200);assert.ok(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(dir,'mobile.png'),timeout:20000});await host.getByRole('button',{name:'退出沉浸演示',exact:true}).click();
   assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify({example:index,artifactId:report.artifactId,revision:report.revision,scene:report.sceneSummary,passed:true}));
  }catch(error){report.failure=String(error.message).split('\n')[0];await page.screenshot({path:path.join(dir,'verification-failure.png'),timeout:20000}).catch(()=>{});throw new Error(report.failure);}
  finally{fs.writeFileSync(path.join(dir,'browser-verification.json'),JSON.stringify(report,null,2));await page.close();}
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
