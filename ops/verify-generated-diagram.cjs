const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const attempt=Number(process.argv[2]||2);assert.ok(Number.isInteger(attempt)&&attempt>=2&&attempt<=5);
const dir=path.resolve('cache/cinematic-controls/generated/example-3/attempt-'+attempt);
const run=JSON.parse(fs.readFileSync(path.join(dir,'generation.json'),'utf8'));
assert.equal(run.passed,true,'A successful format/content generation check is required first');
const base='http://10.92.35.7:8080';
const report={artifactId:run.artifactId,checkedAt:new Date().toISOString(),checks:[],errors:[],passed:false};
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 let page;
 try {
  const context=await browser.newContext({storageState:'cache/acceptance/browser-state.json',viewport:{width:1600,height:1000}});
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(base+'/teacher/artifacts/'+run.artifactId,{waitUntil:'domcontentloaded'});
  await page.locator('#teaching-artifact[data-preview-state="ready"]').waitFor({timeout:90000});
  let frame;
  for(let i=0;i<60&&!frame;i++){
   for(const candidate of page.frames())if(await candidate.locator('[data-diagram="v1"]').count()){frame=candidate;break;}
   if(!frame)await page.waitForTimeout(500);
  }
  assert.ok(frame,'Interactive diagram iframe missing');
  const cfg=await frame.locator('#widget-config').textContent().then(JSON.parse);
  const original=JSON.parse(fs.readFileSync(path.join(dir,'artifact.json'),'utf8'));
  assert.deepEqual(cfg,original.revision.content.lesson.artifacts[0].content.widgetConfig,'Playback recompile changed the stored diagram config');
  assert.equal(await frame.locator('[data-diagram-details]').getAttribute('data-state'),'collapsed');
  await frame.evaluate(()=>{window.__diagramPointerAudit=[];for(const kind of ['pointerdown','click'])document.addEventListener(kind,event=>window.__diagramPointerAudit.push({kind,target:event.target.closest('[data-diagram-node]')?.dataset.diagramNode,x:event.clientX,y:event.clientY}),true);});
  assert.ok(cfg.nodes.length>=5);assert.equal(await frame.locator('#cinematic-canvas').count(),0);
  for(const size of [{width:1600,height:1000},{width:390,height:844}]){
   await page.setViewportSize(size);
   if(size.width<640){
    // The reader's mobile navigation is an overlay. Close it through its real
    // toolbar before interacting with content underneath (no forced clicks).
    for(const host of page.frames()){
     const close=host.getByRole('button',{name:'收起内容导航',exact:true});
     if(await close.count())await close.click();
    }
   }
   await frame.getByRole('button',{name:'重置流程图',exact:true}).click();
   assert.equal(await frame.locator('[data-diagram-node][aria-expanded="true"]').count(),0);
   for(const node of cfg.nodes){
    const button=frame.getByRole('button',{name:node.label,exact:true});
    await button.click();
    const actualTitle=await frame.locator('#diagram-detail-title').textContent();
    if(actualTitle!==node.label){report.clickFailure={viewport:size,expected:node.label,actualTitle,bounds:await button.boundingBox(),events:await frame.evaluate(()=>window.__diagramPointerAudit.slice(-4)),layout:await frame.evaluate(()=>({w:innerWidth,h:innerHeight,scrollX,scrollY,buttons:[...document.querySelectorAll('[data-diagram-node]')].filter(x=>x.getClientRects().length).map(x=>({id:x.dataset.diagramNode,rect:x.getBoundingClientRect().toJSON()}))}))};}
    assert.equal(actualTitle,node.label);
    assert.equal(await frame.locator('#diagram-detail-text').textContent(),node.details);
    assert.equal(await button.getAttribute('aria-pressed'),'true');
    await button.click();assert.equal(await frame.locator('[data-diagram-details]').getAttribute('data-state'),'collapsed');
    await button.press('Enter');assert.equal(await frame.locator('#diagram-detail-text').textContent(),node.details);
    await button.press('Space');assert.equal(await frame.locator('[data-diagram-details]').getAttribute('data-state'),'collapsed');
   }
   const last=frame.getByRole('button',{name:cfg.nodes.at(-1).label,exact:true});
   await last.focus();await page.keyboard.press('Home');
   assert.equal(await frame.locator('#diagram-detail-title').textContent(),cfg.nodes[0].label);
   await page.keyboard.press('ArrowRight');
   assert.equal(await frame.locator('#diagram-detail-title').textContent(),cfg.nodes[1].label);
   await frame.getByRole('button',{name:'重置流程图',exact:true}).click();
   assert.equal(await frame.locator('[data-diagram-details]').getAttribute('data-state'),'collapsed');
   assert.equal(await frame.locator('[data-diagram-node][aria-expanded="true"]').count(),0);
   await frame.getByRole('button',{name:cfg.nodes[1].label,exact:true}).click();
   const layout=await frame.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
   assert.ok(layout.scrollWidth<=layout.width+1,'Diagram causes whole-page horizontal overflow');
   await page.screenshot({path:path.join(dir,'interactive-'+size.width+'.png'),timeout:20000});
   report.checks.push({viewport:size,clickedEveryNode:cfg.nodes.length,clickAgainCollapses:true,keyboardEnterSpaceToggle:true,keyboardHomeAndArrow:true,resetAllCollapsed:true,storedConfigUnchanged:true,layout});
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(error){report.failure=String(error.stack||error);if(page)await page.screenshot({path:path.join(dir,'verification-failure.png'),timeout:20000}).catch(()=>{});throw error;}finally{fs.writeFileSync(path.join(dir,'browser-verification.json'),JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify(report));
})().catch(error=>{console.error(String(error.stack||error).slice(0,2200));process.exitCode=1;});
