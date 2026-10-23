import {requestedEvidenceQuestionCount} from '../process/capabilities';

/** The typed result author is for object-and-strategy experiments. Code,
 * algorithms, spatial/physical models and explicit quizzes keep the richer
 * staged author instead of being flattened into a generic result lab. */
export function decisionAuthoringPolicy(request:Record<string,unknown>,mode='typed') {
  const text=[request.title,request.originalRequest,request.description,...(Array.isArray(request.keyPoints)?request.keyPoints:[])]
    .filter(part=>typeof part==='string').join('\n');
  if(mode!=='typed'||requestedEvidenceQuestionCount(request)>0||
    /逐字节|逐步|初始化|执行攻击|缓冲区溢出|寄存器|机器指令|代码|算法|二分|排序|堆栈|调用栈|CPU|拖拽|拓扑|状态机|电路|物理|离心机|三维|公钥|密钥协商|异或|Diffie|Hellman|\b(?:3d|AES|RSA|ECC|SHA)\b/i.test(text)||
    /(?:不要|无需|不需要).{0,10}(?:决策|选择|策略)|no\s+(?:choices|decisions)/i.test(text)||
    !/选择|决策|策略|方案|处置|隔离|限流|权限|切换|访问控制|恢复|补丁|脱敏|验证强度|流量控制|应急响应|钓鱼|恶意软件/.test(text))return {};
  return {cohesiveDomainModel:true,nativeDecisionSurface:true,typedOutcomeSpec:true};
}
