const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const index=Number(process.argv[2]),release=process.argv[3];
assert.ok([1,2].includes(index));assert.equal(release,'v6');
const base='http://10.92.35.7:8080';
const targets={1:{job:'job_4adb204d66a949ce8b641592767b47da',artifact:'artifact_2400662e25b444dd98c6a9ca54faba6f'},2:{job:'job_7f0e20f057ac4f5e96e2ffb72c8742f4',artifact:'artifact_020482428b544e92a02343dae5a4157d'}};
const target=targets[index],root=path.resolve('cache/cinematic-controls/generated/example-'+index);
const generation=JSON.parse(fs.readFileSync(path.join(root,'generation.json'),'utf8'));
assert.equal(generation.artifactId,target.artifact);
const dir=path.join(root,'retry-'+release),receipt=path.join(dir,'request.json');
fs.mkdirSync(dir,{recursive:true,mode:0o700});
const save=(name,value)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(value,null,2),{mode:0o600});
const key='cinematic-'+release+'-example-'+index;
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({storageState:'cache/acceptance/browser-state.json'});
 try {
  const read=async route=>{const r=await context.request.get(base+'/pwncollege_api/v1'+route,{maxRetries:3,timeout:20000});assert.equal(r.status(),200);return(await r.json()).data;};
  const current=await read('/teaching/jobs/'+target.job);
  assert.equal(current.job.kind,'artifact.materialize');assert.equal(current.job.threadId,generation.threadId);
  if(fs.existsSync(path.join(dir,'response.json'))){console.log(JSON.stringify({alreadySubmitted:true,id:target.job,status:current.job.status}));return;}
  if(!fs.existsSync(receipt)) {
   assert.equal(current.job.status,'FAILED');
   const artifact=await read('/teaching/artifacts/'+target.artifact);
   assert.equal(artifact.artifact.status,'FAILED');
   save('job-before.json',current);save('artifact-before.json',artifact);
   save('request.json',{created:new Date().toISOString(),release,jobId:target.job,artifactId:target.artifact,idempotencyKey:key,policy:'Retry original materialization in place; preserve request and artifact; no SceneIR edits'});
  }
  const page=await context.newPage();await page.goto(base+'/teacher/artifacts/'+target.artifact,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.CTFd?.fetch));
  const result=await page.evaluate(async({job,key})=>{
   const response=await window.CTFd.fetch('/pwncollege_api/v1/teaching/jobs/'+job+'/retry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idempotencyKey:key})});
   return{status:response.status,body:await response.json()};
  },{job:target.job,key});
  assert.ok([200,202].includes(result.status),'Retry rejected HTTP '+result.status);
  assert.equal(result.body.success,true);assert.equal(result.body.data.job.id,target.job);
  save('response.json',result);console.log(JSON.stringify({id:target.job,artifactId:target.artifact,status:result.body.data.job.status,replacedInPlace:result.body.data.replacedInPlace}));
 } finally {await browser.close();}
})().catch(error=>{console.error(String(error.message).split('\n')[0]);process.exitCode=1;});
