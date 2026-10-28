import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe, expect, it, vi} from 'vitest';
import {generateTeachingDemo, TeachingDemoRepairExhaustedError} from '@/lib/teaching-demo/generation';
import {applyTeachingDemoEdits, validateTeachingDemoHtml} from '@/lib/teaching-demo/html';
import {teachingDemoProfile, selectTeachingDemoProfile} from '@/lib/teaching-demo/profiles';
import {parseTeachingDemoInspection, TeachingDemoInspectorUnavailableError} from '@/lib/teaching-demo/render-client';
import type {TeachingDemoInspector} from '@/lib/teaching-demo/render-client';
import type {SingleArtifactInput} from '@/lib/server/lesson-generation';
const raw = readFileSync(new URL('../../../../courseware-inspector/test/fixtures/teaching-demo-rsa.html', import.meta.url), 'utf8');
const profile = teachingDemoProfile('rsa')!;
const input: SingleArtifactInput = {type:'simulation', title:'RSA', originalRequest:'RSA 加解密演示', description:'真实参数实验'};
const inspect: TeachingDemoInspector = async (html, profile) => ({issues:[],evidence:{version:'teaching-demo-browser-v1',profile,
  sourceSha256:createHash('sha256').update(html).digest('hex'),oracleCases:6,
  controls:{forward:true,backward:true,reset:true,parameterChange:true,experiment:true,quiz:true,responsive:true,offline:true},
  frames:[{name:'desktop',width:1365,screenshotSha256:'a'.repeat(64)},{name:'mobile',width:390,screenshotSha256:'b'.repeat(64)}]}});
function store(){const values=new Map<string,unknown>();return {read:(key:string)=>values.get(key),write:async(key:string,value:unknown)=>{values.set(key,structuredClone(value))}}}
describe('teaching demo durable generation',()=>{
  it('uses one raw HTML call and retains complete teacher material',async()=>{const ai=vi.fn(async(_system:string,_prompt:string)=>raw);const artifact=await generateTeachingDemo(input,1,profile,ai,{inspect,materialGrounding:'完整资料结尾'});expect(ai).toHaveBeenCalledTimes(1);expect(ai.mock.calls[0][1]).toContain('完整资料结尾');expect(artifact.content).toMatchObject({renderingMode:'teaching-demo-v1',teachingDemo:{modelCalls:1}})});
  it('reuses a saved draft after inspector outage with no new model call',async()=>{const state=store(),ai=vi.fn(async()=>raw);await expect(generateTeachingDemo(input,1,profile,ai,{state,inspect:async()=>{throw new TeachingDemoInspectorUnavailableError('offline')}})).rejects.toThrow('offline');await generateTeachingDemo(input,1,profile,ai,{state,inspect});expect(ai).toHaveBeenCalledTimes(1)});
  it('does not consume content budget on provider transport failure',async()=>{const state=store(),ai=vi.fn().mockRejectedValueOnce(Error('transport')).mockResolvedValue(raw);await expect(generateTeachingDemo(input,1,profile,ai,{state,inspect})).rejects.toThrow('transport');const result=await generateTeachingDemo(input,1,profile,ai,{state,inspect});expect(result.content).toMatchObject({teachingDemo:{modelCalls:1}})});
  it('repairs only the exact failed fragment',async()=>{const ai=vi.fn().mockResolvedValueOnce(raw.replace('RSA 检查样本','WRONG')).mockResolvedValueOnce(JSON.stringify({edits:[{before:'WRONG',after:'RSA 检查样本'}]}));const checker:TeachingDemoInspector=async(html,p,s)=>html.includes('WRONG')?{...await inspect(html,p,s),issues:['wrong title']}:inspect(html,p,s);const result=await generateTeachingDemo(input,1,profile,ai,{inspect:checker});expect(ai).toHaveBeenCalledTimes(2);expect(result.content).toMatchObject({teachingDemo:{modelCalls:2}})});
  it('caps repair calls across job restarts',async()=>{const state=store(),ai=vi.fn().mockResolvedValueOnce(raw).mockResolvedValue('{}');const checker:TeachingDemoInspector=async(h,p,s)=>({...await inspect(h,p,s),issues:['broken behavior']});await expect(generateTeachingDemo(input,1,profile,ai,{state,inspect:checker})).rejects.toBeInstanceOf(TeachingDemoRepairExhaustedError);await expect(generateTeachingDemo(input,1,profile,ai,{state,inspect:checker})).rejects.toBeInstanceOf(TeachingDemoRepairExhaustedError);expect(ai).toHaveBeenCalledTimes(3)});
  it('continues a truncated draft within the same budget',async()=>{const cut=raw.indexOf('function reset');const ai=vi.fn().mockResolvedValueOnce(raw.slice(0,cut)).mockResolvedValueOnce(raw.slice(cut));await generateTeachingDemo(input,1,profile,ai,{inspect});expect(ai).toHaveBeenCalledTimes(2)});
  it('cannot accept an unchanged revision after invalid patch',async()=>{const ai=vi.fn(async()=>'{}');await expect(generateTeachingDemo(input,1,profile,ai,{inspect,previous:{html:raw,instruction:'修改标题'}})).rejects.toBeInstanceOf(TeachingDemoRepairExhaustedError);expect(ai).toHaveBeenCalledTimes(3)});
});
describe('teaching demo contracts',()=>{
  it('accepts SVG namespaces and CSS top while blocking network code',()=>{expect(validateTeachingDemoHtml(raw.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" style="top:0" '))).toContain('Content-Security-Policy');expect(()=>validateTeachingDemoHtml(raw.replace('reset();','fetch("https://example.com");reset();'))).toThrow('外部依赖')});
  it('allows a graph rendered by the script so its visibility is checked in the browser',()=>{
    const dynamic=raw.replace(/<svg[\s\S]*?<\/svg>/,'');
    expect(validateTeachingDemoHtml(dynamic)).toContain('Content-Security-Policy');
  });
  it('keeps an RSA boundary reference to OAEP distinct from implementing OAEP',()=>{
    const intent={mode:'interactive-2d',twoDimensionalFormat:'simulation'} as Parameters<typeof selectTeachingDemoProfile>[1];
    expect(selectTeachingDemoProfile('二维 RSA 密钥生成与加解密。安全边界：真实 RSA 使用2048位以上模数，并且必须配合填充（如 OAEP），否则相同消息得到相同密文。',intent,'html-v1')?.id).toBe('rsa');
    expect(selectTeachingDemoProfile('二维 RSA-OAEP 加解密演示。',intent,'html-v1')).toBeUndefined();
    expect(selectTeachingDemoProfile('二维 RSA。实际系统必须实现 OAEP 编码与加解密计算。',intent,'html-v1')).toBeUndefined();
    expect(selectTeachingDemoProfile('二维 RSA 与 OAEP 原理。',intent,'html-v1')).toBeUndefined();
  });
  it('reports undefined playback functions before spending browser repair attempts',()=>{
    expect(()=>validateTeachingDemoHtml(raw.replace('reset();','missingPlayback();reset();'))).toThrow('missingPlayback');
  });
  it('allows inert forms while rejecting submission targets',()=>{expect(validateTeachingDemoHtml(raw.replace('<body>','<body><form onsubmit="return false">').replace('</body>','</form></body>'))).toContain('form-action');expect(()=>validateTeachingDemoHtml(raw.replace('<body>','<body><form action="https://example.com">'))).toThrow('外部依赖')});
  it('does not duplicate injected design and policy',()=>{const first=validateTeachingDemoHtml(raw);expect(validateTeachingDemoHtml(first)).toBe(first)});
  it('refuses ambiguous or no-op text patches',()=>{expect(()=>applyTeachingDemoEdits('aa aa',{edits:[{before:'aa',after:'bb'}]})).toThrow();expect(()=>applyTeachingDemoEdits('aa',{edits:[{before:'aa',after:'aa'}]})).toThrow()});
  it('requires explicit feature flag and supported unambiguous intent',()=>{const intent={mode:'interactive-2d',twoDimensionalFormat:'simulation'} as Parameters<typeof selectTeachingDemoProfile>[1];expect(selectTeachingDemoProfile('RSA',intent,'')).toBeUndefined();expect(selectTeachingDemoProfile('RSA',intent,'html-v1')?.id).toBe('rsa');for(const request of ['RSA和AES','RSA签名','AES-256'])expect(selectTeachingDemoProfile(request,intent,'html-v1')).toBeUndefined()});
  it('binds inspector evidence to the exact delivered source',async()=>{const report=await inspect(raw,'rsa');expect(()=>parseTeachingDemoInspection(report,raw+'x','rsa')).toThrow(TeachingDemoInspectorUnavailableError);expect(()=>parseTeachingDemoInspection({...report,evidence:{...report.evidence,oracleCases:0}},raw,'rsa')).toThrow()});
});
