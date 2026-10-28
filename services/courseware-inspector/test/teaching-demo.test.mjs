import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {teachingDemoExpected,teachingDemoCases} from '../teaching-demo-oracles.mjs';
import {inspectTeachingDemo} from '../teaching-demo.mjs';

test('independent standard vectors and edge cases',()=>{
  assert.equal(teachingDemoExpected('rsa',teachingDemoCases('rsa').valid[0]).ciphertext,'2790');
  assert.equal(teachingDemoExpected('rsa',teachingDemoCases('rsa').valid[4]).recovered,'53');
  assert.equal(teachingDemoExpected('dh',teachingDemoCases('dh').valid[0]).aliceSecret,'2');
  assert.equal(teachingDemoExpected('aes-128',teachingDemoCases('aes-128').valid[0]).ciphertext,'69c4e0d86a7b0430d8cdb78070b4c55a');
  assert.equal(teachingDemoExpected('sha256',{message:''}).digest,'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(teachingDemoExpected('hmac-sha256',teachingDemoCases('hmac-sha256').valid[0]).tag,'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
});

const executablePath=process.env.TEST_BROWSER_EXECUTABLE;
test('real browser accepts working RSA and rejects fake results and stale experiments',{skip:!executablePath && process.env.GENERATION_REQUIRE_BROWSER!=='1'},async()=>{
  const require=createRequire(new URL('../../agent-runtime/package.json',import.meta.url));
  const {chromium}=require('@playwright/test');
  const browser=await chromium.launch({headless:true,executablePath});
  try {
    const html=await readFile(new URL('./fixtures/teaching-demo-rsa.html',import.meta.url),'utf8');
    const good=await inspectTeachingDemo(browser,{data:{html,profile:'rsa'}});
    assert.deepEqual(good.issues,[]);assert.equal(good.evidence.oracleCases,6);
    const repeatedControls=html.replace('<h2>只改变消息</h2>','<h2>只改变消息</h2><button data-demo-action="experiment">另一个实验入口</button>').replace('<label><input type="radio" name="q1" value="yes">能</label>', '<label><input type="radio" name="q1" value="maybe">不确定</label><label><input type="radio" name="q1" value="yes">能</label>');
    assert.deepEqual((await inspectTeachingDemo(browser,{data:{html:repeatedControls,profile:'rsa'}})).issues,[]);
    const compact=html.replace('baseline:{...outputs}','baseline:{ciphertext:outputs.ciphertext,recovered:outputs.recovered}').replace('variant:calc(variantInputs)','variant:((v)=>({ciphertext:v.ciphertext,recovered:v.recovered}))(calc(variantInputs))');
    assert.deepEqual((await inspectTeachingDemo(browser,{data:{html:compact,profile:'rsa'}})).issues,[]);
    const svg=html.replaceAll('<output ', '<svg viewBox="0 0 500 140"><text y="60" ').replaceAll('</output>', '</text></svg>');
    assert.deepEqual((await inspectTeachingDemo(browser,{data:{html:svg,profile:'rsa'}})).issues,[]);
    const fake=html.replace('outputs=result;','outputs={n:"3233",phi:"3120",d:"2753",ciphertext:"2790",recovered:"65"};');
    assert.ok((await inspectTeachingDemo(browser,{data:{html:fake,profile:'rsa'}})).issues.some(s=>s.includes('算法')));
    const stale=html.replace('step=0;experiment=null;render()','step=0;render()');
    assert.ok((await inspectTeachingDemo(browser,{data:{html:stale,profile:'rsa'}})).issues.some(s=>s.includes('旧实验')));
  } finally {await browser.close()}
});
