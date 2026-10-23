const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='http://10.92.35.7:8080',index=Number(process.argv[2]),round=process.argv[3]||'refinement';
assert.ok([1,2,3].includes(index));assert.ok(['refinement','visual-refinement','final-refinement','text-polish','copy-final','composition','marker-visibility','second-adjustment'].includes(round));
const dir=path.resolve('cache/cinematic-production/example-'+index),file=path.join(dir,round+'.json');
const generation=JSON.parse(fs.readFileSync(path.join(dir,'generation.json')));
const prompts={
 2:'请实际修改此 Three.js 场景，而不是仅改文案。保留主题和未涉及的节点ID。当前 pcb 和全部 stack 层都是默认1×1×1立方体，请将PCB改为承载器件的宽14、厚0.2、深10薄板；stack-base及各栈层为宽3、厚0.12、深2的薄层板，颜色清楚区分；器件和底板按真实包围尺寸落在承载板上，逻辑栈帧为旁侧放大示意，不要悬浮杂乱，不要称内存模组为可寻址格阵。初始全景让主角占画宽约60%-75%，并有真正芯片和层板特写。增加单个有标签的取指标记，14至24秒从内存模组移动到芯片，用位置轨道，不以固定points云或粒子数量假装数值。将PC放到内存一侧。30至38秒四个栈层依次出现、落位，SP标记同期上移，不要在0至18秒就提前完成；42至44秒参数/局部层展开，44至48秒用旧值标记淡出、新值标记淡入表现预设的局部值更新示意；52至60秒返回标记从局部层的世界坐标移向新增调用者结果接收标记；62至70秒各层按保存层、局部层、参数层、返回地址层依次淡出并保持0，SP回落。装饰连接不要始终循环假装阶段事件，可将其粒子数设0，事件用有明确时间位置轨道的标记表现。结尾是临时帧退出、结果保留，而非虚构全部恢复初态。字幕和提问严格对应上述实际时间和画面；所有状态仅为计算机原理概念示意，不声称真实内存读写或粒子数等于变量数值。仅提供播放器真实已有的控件说明，删除不存在的WASD、数值面板、快捷键承诺。',
 3:'请实际精修这个 Three.js 行星卫星动画，保留主题、planet-main、satellite-body等主角ID及未涉及的内容。当前重复粗星环、球壳和明亮大圆锥遮挡主角：移除冗余 star-ring-a、star-ring-b、planet-clouds，及引用它们的轨道/焦点/连接，保留 planet-main 模型本身的程序化云层、大气和星环。view-cone 若保留应为非常细、低透明的观测方向指示，不要白色实心巨物挡镜头；压低thruster-plume亮度，减少环绕闪烁装饰。卫星各关键帧离行星中心至少7个场景单位，行星外侧连续环绕，尤其42秒附近不要进入星体；相机所有插值路径不穿星体，并有一段准确对准卫星的近景，可清楚看到太阳能阵板和天线。卫星拆解与复位、旋转前后观测方向应有明确时间对应，让观众可对比，清理不相干的粒子链。保持壮观全景和细节镜头，行星不要缩成小球；各章节只讲真实画面中存在的几何变化，不声称数值轨道计算、显示倾角周期面板、结构开关或不存在的可控部件。明确为几何概念模型。',
};
const secondPrompt='仅做第二次定向调整，以验证连续修订：将主题强调色改为#f7ad52，原先青色的概念标记与路径改为暖琥珀色，保持实体金属材质、所有对象ID、所有轨道和章节时序不变，教学文字仅将涉及青色路径的颜色名同步为琥珀色，其他文字不变。将第一个镜头沿原观察方向推进10%（相机到target的距离乘0.9），保持target和fov不变，并确保镜头路径不穿主体。不要重建整页。';
const textPolish='只润色副标题、四个章节caption/question和节点detail，任何几何、材质、轨道、镜头、时序都不要改。请改成自然课堂讲解，每段50至90字，不展示x/z坐标、具体秒数、内部节点名称，也不用机械式重复免责声明。准确表达：开始时就地与显示两通道读数对齐；随后显示通道沿导轨偏离；第三阶段独立观测出现，其读数与就地一致但与显示有差距；最后显示回归一致。三根柱各有自己的行，所比的是沿导轨的位置而不是物理重合；独立观测在44至47秒显现，47秒已可见，不写47秒后才开始显现。状态灯只讲亮度，不讲颜色切换；模型内转子转动，外壳固定。副标题只需一句“用三路读数的分离与重合，理解观察、核验与恢复。”（此处重合指读数相同，不指柱子重叠）。';
const finalCopy={1:'只替换四个章节caption为以下准确文本，其他几何、镜头、轨道、标签、问题、副标题均保持不变。第一章：“就地测量与显示读数位于各自导轨的同一读数位置，表示两路观察一致。涡轮外壳保持固定，内部转子持续转动；先认识各通道，再观察它们随后发生的分离。”第二章：“显示读数沿自己的导轨离开基准，就地测量保持原位。两根标记之间出现读数差异，状态灯的亮度随阶段变化；此处展示预设的显示偏差，不代表真实设备测量。”第三章：“第三路独立观测逐渐显现，它与就地测量处于相同读数位置，而显示读数仍偏离。三根标记分处不同导轨，比较的是沿轨道的位置，不是柱子是否彼此重叠。”第四章：“显示读数返回基准位置，与就地测量及独立观测重新对齐。对照前后的三路读数，观察偏差消失后的共同状态；点击重置可以回到最初的两路观察。”不要在第二章再加入已于前一章结束的涡轮拆解，不能臆测颜色改变。',3:'仅把subtitle精确替换为“通过行星、卫星与方向标记，观察空间位置、结构展开和姿态变化。”，以及把objectives和节点detail中所有planet-main等内部节点ID改为对应的自然中文名称，不改变任何节点ID本身、几何、动画、镜头、章节、标题。不声称精确轨道计算或视线遮挡模拟。'};
const compositionPrompt='仅调整局部值变化章节附近的镜头，从侧面仰视改为偏上方三分之四视角，让观众能看清局部变量层表面的旧值/新值小标记，而不是被上一层板挡住。将at40的shot.position改为[-7,6,3]、target[-4.0,2.5,-3.2]、fov38；at46的position改为[-7,7,2]、target[-4.0,2.5,-3.2]、fov36；at54的position改为[-4,6,4]、target[-3.4,2.5,-2]、fov40。其他所有镜头、所有节点和所有动画轨道、所有讲解完全保持不变。不要新增、删除节点，不要修改颜色或回到早期版本。';
const markerPrompt='最后一个准确的可见性修正，不要更改其他内容：将old-value和new-value两个现有节点的局部position都改为[1.05,0.13,0.7]，保持它们的parent=layer-locals、大小、颜色和显隐轨道不变。这样标记在局部层右前角，不再被上方的保存层挡住；不要移动层板或相机。ret-marker的初始position与其位置轨道52秒（以及此前保持初位的关键帧）的value同步改为[-2.45,2.88,-2.4]，60秒终点仍为[-3.2,2.4,-0.8]；这对应更新后的局部层标记世界坐标。保留所有ID、其余轨道、镜头和文字。只输出必要的少量定向补丁。';
const visualPrompts={
 1:'请真正修改以下场景几何和时间轨道，保留工业闭环主题。当前机柜一半埋进地面、涡轮连底座一起旋转，读数柱互相遮住，主角占幅过小。将panel-rack整体中心y提高到0.45，使底面在车间地面上；turbine删除整个根对象rotation轨道，保持根姿态固定，只让模型内置转子rpm14转动，并新增12至20秒explode由0到0.45、24秒回0的结构拆解。移除flow-particles固定点云及其轨道，保留真正沿connections路径运动的示意光点。读数平台tick-base置于[6.4,-0.55,0]，尺寸width4、height0.22、depth4。三根柱分三行z=-1、0、1，均height1.5、中心y0.31，各自不遮挡；tag-local固定x5.6,z=-1，tag-display从x5.6,z0在26至40秒移到x7.8，保持至56秒，62秒回x5.6；tag-independent在44至47秒从opacity0显现，x固定5.6,z1，与就地标记具有相同x读数但在另一行，之后保持可见。增加三条x方向细刻度导轨支持读数对比。讲解用“不同通道沿同一读数方向对齐/偏离”，不能说三根柱物理重合；所有读数是预设概念标记。状态灯只讲亮度变化，第四幕删除回绿的说法。全景让涡轮、完整机柜、读数平台共同占画宽至少60%，增加涡轮正面拆解特写；26至60秒的读数镜头从侧上方能同时看清三行与x方向偏移。第一幕仅两根柱，第三幕三根柱可见。修订必须真实改变对应节点、轨道、镜头，不能只改字幕。',
 2:'保持现有薄电路板、器件、颜色、镜头和取指标记。补齐未实现的栈生命周期：对layer-retaddr、layer-args、layer-locals、layer-saved各新增opacity轨道，0秒均为0，分别在30-32、32-34、34-36、36-38秒由0升至1；退出时按保存层62-64秒、局部层64-66、参数层66-68、返回地址层68-70秒依次降至0，此后保持0到72秒。不允许只移动层板来代替淡出。PC标记位移轨道也改到正X内存一侧（当前根position改了但旧轨道覆盖它），保持x5.6附近。SP上升窗口改为30-38秒，与四层出现同步，60-70秒回落。参数/局部层展开只在42-44秒发生，之前保留叠层位置。stack-base仍是1立方体，请改width3、height0.12、depth2。old-value和new-value均成为layer-locals子节点，局部position=[0,0.1,0]，置于层板表面，不是错在下面1.15单位；旧值0-42秒不可见，42-44秒出现，44-48秒淡出，新值44-48秒淡入，随父层退出而隐藏。ret-marker在52秒从展开后的局部层世界位置[-3.5,2.85,-3.1]开始，60秒精确到result-marker的[-3.2,2.4,-0.8]，60-62秒接收标记才增亮。mem label改为内存模组，detail说明精细DIMM模块不是逐格可寻址动画。字幕用自然课堂语言描述具体变化，不堆坐标和内部节点名，不承诺真实数据计算。仅用稳定对象ID修改节点，tracks可以整体替换但须逐一保留其他无关轨道。',
 3:'保留当前行星、卫星外侧位置轨道、星环材质和五阶段。只精修特写与方向表达：26秒相机position=[11.4,4.2,6.4] target=[7.4,1.6,2.4] fov34，30秒position=[11.2,4.3,6.3] target=[7.2,1.7,2.3] fov34，34秒position=[11,4.4,6.2] target=[7,1.8,2.2] fov34，36秒position=[11.1,4.5,6.15] target=[7.1,1.9,2.15] fov34，其余镜头保持平滑衔接，特写中卫星是中心主角，不再由大行星占据整个画面。view-cone实际作为卫星朝向标记：parent设为satellite-body，局部position=[0,0.4,1.9]，rotation=[1.5708,0,0]，scale=[1,1,1]，params={top:0,bottom:0.10,height:1.8}，opacity0.4、emissive0.25，删除此节点自身所有动画轨道让它随父卫星一起转动；删除view-cone-link这条远处曲线和orbit-to-satellite那条从星体中心发出的假轨迹。两条observer关系线粒子数改0、强调曲线只是关系指引不是真实光线，不推断遮挡或可见性。orbit-ring改名参考轨道环，不把它当卫星实际走过的轨迹；本片卫星实际是预设外侧短弧移动。第3阶段说明太阳能阵板和天线短暂拆开后复位，不说持续自转（36秒前主姿态不变）；第4阶段才比较偏航前后本体与附着方向标记的一起转动。副标题和所有字幕用自然中文，不出现内部节点ID/坐标/代码；不虚构夹角数值、周期计算或观测遮挡结果。',
};
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
(async()=>{
 const report=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{artifactId:generation.artifactId,round,started:new Date().toISOString(),idempotencyKey:crypto.randomUUID()};
 if(report.passed){console.log('Already completed',file);return;}
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({storageState:'cache/acceptance/browser-state.json',viewport:{width:1600,height:1050}}),page=await context.newPage();
 const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2));
 const read=async route=>{const r=await context.request.get(base+'/pwncollege_api/v1'+route,{maxRetries:3,timeout:20000});assert.equal(r.status(),200);const d=await r.json();assert.equal(d.success,true);return d.data;};
 try{
  if(report.jobId&&report.job?.status==='FAILED'&&process.env.CINEMATIC_RETRY_EXISTING==='1'){
   await page.goto(base+'/teacher/artifacts/'+report.artifactId,{waitUntil:'domcontentloaded'});
   const result=await page.evaluate(async({jobId,key})=>{const response=await window.CTFd.fetch('/pwncollege_api/v1/teaching/jobs/'+jobId+'/retry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idempotencyKey:key})});return {status:response.status,body:await response.json()};},{jobId:report.jobId,key:report.idempotencyKey+'-v3'});
   assert.ok([200,202].includes(result.status),JSON.stringify(result));assert.equal(result.body.success,true);report.attemptHistory=[...(report.attemptHistory||[]),report.job];delete report.job;delete report.failure;save();
  }
  if(!report.jobId){
   const before=(await read('/teaching/artifacts/'+report.artifactId)).artifact;
   report.beforeRevision=before.currentRevision;fs.writeFileSync(path.join(dir,round+'-before.json'),JSON.stringify(before,null,2));save();
   if(index===1&&round==='refinement'){
    await page.goto(base+'/teacher/artifacts/'+report.artifactId,{waitUntil:'domcontentloaded'});
    const result=await page.evaluate(async({jobId,key})=>{const response=await window.CTFd.fetch('/pwncollege_api/v1/teaching/jobs/'+jobId+'/retry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idempotencyKey:key})});return {status:response.status,body:await response.json()};},{jobId:'job_e9307d4dc2914181837a6258ad6f0481',key:report.idempotencyKey});
    assert.ok([200,202].includes(result.status),JSON.stringify(result));assert.equal(result.body.success,true);report.jobId=result.body.data.job.id;
   }else{
    report.prompt=round==='marker-visibility'?markerPrompt:round==='composition'?compositionPrompt:round==='copy-final'?finalCopy[index]:round==='second-adjustment'?secondPrompt:round==='final-refinement'?('协议修复提醒：view-cone当前没有parent字段，单独replace不存在的parent一定失败。请整体replace /nodes/view-cone为保留原id的完整节点对象，在该完整对象里设置parent；或使用op:add新增parent。相机shots请整体替换为严格按at递增的完整数组，不要在尾部乱序追加中间镜头。\n'+visualPrompts[index]):round==='visual-refinement'?visualPrompts[index]:round==='text-polish'?textPolish:prompts[index];assert.ok(report.prompt);
    await page.goto(base+'/teacher/artifacts/'+report.artifactId,{waitUntil:'domcontentloaded'});
    await page.locator('#artifact-inspector-toggle').click();await page.locator('#artifact-instruction').fill(report.prompt);
    const responsePromise=page.waitForResponse(r=>r.url().endsWith('/artifacts/'+report.artifactId+'/revise')&&r.request().method()==='POST');
    await page.locator('#artifact-revise').click();const response=await responsePromise,d=await response.json();assert.ok([200,202].includes(response.status()),JSON.stringify(d));assert.equal(d.success,true);report.jobId=d.data.job.id;
   }
   save();console.log('Submitted',index,round,report.jobId);
  }
  let previous='';
  for(let attempt=0;attempt<360;attempt++){
   const job=(await read('/teaching/jobs/'+report.jobId)).job,state=job.status+':'+job.progress;
   if(state!==previous){console.log(index,state);previous=state;}
   if(job.status==='SUCCEEDED'){report.job=job;break;}
   if(['FAILED','CANCELED'].includes(job.status)){report.job=job;throw Error(job.failureMessage||job.status);}
   if(attempt===359)throw Error('Still running after 12 minutes; resume same saved job');
   await page.waitForTimeout(2000);
  }
  const after=(await read('/teaching/artifacts/'+report.artifactId)).artifact;
  assert.equal(after.currentRevision,report.beforeRevision+1);const content=after.revision.content.lesson.artifacts[0].content;
  assert.equal(content.renderingMode,'cinematic-v1');assert.ok((content.html.match(/<style>([\s\S]*?)<\/style>/)||[])[1]?.length>5000,'Compiled scene styles missing');assert.ok(content.cinematicDirection.groundingReview);
  fs.writeFileSync(path.join(dir,'artifact.json'),JSON.stringify(after,null,2));fs.writeFileSync(path.join(dir,round+'-after.json'),JSON.stringify(after,null,2));
  report.afterRevision=after.currentRevision;report.groundingReview=content.cinematicDirection.groundingReview;report.completed=new Date().toISOString();report.passed=true;delete report.failure;console.log('Completed',index,round,after.currentRevision);
 }catch(error){report.failure=String(error.message).split('\n')[0];console.error(report.failure);process.exitCode=1;}
 finally{save();await browser.close();}
})();
