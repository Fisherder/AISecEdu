import goldBuffer from './reference-scenes/gold-buffer.json';
import packetEncapsulation from './reference-scenes/packet-encapsulation.json';
import hashAvalanche from './reference-scenes/hash-avalanche.json';

type CoverageEvidence = {description: string; inputs: string[]; actions: string[]; views: string[]};
function bindVerifiedCoverage<T extends {scene: {coverage: CoverageEvidence[]}}>(reference: T, interactions: string[],
  aliases: Record<string, string[]>, grounded?: (description: string) => string[] | undefined) {
  const output = structuredClone(reference);
  const coverage = output.scene.coverage as CoverageEvidence[];
  const byDescription = new Map(coverage.map(item => [item.description, item]));
  for (const description of interactions) {
    if (byDescription.has(description)) continue;
    const compact = description.replace(/\s+/g, '');
    const sources = aliases[compact] ?? grounded?.(compact);
    if (!sources?.length) return;
    const evidence = sources.map(source => byDescription.get(source));
    if (evidence.some(item => !item)) return;
    const unique = (values: string[]) => [...new Set(values)];
    coverage.push({
      description,
      inputs: unique(evidence.flatMap(item => item!.inputs)),
      actions: unique(evidence.flatMap(item => item!.actions)),
      views: unique(evidence.flatMap(item => item!.views)),
    });
  }
  return output;
}

function groundedPacketCoverage(description: string): string[] | undefined {
  if (description.length > 70 || /分片|加密|解密|重传|真实(?:网络|CRC)|发送|接收|IPv6|TLS|HTTP|DNS|QUIC|SCTP|校验和|命令|脚本|外部|文件|磁盘/i.test(description)) return;
  const names: string[] = [];
  const add = (name: string) => {if (!names.includes(name)) names.push(name);};
  if (/应用数据长度/.test(description)) add('选择应用数据长度');
  if (/传输层协议/.test(description)) add('选择传输层协议');
  if (/(?:构造|建立|生成)应用数据/.test(description)) add('构造应用数据');
  if (/传输层.*封装/.test(description)) add('执行传输层封装');
  if (/网络层.*封装/.test(description)) add('执行网络层封装');
  if (/链路层.*封装/.test(description)) add('执行链路层封装');
  if (!/撤销|回退/.test(description) && /单步|逐步|下一步|下一层|按一次|^暂停$/.test(description)) add('单步推进封装步骤');
  if (/撤销|回退/.test(description)) add('撤销一步封装');
  if (/重置|复位/.test(description)) add('重置到初始状态');
  if (/核对|答题/.test(description)) add('核对当前观察结果');
  if (/头部|协议字段/.test(description)) add('观察每层头部和协议字段');
  if (/总长度|字节长度|字节结构|连续字节/.test(description)) add('观察总长度与连续字节结构');
  return names.length ? names : undefined;
}

function groundedHashCoverage(description: string): string[] | undefined {
  if (description.length > 70 || /SHA|MD5|BLAKE|真实哈希|密码学哈希|中文|Unicode|非ASCII|网络|文件|下载|导出|命令|脚本|外部|磁盘/i.test(description)) return;
  const names: string[] = [];
  const add = (name: string) => {if (!names.includes(name)) names.push(name);};
  if (/输入.*(?:文本|字符)|(?:文本|字符).*输入/.test(description)) add('输入两段仅相差一个字符的短文本');
  if (/编码/.test(description)) add('把两段文本编码为字节');
  if (/输入字节|字节对照/.test(description)) add('查看输入字节、每轮状态和柱状变化');
  if (/单步|逐步|逐轮|一轮/.test(description)) add('逐步执行一轮混合过程');
  if (/连续|多轮|分轮/.test(description)) add('连续执行多轮混合过程');
  if (/撤销|回退/.test(description)) add('撤销上一步混合');
  if (/重置|复位/.test(description)) add('重置到初始输入与字节状态');
  if (/差异位|核对/.test(description)) add('观察并核对当前差异位数量');
  if (/每轮状态|状态数组|柱状|柱形/.test(description)) add('查看输入字节、每轮状态和柱状变化');
  return names.length ? names : undefined;
}

const packetAliases: Record<string, string[]> = {
  '设置应用数据长度': ['选择应用数据长度'],
  '单步执行下一封装步骤': ['单步推进封装步骤'],
  '单步执行下一步封装': ['单步推进封装步骤'],
  '撤销一步': ['撤销一步封装'],
  '重置': ['重置到初始状态'],
  '观察核对当前总长度和协议字段': ['观察每层头部和协议字段', '观察总长度与连续字节结构', '核对当前观察结果'],
  '观察核对当前总长度与协议字段': ['观察每层头部和协议字段', '观察总长度与连续字节结构', '核对当前观察结果'],
  '查看每层头部、总长度、协议字段和连续字节结构': ['观察每层头部和协议字段', '观察总长度与连续字节结构'],
};
const hashAliases: Record<string, string[]> = {
  '将两段文本编码为UTF-8字节': ['把两段文本编码为字节'],
  '将两段文本按UTF-8编码成字节': ['把两段文本编码为字节'],
  '分轮执行教学用确定性混合过程': ['逐步执行一轮混合过程', '连续执行多轮混合过程'],
  '显示输入字节对照': ['输入两段仅相差一个字符的短文本', '查看输入字节、每轮状态和柱状变化'],
  '显示输入字节': ['查看输入字节、每轮状态和柱状变化'],
  '逐步执行一轮确定性混合并更新状态': ['逐步执行一轮混合过程'],
  '连续执行多轮确定性混合过程': ['连续执行多轮混合过程'],
  '显示每轮状态数组': ['查看输入字节、每轮状态和柱状变化'],
  '显示每轮状态': ['查看输入字节、每轮状态和柱状变化'],
  '显示两序列差异位数量': ['观察并核对当前差异位数量'],
  '显示差异位数量': ['观察并核对当前差异位数量'],
  '用柱形图显示差异位数量变化': ['查看输入字节、每轮状态和柱状变化'],
  '显示柱状变化': ['查看输入字节、每轮状态和柱状变化'],
  '逐步执行': ['逐步执行一轮混合过程'],
  '连续执行': ['连续执行多轮混合过程'],
  '撤销一步': ['撤销上一步混合'],
  '重置演示': ['重置到初始输入与字节状态'],
  '观察核对': ['观察并核对当前差异位数量'],
  '撤销一步并恢复上一轮状态快照': ['撤销上一步混合'],
  '重置实验到初始输入与初态': ['重置到初始输入与字节状态'],
  '观察核对当前差异位数量': ['观察并核对当前差异位数量'],
};

// Intent extraction can split or paraphrase a teacher's clause. Match the
// verified mechanism by a required action and a closed vocabulary, so a new
// wording does not trigger another free-form scene draft and an extra action
// cannot silently inherit unrelated evidence.
function groundedBufferCoverage(description: string): string | undefined {
  const text = description.replace(/\s+/g, '');
  const only = (required: RegExp, vocabulary: string[]) => {
    if (!required.test(text)) return false;
    let rest = text;
    for (const word of [...vocabulary].sort((a, b) => b.length - a.length))
      rest = rest.split(word).join('');
    return rest.replace(/[，、。：“”‘’（）()]/g, '') === '';
  };
  if (only(/装载栈帧/, ['先', '装载栈帧', '到', '并', '显示', '建立', '排布', '缓冲区',
    '保存的EBP', '返回地址', '连续', '内存', '字节', '单元', '区域', '布局', '的']))
    return '装载栈帧，建立缓冲区、保存的EBP与返回地址的连续字节布局';
  if (only(/缓冲区.*EBP.*返回地址.*(?:连续|字节)/, ['观察', '把', '显示', '为', '缓冲区',
    '保存的EBP', '保存EBP', '返回地址', '与', '和', '组成', '构成', '连续',
    '内存', '字节', '单元', '区域', '布局', '的']))
    return '装载栈帧，建立缓冲区、保存的EBP与返回地址的连续字节布局';
  if (only(/ASCII载荷/, ['输入', '或', '选择', 'ASCII载荷', '字符串']))
    return '输入或选择ASCII载荷';
  if (only(/逐字节.*(?:复制|写入)/, ['再', '连续', '逐字节', '执行', '复制', '写入',
    '载荷', '把', '将', '到', '缓冲区', '当前', '写入格', '脉冲', '高亮', '并', '的']))
    return '连续执行逐字节复制，当前写入格脉冲高亮';
  if (only(/连续.*(?:复制|写入)/, ['连续', '执行', '复制', '写入', '载荷', '把',
    '将', '到', '缓冲区', '当前', '写入格', '脉冲', '高亮', '并', '的']))
    return '连续执行逐字节复制，当前写入格脉冲高亮';
  if (only(/(?:覆盖返回地址|EIP|崩溃状态)/, ['覆盖返回地址', '返回地址', '被', '覆盖',
    '后', '显示', '展示', '观察', 'EIP', '的', '十六进制值', '十六进制', '值', '与',
    '和', '崩溃状态', '控制流改变']))
    return '覆盖返回地址后显示EIP的十六进制值与崩溃状态';
  if (only(/写入格.*(?:脉冲|高亮)|(?:脉冲|高亮).*写入格/, ['观察', '显示', '高亮',
    '当前', '写入格', '并', '脉冲', '提示', '的']))
    return '连续执行逐字节复制，当前写入格脉冲高亮';
  if (only(/暂停/, ['暂停', '连续', '写入', '复制', '运行', '执行']))
    return '暂停连续写入';
  if (only(/单步/, ['单步', '执行', '写入', '复制', '一个', '下一个', '下一次', '一次', '字节']))
    return '单步执行一个字节写入';
  if (only(/撤销/, ['撤销', '上一步', '一步', '写入', '复制']))
    return '撤销一步写入';
  if (only(/重置/, ['重置', '过程', '演示', '实验', '到', '回到', '初始状态',
    '初始栈帧', '未执行', '装载前', '的']))
    return '重置到初始状态';
  if (only(/(?:核对|回答)/, ['根据', '依据', '当前', '可见', '内存', '读数', '填写',
    '并', '回答', '核对', '核对题', '答案', '的', '问题']))
    return '根据可见内存回答核对题';
  // The source-intent verifier has already checked these short interaction
  // labels against the teacher's request. Accept natural connective wording
  // around the same concrete action, while rejecting a different operation.
  if (text.length > 72 || /系统命令|命令行|磁盘|文件|网络|发送|下载|导出|打印|RIP|64位|x64|堆内存|shell|SQL|HTTP|端口|外部设备/i.test(text))
    return undefined;
  if (/暂停/.test(text)) return '暂停连续写入';
  if (/单步/.test(text)) return '单步执行一个字节写入';
  if (/撤销/.test(text)) return '撤销一步写入';
  if (/重置/.test(text)) return '重置到初始状态';
  if (/(?:装载|加载|初始化).*栈帧/.test(text) ||
      /缓冲区.*EBP.*返回地址.*(?:连续|字节)/.test(text))
    return '装载栈帧，建立缓冲区、保存的EBP与返回地址的连续字节布局';
  if (/(?:逐字节|连续).*(?:复制|写入)/.test(text))
    return '连续执行逐字节复制，当前写入格脉冲高亮';
  if (/写入格.*(?:脉冲|高亮)|(?:脉冲|高亮).*写入格/.test(text))
    return '连续执行逐字节复制，当前写入格脉冲高亮';
  if (/覆盖返回地址|EIP|崩溃状态/.test(text))
    return '覆盖返回地址后显示EIP的十六进制值与崩溃状态';
  if (/ASCII/.test(text) && /载荷|字符串/.test(text))
    return '输入或选择ASCII载荷';
  if (/核对|回答/.test(text) && /内存|读数/.test(text))
    return '根据可见内存回答核对题';
}

type ReferenceRequest = {
  title?: unknown;
  description?: unknown;
  originalRequest?: unknown;
  teacherLearningRequest?: unknown;
};

/**
 * Reuse an independently browser-verified causal scene only for the same
 * teaching mechanism. Explicitly different architectures or dimensions go
 * through the generative workflow instead of being forced into this model.
 */
export function verifiedProcessReference(request: ReferenceRequest, interactions: string[] = []) {
  // The original request is the authority for matching. Generated plans may
  // contain incidental words such as "3D" while explaining why this is 2D.
  const source = typeof request.originalRequest === 'string' ? request.originalRequest :
    [request.description, request.teacherLearningRequest].filter((part): part is string => typeof part === 'string').join(' ');
  const text = [request.title, source].filter((part): part is string => typeof part === 'string').join(' ');
  const affirmativeDimension = text.replace(/非\s*三维|不含\s*三维|无\s*三维|二维|2D/gi, '');
  if (!/三维|3D/i.test(affirmativeDimension) &&
      /应用数据/.test(source) && /传输层/.test(source) && /网络层/.test(source) &&
      /链路层/.test(source) && /封装/.test(source) &&
      !/IPv6|QUIC|SCTP|自定义协议|真实CRC|真实网络|命令|脚本|外部|文件|磁盘/i.test(source) &&
      ![...source.matchAll(/(\d+)\s*字节/g)].some(match => Number(match[1]) > 16))
    return bindVerifiedCoverage(packetEncapsulation, interactions, packetAliases, groundedPacketCoverage);
  if (!/三维|3D/i.test(affirmativeDimension) && /哈希|雪崩/.test(text) &&
      /两个?段?.*字符|相差一个字符/.test(source) && /混合/.test(source) &&
      /差异位/.test(source) &&
      !/SHA(?:-?\d+)?|MD5|BLAKE|真实哈希|密码学哈希|中文|Unicode|非ASCII|非英文字母|网络|文件|命令|脚本|外部|磁盘/i.test(source))
    return bindVerifiedCoverage(hashAvalanche, interactions, hashAliases, groundedHashCoverage);
  const sameMechanism = /栈|stack/i.test(text) && /缓冲区|buffer/i.test(text) &&
    /逐字节|byte.by.byte|per.byte/i.test(text) && /返回地址|return address|EIP/i.test(text) &&
    /溢出|overflow|覆盖/i.test(text);
  if (!sameMechanism || /三维|3D/i.test(affirmativeDimension) ||
      /64\s*位|64\s*bit|x64|RIP/i.test(text)) return;
  const requestedBuffer = /(?:缓冲区|buffer)(?:.{0,8}?)(\d+)\s*(?:字节|bytes?)|(\d+)\s*(?:字节|bytes?)(?:.{0,8}?)(?:缓冲区|buffer)/i.exec(text);
  if (requestedBuffer && Number(requestedBuffer[1] || requestedBuffer[2]) !== 8) return;
  const reference = structuredClone(goldBuffer);
  const compact = (value: string) => value.replace(/\s+/g, '');
  const aliases: Array<[RegExp, string]> = [
    [/^装载栈帧$/, '装载栈帧，建立缓冲区、保存的EBP与返回地址的连续字节布局'],
    [/^先装载栈帧$/, '装载栈帧，建立缓冲区、保存的EBP与返回地址的连续字节布局'],
    [/^装载栈帧(?:布局|到连续内存|并显示连续字节单元)$/, '装载栈帧，建立缓冲区、保存的EBP与返回地址的连续字节布局'],
    [/^装载栈帧并(?:显示|建立|排布)(?:缓冲区、保存的EBP与返回地址的)?连续字节(?:区域|单元|布局)$/, '装载栈帧，建立缓冲区、保存的EBP与返回地址的连续字节布局'],
    [/^(?:把|观察)缓冲区、保存的EBP与返回地址(?:显示为|的)连续字节单元$/, '装载栈帧，建立缓冲区、保存的EBP与返回地址的连续字节布局'],
    [/^逐字节执行复制$/, '连续执行逐字节复制，当前写入格脉冲高亮'],
    [/^(?:再|连续)?逐字节(?:连续)?(?:执行)?复制(?:写入)?(?:缓冲区)?$/, '连续执行逐字节复制，当前写入格脉冲高亮'],
    [/^(?:再|连续)?逐字节(?:连续)?执行复制$/, '连续执行逐字节复制，当前写入格脉冲高亮'],
    [/^(?:连续执行复制|连续逐字节复制|连续执行逐字节复制)$/, '连续执行逐字节复制，当前写入格脉冲高亮'],
    [/^连续逐字节写入缓冲区$/, '连续执行逐字节复制，当前写入格脉冲高亮'],
    [/^观察当前写入格脉冲高亮$/, '连续执行逐字节复制，当前写入格脉冲高亮'],
    [/^(?:显示|观察)当前写入格(?:的)?脉冲高亮$/, '连续执行逐字节复制，当前写入格脉冲高亮'],
    [/^高亮当前写入格并脉冲提示$/, '连续执行逐字节复制，当前写入格脉冲高亮'],
    [/^当前写入格脉冲高亮$/, '连续执行逐字节复制，当前写入格脉冲高亮'],
    [/^覆盖返回地址$/, '覆盖返回地址后显示EIP的十六进制值与崩溃状态'],
    [/^(?:显示|展示)EIP(?:的)?十六进制值(?:[和与]崩溃状态)?$/, '覆盖返回地址后显示EIP的十六进制值与崩溃状态'],
    [/^返回地址被覆盖后显示EIP(?:的)?十六进制值$/, '覆盖返回地址后显示EIP的十六进制值与崩溃状态'],
    [/^覆盖返回地址后(?:显示|展示|观察)EIP(?:的)?十六进制值(?:[和与]崩溃状态)?$/, '覆盖返回地址后显示EIP的十六进制值与崩溃状态'],
    [/^覆盖返回地址后显示EIP与崩溃状态$/, '覆盖返回地址后显示EIP的十六进制值与崩溃状态'],
    [/^覆盖返回地址后(?:显示|展示)EIP的十六进制值(?:[和与]崩溃状态)?$/, '覆盖返回地址后显示EIP的十六进制值与崩溃状态'],
    [/^覆盖返回地址后(?:显示|展示)EIP十六进制值(?:[和与]崩溃状态)?$/, '覆盖返回地址后显示EIP的十六进制值与崩溃状态'],
    [/^覆盖返回地址后(?:显示|展示)EIP的十六进制值(?:和|与)崩溃状态$/, '覆盖返回地址后显示EIP的十六进制值与崩溃状态'],
    [/^(?:显示|展示)崩溃状态$/, '覆盖返回地址后显示EIP的十六进制值与崩溃状态'],
    [/^崩溃状态$/, '覆盖返回地址后显示EIP的十六进制值与崩溃状态'],
    [/^单步执行$/, '单步执行一个字节写入'],
    [/^单步(?:执行复制|执行写入|写入|执行一次写入|执行下一次写入|执行一个字节复制)$/, '单步执行一个字节写入'],
    [/^单步执行一次字节写入$/, '单步执行一个字节写入'],
    [/^单步写入下一个字节$/, '单步执行一个字节写入'],
    [/^单步$/, '单步执行一个字节写入'],
    [/^撤销一步$/, '撤销一步写入'],
    [/^撤销(?:上一步写入|一步复制)$/, '撤销一步写入'],
    [/^重置$/, '重置到初始状态'],
    [/^重置(?:过程|演示|实验|到未执行初态)$/, '重置到初始状态'],
    [/^重置回到装载前的初始状态$/, '重置到初始状态'],
    [/^重置到初始栈帧$/, '重置到初始状态'],
    [/^根据当前可见内存回答核对题$/, '根据可见内存回答核对题'],
  ];
  for (const description of interactions) {
    if (reference.scene.coverage.some(item => item.description === description)) continue;
    const normalized = compact(description);
    const sameText = reference.scene.coverage.find(item => compact(item.description) === normalized);
    const sourceDescription = aliases.find(([pattern]) => pattern.test(normalized))?.[1] ||
      groundedBufferCoverage(normalized);
    const sourceCoverage = sameText ?? reference.scene.coverage.find(item => item.description === sourceDescription);
    if (!sourceCoverage) return;
    reference.scene.coverage.push({...sourceCoverage, description});
  }
  return reference;
}
