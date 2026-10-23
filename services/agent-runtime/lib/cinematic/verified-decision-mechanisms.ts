import mechanisms from './reference-scenes/verified-decision-mechanisms.json';
import {parseCinematicScene} from './schema';
import {parseVisualGenerationIntent} from './capabilities';
import {generationFingerprint} from '@/lib/generation/durable-stage';

interface VerifiedDecisionMechanism {
  sceneJson:string;
  director:Record<string,unknown>;
  intent:Record<string,unknown>;
  keepTeacherIntent:boolean;
  mechanismId:string;
  qualification:{originId:string;originalBrowserSceneSha256:string;containsPresetDomainModel:true};
  semanticReceipt?:unknown;
}
const presets=mechanisms as unknown as Record<string,VerifiedDecisionMechanism>;
const scopes:Record<string,{topic:RegExp;unsupported:RegExp;objects:RegExp}>={
  'centrifuge-cascade':{topic:/离心机|centrifug/i,
    unsupported:/(?:一|两|二|四|五|六|[124-9])\s*台\s*离心机|真实.*(?:控制器|PLC)|真实流体|fluid\s*solver/i,
    objects:/离心机|壳体|转子|示踪带|HMI|物理|仪表|停机按钮|供给管路|连接管路|碎片|centrifug|housing|rotor|gauge|pipe|fragment/i},
  'centrifuge-two':{topic:/离心机|centrifug/i,
    unsupported:/(?:一|三|四|五|六|[13-9])\s*台\s*离心机|级联|碎片|真实.*(?:控制器|PLC)|cascade|fragment/i,
    objects:/离心机|机壳|转子|HMI|物理|仪表|centrifug|housing|rotor|gauge/i},
  'gate-valve':{topic:/闸阀|gate\s*valve/i,
    unsupported:/泄漏|故障|裂纹|打开到关闭|从开到关|真实流体|两.*闸阀|leak|fault|fracture|fluid\s*solver/i,
    objects:/阀体|闸板|阀芯|阀杆|流道|流向|闸阀|valve|gate|stem|flow/i},
  'processor-package':{topic:/处理器封装|CPU\s*封装|processor\s*package/i,
    unsupported:/晶体管级|指令执行|电路仿真|独立.*(?:层|引脚)|transistor|instruction\s*execution|circuit\s*solver/i,
    objects:/封装|盖|芯片|基板|中介层|硅|栅极|保护窗|引脚|package|cover|chip|substrate/i},
  motor:{topic:/电机|motor/i,unsupported:/(?:两|二|[2-9])\s*台\s*电机|步进|换相|磁场|电磁|绕组|惯量|温升|热模型|燃烧|磁通|stepper|commutat|magnetic|inertia|thermal/i,
    objects:/机壳|转子|转轴|独立轴|控制台|机座|过载|motor|housing|rotor|shaft|console/i},
  'network-rack':{topic:/网络机柜|network\s*rack/i,unsupported:/(?:一|1)\s*台\s*服务器|路由表|BGP|OSPF|协议栈|无线|多跳|routing\s*table|wireless|multi.?hop/i,
    objects:/入口|交换机|服务器|机柜|网络连接|链路|ingress|switch|server|rack|link/i},
  'stack-memory':{topic:/缓冲区|buffer/i,unsupported:/真实进程|执行(?:shellcode|机器代码)|连接进程|ROP|ASLR|实际攻击|shellcode|real\s*process/i,
    objects:/缓冲区|邻接|相邻|返回地址|字节|buffer|adjacent|return\s*address|byte/i},
  'packet-mtu':{topic:/MTU/i,unsupported:/TCP\s*重传|校验和|CRC|加密|IPv6|checksum|retransmi|encrypt/i,
    objects:/载荷|头部|首部|报文|出口|链路|接收端|payload|header|packet|link|receiver/i},
  'backup-recovery':{topic:/备份|backup/i,unsupported:/RAID|纠删码|灾备机房|真实文件|分布式一致性|erasure|real\s*files|consensus/i,
    objects:/主存储|快照|备份|存储设备|primary\s*storage|snapshot|backup|storage/i},
  'door-access':{topic:/门禁|读卡器|access\s*control|card\s*reader/i,unsupported:/人脸|虹膜|指纹|门锁电路|多扇|双门|两扇|两道|biometric|fingerprint|iris|face\s*recog/i,
    objects:/门|读卡器|控制器|door|reader|controller/i},
  'incident-isolation':{topic:/事件响应|异常.*服务器|incident\s*response/i,unsupported:/(?:一|1)\s*台\s*服务器|病毒代码|真实网络|内核|取证镜像|横向移动.*命令|malware\s*code|real\s*network|kernel|forensic\s*image/i,
    objects:/服务器|交换机|监控台|链路|server|switch|monitor|link/i},
  'gate-leak':{topic:/闸阀|gate\s*valve/i,unsupported:/(?:两|二|[2-9])\s*(?:台|个|只)\s*闸阀|打开到关闭|从开到关|裂纹|断裂|破裂|碎片|拆卸|拆解|液滴|喷射|泄漏路径|流体求解|多阀|fracture|crack|disassembl|droplet|jet|fluid\s*solver/i,
    objects:/阀体|闸板|阀芯|阀杆|流道|流向|闸阀|valve|gate|stem|flow/i},
};

/** Reuse a complete, executed teaching mechanism, including its declared
 * simplified rules. This is template-assisted generation, not a newly
 * invented scientific model. New entities, numeric contracts or physical
 * mechanisms go through ordinary authoring and all source/browser checks. */
export function verifiedDecisionMechanism(request:{originalRequest?:unknown;description?:unknown;title?:unknown;visualIntent?:unknown}){
  const text=typeof request.originalRequest==='string'&&request.originalRequest.trim()
    ?request.originalRequest:[request.description,request.title].filter(value=>typeof value==='string').join(' ');
  if(/(?:\d+\s*(?:字节|bytes?|rpm|rad|秒|%|级))|(?:三|四|五|六|七|八|九|十|[3-9])\s*(?:台|扇|道)\s*(?:服务器|电机|门|闸阀)|(?:不要|禁止).*?(?:交互|比较|评分|旋转)/i.test(text))return;
  const objects=request.visualIntent&&typeof request.visualIntent==='object'&&
    Array.isArray((request.visualIntent as {objects?:unknown}).objects)
      ?(request.visualIntent as {objects:unknown[]}).objects:[];
  for(const [topic,scope] of Object.entries(scopes)){
    // Selecting one member of a declared two-server setup does not reduce
    // the requested device count. Keep actual single-device requirements.
    const requestedWork=text.replace(/不连接真实(?:进程|网络)|不执行真实机器代码/g,'')
      .replace(/(?:学生)?选择(?:其中)?(?:一|1)\s*台\s*服务器/g,'选择实验服务器');
    if(!scope.topic.test(text)||scope.unsupported.test(requestedWork)||objects.some(name=>typeof name!=='string'||!scope.objects.test(name)))continue;
    if(topic==='centrifuge-cascade'&&(!/(?:三|3)\s*台.*离心机/.test(text)||!/级联|碎片|cascade|fragment/i.test(text)))continue;
    if(topic==='centrifuge-two'&&!/(?:两|二|2)\s*台.*离心机/.test(text))continue;
    if(topic==='gate-valve'&&!/关闭到打开|从关到开|开闭|closed?\s*(?:to|→)\s*open/i.test(text))continue;
    if(topic==='processor-package'&&(!/内部层次|分层|layer/i.test(text)||!/展开|复原|explode|reassembl/i.test(text)))continue;
    if(topic==='gate-leak'&&!/泄漏|leak/i.test(text))continue;
    if(topic==='stack-memory'&&!/字节|返回地址|byte|return\s*address/i.test(text))continue;
    // Keep authored numeric literals in JSON text. Build tools must not round
    // a scene imported as a JavaScript object and invalidate its pixel proof.
    const {sceneJson,...metadata}=structuredClone(presets[topic]);
    const seed={...metadata,scene:parseCinematicScene(JSON.parse(sceneJson))};
    const proof=metadata.semanticReceipt as {requestIntentJson?:string;review?:{sourceChecks?:Array<{quote:string}>}}|undefined;
    // Older references used different labels for the same executed evidence.
    // Reuse that map only for the exact original request and visual contract;
    // new names or requirements retain the teacher's current contract.
    if(proof?.requestIntentJson&&proof.review?.sourceChecks?.map(check=>check.quote).join('')===text){
      const original=JSON.parse(proof.requestIntentJson);
      if(generationFingerprint({...original,...parseVisualGenerationIntent(original)})===
        generationFingerprint(request.visualIntent&&typeof request.visualIntent==='object'
          ?{...request.visualIntent,...parseVisualGenerationIntent(request.visualIntent)}:request.visualIntent))
        seed.keepTeacherIntent=false;
    }
    const title=typeof request.title==='string'?request.title.trim():'';
    if(title){seed.scene.title=title;seed.director.title=title;}
    return seed;
  }
}
