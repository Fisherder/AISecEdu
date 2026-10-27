const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname,'..');
const out = process.env.AISECEDU_TEST_OUTPUT || path.join(root,'../browser-auto');
fs.mkdirSync(out,{recursive:true});
const question = {id:'audience',text:'学生是否已经学过 Python？',choices:['已经学过','尚未学过']};
let seq=2;
const thread={id:'fixture-thread',title:'需求澄清验收',status:'ACTIVE',context:{},messages:[{id:1,role:'user',content:'先规划参数化查询课程',metadata:{}},{id:2,role:'assistant',content:'先明确学生基础，再确定教学方案。',metadata:{jobId:'seed-job',pending:false,questions:[question],executionMode:'plan',plan:[],intentDecision:{version:'teacher-intent-v1',intent:'plan',clarification:{state:'awaiting-input'}}}}],harnessJobs:[],pendingTurns:[]};
const submissions=[];
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(root,'dojo_theme/static/js/dojo/workbench-v3/app.js')));return;}
 if(!url.pathname.startsWith('/pwncollege_api/')){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<meta charset="utf-8"><style>body{margin:0}</style><div id="cocreation-workbench" data-owner-id="fixture" style="height:100vh"></div><script>window.init={csrfNonce:"fixture"}</script><script defer src="/app.js"></script>');return;}
 const p=url.pathname.replace('/pwncollege_api/v1/teaching','');let data={};
 if(req.method==='POST' && p.endsWith('/messages')){
  let raw='';for await(const b of req)raw+=b;const body=JSON.parse(raw);submissions.push(body);
  if(body.questionReply){thread.messages[1].metadata.questionReplyJobId='reply';assert.equal(body.questionReply.sourceMessageId,2);assert.equal(body.questionReply.answers.audience,'已学过 Python，希望用真实业务例子。');}
  thread.messages.push({id:++seq,role:'user',content:body.content,metadata:{}});
  thread.messages.push({id:++seq,role:'assistant',content:'十五分钟课程计划：解释、对比与练习。',metadata:{pending:false,questions:[],executionMode:'plan',plan:['解释数据与代码分离','对比两种写法','完成练习并反馈']}});
  data={thread,job:{id:'job-'+seq,kind:'agent.chat',threadId:thread.id,status:'SUCCEEDED'}};
 }else if(p==='/context')data={teacherDojos:[],artifacts:[],materials:[],skills:[]};
 else if(p==='/threads')data={threads:[thread]};
 else if(p==='/threads/'+thread.id)data={thread};
 else if(p.endsWith('/events'))data={events:[],nextCursor:0};
 else if(p==='/jobs')data={jobs:[{id:'seed-job',kind:'agent.chat',threadId:thread.id,status:'SUCCEEDED'}]};
 else if(p==='/artifacts')data={artifacts:[]};
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,data}));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  const origin='http://127.0.0.1:'+server.address().port;
  await page.goto(origin+'/?thread='+thread.id);
  await page.locator('.workbench[data-ready="true"]').waitFor();
  assert.equal(await page.getByLabel('智能体模式').count(),0);
  await page.getByText('待回答',{exact:true}).waitFor();
  await page.getByRole('button',{name:'已经学过',exact:true}).click();
  assert.equal(await page.getByLabel(question.text).inputValue(),'已经学过');
  await page.getByLabel(question.text).fill('已学过 Python，希望用真实业务例子。');
  await page.reload();await page.locator('.workbench[data-ready="true"]').waitFor();
  assert.equal(await page.getByLabel(question.text).inputValue(),'已学过 Python，希望用真实业务例子。');
  await page.screenshot({path:path.join(out,'desktop-clarification.png')});
  await page.setViewportSize({width:390,height:844});
  if(await page.getByRole('button',{name:'关闭工作区',exact:true}).isVisible()) await page.getByRole('button',{name:'关闭工作区',exact:true}).click();
  await page.getByRole('button',{name:'提交并继续',exact:true}).scrollIntoViewIfNeeded();
  const bounds=await page.getByLabel(question.text).boundingBox();assert.ok(bounds.x>=0 && bounds.x+bounds.width<=390);
  await page.screenshot({path:path.join(out,'mobile-clarification.png')});
  await page.getByRole('button',{name:'提交并继续',exact:true}).click();
  await page.getByText('十五分钟课程计划：解释、对比与练习。',{exact:true}).waitFor();
  assert.equal(submissions[0].executionMode,'auto');
  await page.getByLabel('输入教学要求').fill('保留三个环节，把练习改成小组讨论。');
  await page.getByRole('button',{name:'发送要求',exact:true}).click();
  await page.getByText('保留三个环节，把练习改成小组讨论。',{exact:true}).waitFor();
  assert.equal(submissions[1].executionMode,'auto');assert.equal(submissions[1].content,'保留三个环节，把练习改成小组讨论。');
  assert.deepEqual(errors,[]);
  const report={passed:true,checks:['没有手动智能体模式','选项与自由输入','回答草稿刷新保留','桌面和手机显示','同一任务结构化回答绑定','多轮自然语言始终自动提交'],scope:'本地实际构建产物与 API fixture'};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
