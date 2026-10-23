const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='http://10.92.35.7:8080',root=path.resolve('cache/cinematic-production');
const prompts=[
 '创建独立项目《工业闭环：表象与真实》，生成一个单页、连续的电影式 Three.js 三维教学动画，不是PPT。主题是历史工业事件中物理状态与显示读数可能不一致的高层概念：正常闭环、读数出现偏差、独立观测发现差异、恢复与复核。精细金属涡轮、机柜、实体管路和可对照的测量标记，切换全景、机构特写、读数特写；模型拆解和标记位移必须与讲解同步。要求真实三维材质、镜头推进、粒子路径、明确因果变化、播放暂停单步回拖重置和自由探索。不能只用发光方块或二维箭头。全景主体占画面主要区域。所有值仅为无量纲教学示意，不生成命令、载荷或真实设备参数，不连接任何设备。无需指定课程，不创建实践题。',
 '创建独立项目《走进处理器：一次调用的旅程》，只生成一个电影式 Three.js 三维连续动画，不要PPT。通过精细芯片、内存模组和可分层的栈帧，展示取指、调用帧建立、局部值变化、返回值传出、调用帧退出。请用空间移动、结构拆解、数据粒子和层级位移确实呈现这些教学变化，而不是只换字幕或只旋转模型。强调有形的金属引脚、电路和内存格阵，镜头从整体进入芯片与栈帧特写再回到全景；全景不要把主体缩得很小。保留播放、暂停、单步、回拖、重置、自由探索。是计算机原理概念模型，不提供利用代码或真实内存攻击方法。无需课程，不创建题目。',
 '创建独立项目《轨道交会：从远景到近距观察》，生成一个单页连续电影式 Three.js 实时三维教学动画，不要PPT。主角为带程序化地表、云层、大气与星环的虚构行星，以及金属隔热膜、太阳能电池阵、抛物面天线细节清晰的卫星。四到五个连续阶段呈现环绕关系、两个观测位置对比、卫星结构拆解、姿态改变后的观测方向、回到整体。轨迹、对象位置和镜头均有真实变化，包含近距离细节镜头与壮观全景，避免行星在画面中只有小圆点；用深空、冷暖轮廓光和克制辉光强化空间感。播放暂停单步回拖重置和自由探索均可用。明确这是几何概念动画，不是轨道力学数值模拟。无需指定课程，不创建题目。'
];
const index=Number(process.argv[2]);assert.ok(index>=0&&index<prompts.length);const dir=path.join(root,'example-'+(index+1));fs.mkdirSync(dir,{recursive:true});
if(fs.existsSync(path.join(dir,'generation.json'))){const existing=JSON.parse(fs.readFileSync(path.join(dir,'generation.json')));if(existing.artifactId||existing.threadId)throw Error('Existing generation present; inspect and resume explicitly instead of creating duplicate');}
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
(async()=>{
 const report={index,prompt:prompts[index],jobs:[],errors:[],started:new Date().toISOString()};
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({storageState:'cache/acceptance/browser-state.json',viewport:{width:1600,height:1050}}),page=await context.newPage();
 const save=()=>fs.writeFileSync(path.join(dir,'generation.json'),JSON.stringify(report,null,2));
 const read=async route=>{const response=await context.request.get(base+'/pwncollege_api/v1'+route);assert.equal(response.status(),200,route);const data=await response.json();assert.equal(data.success,true);return data.data;};
 page.on('pageerror',error=>report.errors.push(error.message));
 page.on('response',async response=>{if(!response.url().includes('/teaching/threads/')||response.request().method()!=='POST')return;try{const data=(await response.json()).data;if(data?.thread){report.threadId=data.thread.id;report.dojoId=data.thread.dojoId;save();}if(data?.job&&!report.jobs.includes(data.job.id)){report.jobs.push(data.job.id);save();}}catch{}});
 try{
  const before=new Set((await read('/teaching/artifacts?scope=projects')).artifacts.map(item=>item.id));
  await page.goto(base+'/teacher/projects',{waitUntil:'domcontentloaded'});await page.getByRole('link',{name:'＋ 新建项目'}).click();await page.locator('#teacher-agent[data-ready="true"]').waitFor();
  assert.equal(await page.locator('#teaching-dojo').inputValue(),'');await page.locator('#teaching-input').fill(prompts[index]);await page.locator('#teaching-send').click();console.log('Example',index+1,'request submitted');
  await page.locator('[data-generation-option-picker-message]').waitFor({timeout:240000});assert.equal(report.dojoId,null);
  await page.screenshot({path:path.join(dir,'generation-options.png'),timeout:20000});
  const selection=page.waitForResponse(response=>response.url().includes('/generation-options/')&&response.request().method()==='POST');await page.locator('[data-generation-option-panel]:not([hidden]) [data-generation-option-id]').click();const selected=await selection;assert.equal(selected.status(),200);report.selected=await selected.json();save();console.log('Example',index+1,'option selected',report.threadId);
  let previous='';
  for(let attempt=0;attempt<300;attempt++){
   const candidates=(await read('/teaching/artifacts?scope=projects')).artifacts.filter(item=>!before.has(item.id));
   for(const item of candidates){const artifact=(await read('/teaching/artifacts/'+item.id)).artifact;if(artifact.lineage?.generationJob?.threadId!==report.threadId)continue;report.artifactId=item.id;const state=artifact.status+':'+artifact.currentRevision;if(state!==previous){console.log('Example',index+1,item.id,state);previous=state;save();}
    if(['FAILED','CANCELED','VALIDATION_FAILED'].includes(artifact.status))throw Error('Generation failed: '+JSON.stringify(artifact.activeJob||artifact.status));
    if(['DRAFT','READY','READY_TO_PUBLISH'].includes(artifact.status)&&artifact.revision?.content?.lesson){
     assert.equal(artifact.dojoId,null);assert.equal(artifact.revision.content.lesson.artifacts.length,1);assert.equal(artifact.revision.content.lesson.artifacts[0].content.renderingMode,'cinematic-v1');
     fs.writeFileSync(path.join(dir,'artifact.json'),JSON.stringify(artifact,null,2));report.title=artifact.title;report.revision=artifact.currentRevision;report.completed=new Date().toISOString();report.passed=true;save();console.log('Example',index+1,'GENERATED',artifact.id,artifact.title);return;
    }
   }
   await page.waitForTimeout(2000);
  }
  throw Error('Generation did not complete in 10 minutes; inspect saved thread/job before resuming');
 }catch(error){report.failure=error.message;save();await page.screenshot({path:path.join(dir,'failure.png'),timeout:20000}).catch(()=>{});throw error;}
 finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
