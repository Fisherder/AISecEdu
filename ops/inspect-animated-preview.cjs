const path=require('node:path'),fs=require('node:fs');
const {chromium}=require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({storageState:'cache/acceptance/browser-state.json',viewport:{width:1440,height:1000}});
 await context.addInitScript(()=>{window.__aiseceduObservedContexts=new WeakMap();const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(...args){const result=original.apply(this,args);if(result)window.__aiseceduObservedContexts.set(this,result);return result;};});
 const page=await context.newPage(),report={console:[]};page.on('console',m=>{if(['error','warning'].includes(m.type()))report.console.push(m.text().slice(0,3000));});page.on('pageerror',e=>report.console.push(e.message));
 await page.goto('http://10.92.35.7:8080/teacher/artifacts/'+process.argv[2]);
 await page.locator('#teaching-artifact[data-preview-state="ready"]').waitFor({timeout:90000});
 let frame;for(let i=0;i<30;i++){for(const candidate of page.frames()){if(await candidate.locator('#animation-play').count()){frame=candidate;break;}}if(frame)break;await page.waitForTimeout(1000);}
 report.canvases=await frame.locator('canvas').evaluateAll(items=>items.map(el=>{const context=window.__aiseceduObservedContexts.get(el),gl=context&&typeof context.readPixels==='function'?context:null;return{id:el.id,width:el.width,height:el.height,rect:el.getBoundingClientRect().toJSON(),display:getComputedStyle(el).display,gl:gl?{lost:gl.isContextLost(),error:gl.getError(),attributes:gl.getContextAttributes()}:null};}));
 report.text=(await frame.locator('body').innerText()).slice(-1500);
 await frame.locator('#animation-play').click();await page.waitForTimeout(2500);await frame.locator('#animation-pause').click();
 await frame.locator('canvas:visible').first().screenshot({path:'cache/acceptance/diagnostic-canvas.png'});
 fs.writeFileSync('cache/acceptance/diagnostic.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();
})();
