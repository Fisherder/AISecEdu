const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='http://10.92.35.7:8080';
const prompts=[
 '创建一个独立项目，给学生讲清一套阀门与管路的装配和作用。需要能围着整套装置看，放大法兰、连接处和支架，再拆开真正的阀门观察里面，最后复原。展示完整通路、结构细节、通路中流向与阀门状态的关系，实体之间要真的连接，不能把各件分散摆在空板上。让教学过程连续发生，有全景与局部观察，画面精细清楚，不要PPT。说明这是教学概念模型，不控制设备，也不冒充流体数值计算。',
 '创建一个独立项目，讲解一块计算机主板上的处理器、插座、内存插槽和电路走线，并用有分区的逻辑栈层展示一次函数调用如何进入、保存局部信息、返回和退出。能放大零件、转到侧面看结构、拆开层次。请清楚区分实体硬件和逻辑示意，把有关联的部件装配好，避免漂浮板、随意连线与遮挡。连续讲解，先看整体再进入细节，画面要精细有层次，不是PPT，也不把装饰运动当作真实CPU执行。',
 '创建一个独立项目，只用二维流程图讲解学生选课、学习、练习、提交和反馈的关系。不要三维，不要Three.js，也不需要摄像机。点击步骤可以查看简短说明，保持清晰的二维页面。'
];
const index=Number(process.argv[2]);assert.ok(Number.isInteger(index)&&index>=1&&index<=prompts.length);
const attemptArg=process.argv.find(value=>value.startsWith('--attempt='));
const attemptNumber=attemptArg?Number(attemptArg.split('=')[1]):1;
assert.ok(Number.isInteger(attemptNumber)&&attemptNumber>=1&&attemptNumber<=5);
const rootDir=path.resolve('cache/cinematic-controls/generated/example-'+index);
const prior=attemptNumber>1?JSON.parse(fs.readFileSync(path.join(rootDir,'generation.json'),'utf8')):null;
const dir=attemptNumber===1?rootDir:path.join(rootDir,'attempt-'+attemptNumber),reportPath=path.join(dir,'generation.json');
fs.mkdirSync(dir,{recursive:true});
const resume=process.argv.includes('--resume');
const planOnly=process.argv.includes('--plan-only');
const selectedOptionArg=process.argv.find(value=>value.startsWith('--select-option='));
const optionNumber=selectedOptionArg?Number(selectedOptionArg.split('=')[1]):1;
assert.ok(Number.isInteger(optionNumber)&&optionNumber>=1&&optionNumber<=3);
if(fs.existsSync(reportPath)&&!resume)throw Error('Existing run; inspect saved evidence and use --resume');
const report=resume?JSON.parse(fs.readFileSync(reportPath,'utf8')):{index,prompt:prompts[index-1],started:new Date().toISOString(),jobs:[],errors:[],...(prior?{threadId:prior.threadId,dojoId:null,previousArtifactId:prior.artifactId,attemptNumber}: {})};
const save=()=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({storageState:'cache/acceptance/browser-state.json',viewport:{width:1600,height:1000}}),page=await context.newPage();
 const read=async route=>{const response=await context.request.get(base+'/pwncollege_api/v1'+route,{maxRetries:3,timeout:20000});if(response.status()!==200)throw Error(route+' HTTP '+response.status());return (await response.json()).data;};
 page.on('pageerror',e=>report.errors.push(String(e.message).split('\n')[0]));
 page.on('response',async response=>{if(!response.url().includes('/teaching/threads')||response.request().method()!=='POST')return;try{const data=(await response.json()).data;if(data?.thread){report.threadId=data.thread.id;report.dojoId=data.thread.dojoId;save();}if(data?.job&&!report.jobs.includes(data.job.id)){report.jobs.push(data.job.id);save();}}catch{}});
 try{
  if(!report.threadId || (prior&&!report.submittedAt)){
   report.beforeIds=(await read('/teaching/artifacts?scope=projects')).artifacts.map(item=>item.id);save();
   if(prior){await page.goto(base+'/teacher?thread='+encodeURIComponent(report.threadId),{waitUntil:'domcontentloaded'});}
   else{await page.goto(base+'/teacher/projects',{waitUntil:'domcontentloaded'});await page.getByRole('link',{name:'＋ 新建项目'}).click();}
   await page.locator('#teacher-agent[data-ready="true"]').waitFor();
   const pickerCount=await page.locator('[data-generation-option-picker-message]').count();
   assert.equal(await page.locator('#teaching-dojo').inputValue(),'');await page.locator('#teaching-input').fill(report.prompt);await page.locator('#teaching-send').click();report.submittedAt=new Date().toISOString();save();console.log('Submitted ordinary prompt',index);
   const picker=page.locator('[data-generation-option-picker-message]').nth(pickerCount);
   await picker.waitFor({timeout:240000});assert.equal(report.dojoId,null);
   report.pendingMessageId=await picker.getAttribute('data-generation-option-picker-message');save();
   if(planOnly){fs.writeFileSync(path.join(dir,'options-observed.json'),JSON.stringify(await read('/teaching/threads/'+report.threadId),null,2));console.log('PLANS_READY',index,report.pendingMessageId);return;}
   await page.screenshot({path:path.join(dir,'options.png'),timeout:20000});
   const selection=page.waitForResponse(response=>response.url().includes('/generation-options/')&&response.request().method()==='POST');await picker.locator('[data-generation-option-panel]:not([hidden]) [data-generation-option-id]').click();const selected=await selection;assert.equal(selected.status(),200);report.selected=await selected.json();report.selectedAt=new Date().toISOString();save();console.log('Selected',index,report.threadId);
  } else if(!report.selectedAt){
   assert.ok(selectedOptionArg&&report.pendingMessageId,'Saved request needs explicit --select-option=N, not another thread');
   await page.goto(base+'/teacher?thread='+encodeURIComponent(report.threadId),{waitUntil:'domcontentloaded'});
   await page.locator('#teacher-agent[data-ready="true"]').waitFor();
   const picker=page.locator('[data-generation-option-picker-message="'+report.pendingMessageId+'"]');
   const view=picker.locator('[data-generation-option-view-id="option-'+optionNumber+'"]');
   await view.click();
   const selection=page.waitForResponse(response=>response.url().includes('/generation-options/')&&response.request().method()==='POST');
   await picker.locator('[data-generation-option-panel]:not([hidden]) [data-generation-option-id]').click();
   const selected=await selection;assert.equal(selected.status(),200);report.selected=await selected.json();report.selectedAt=new Date().toISOString();save();console.log('Selected existing plan',index,optionNumber,report.threadId);
  }
  let previous='';
  for(let attempt=0;attempt<360;attempt++){
   const items=(await read('/teaching/artifacts?scope=projects')).artifacts.filter(item=>!(report.beforeIds||[]).includes(item.id));
   for(const item of items){
    const artifact=(await read('/teaching/artifacts/'+item.id)).artifact;
    if(item.id!==report.artifactId&&artifact.lineage?.generationJob?.threadId!==report.threadId)continue;
    report.artifactId=item.id;const status=artifact.status+':'+artifact.currentRevision;if(status!==previous){console.log(index,item.id,status);previous=status;save();}
    if(['FAILED','CANCELED','VALIDATION_FAILED'].includes(artifact.status))throw Error('Artifact failed '+artifact.status);
    if(['DRAFT','READY','READY_TO_PUBLISH'].includes(artifact.status)&&artifact.revision?.content?.lesson){
     fs.writeFileSync(path.join(dir,'artifact.json'),JSON.stringify(artifact,null,2));
     const generated=artifact.revision.content.lesson.artifacts;
     const contents=generated.map(a=>a.content);
     if(index<=2){assert.equal(contents.length,1);assert.equal(contents[0].renderingMode,'cinematic-v1');}
     else {
      assert.equal(contents.length,1,'A clickable flow diagram was incorrectly split into multiple pages');
      assert.equal(generated[0].type,'diagram','A clickable diagram was replaced by a different delivery');
      assert.equal(contents[0].widgetType,'diagram');
      assert.notEqual(contents[0].renderingMode,'cinematic-v1','Explicit 2D request was converted to 3D');
      const config=contents[0].widgetConfig;
      assert.ok(config?.nodes?.length>=5,'Requested five-step flow is incomplete');
      for(const step of ['选课','学习','练习','提交','反馈'])assert.ok(config.nodes.some(node=>String(node.label).includes(step)&&String(node.details||'').length>5),'Missing explained step: '+step);
     }
     fs.writeFileSync(path.join(dir,'artifact.json'),JSON.stringify(artifact,null,2));report.title=artifact.title;report.revision=artifact.currentRevision;report.completed=new Date().toISOString();report.passed=true;save();console.log('GENERATED',index,artifact.id,artifact.title);return;
    }
   }
   if(report.jobs.length){const latest=(await read('/teaching/jobs/'+report.jobs.at(-1))).job;if(['FAILED','CANCELED'].includes(latest?.status))throw Error('Generation job '+latest.status+': '+String(latest.error||latest.lastError||'inspect job'));}
   await page.waitForTimeout(2500);
  }
  throw Error('Still pending after 15 minutes; saved run can be resumed without duplication');
 }catch(e){report.passed=false;report.failure=String(e.message).split('\n')[0];save();await page.screenshot({path:path.join(dir,'failure.png'),timeout:20000}).catch(()=>{});throw new Error(report.failure);}
 finally{await browser.close();}
})().catch(e=>{console.error(String(e.message).split('\n')[0]);process.exitCode=1;});
