const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline');
const {chromium}=require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
(async()=>{
 const dir=path.resolve('cache/acceptance/windows-legacy');fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:1000}});const page=await context.newPage();
 await page.goto('http://127.0.0.1:26189/vnc.html?autoconnect=true&resize=scale',{waitUntil:'domcontentloaded'});
 await page.locator('#noVNC_container canvas').waitFor({timeout:30000});await page.waitForTimeout(2000);
 await page.screenshot({path:path.join(dir,'latest.png')});
 console.log(JSON.stringify({ready:true,text:await page.locator('body').innerText(),buttons:await page.locator('button,input[type=button]').evaluateAll(items=>items.map(item=>({id:item.id,title:item.title,text:item.textContent})))}));
 const input=readline.createInterface({input:process.stdin});
 for await(const line of input){
  try{
   const action=JSON.parse(line);if(action.quit)break;
   if(action.click)await page.mouse.click(...action.click);
   if(action.selector)await page.locator(action.selector).click();
   if(action.key)await page.keyboard.press(action.key);
   if(action.text)await page.keyboard.type(action.text,{delay:45});
   if(action.setNewPassword){
    const password=require('node:crypto').randomBytes(18).toString('base64url')+'!A1';
    fs.writeFileSync(path.join(dir,'credentials.json'),JSON.stringify({username:'Administrator',password}),{mode:0o600});
    await page.keyboard.type(password,{delay:60});await page.keyboard.press('Tab');await page.keyboard.type(password,{delay:60});await page.keyboard.press('Enter');
   }
   if(action.loginPassword){await page.keyboard.type(JSON.parse(fs.readFileSync(path.join(dir,'credentials.json'),'utf8')).password,{delay:60});await page.keyboard.press('Enter');}
   await page.waitForTimeout(Math.min(action.wait||800,5000));
   const name=/^[a-z0-9-]+$/.test(action.name||'')?action.name:'latest';
   await page.screenshot({path:path.join(dir,name+'.png'),timeout:15000});
   console.log(JSON.stringify({file:path.join(dir,name+'.png'),text:await page.locator('body').innerText()}));
  }catch(error){console.log(JSON.stringify({error:error.message}));}
 }
 await browser.close();
})();
