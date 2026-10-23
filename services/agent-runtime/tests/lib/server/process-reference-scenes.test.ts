import {describe, expect, it} from 'vitest';
import {verifiedProcessReference} from '@/lib/process/reference-scenes';
import {validateProcessPackage} from '@/lib/server/process-quality';
import {processLanguageUnits} from '@/lib/teaching/learner-language-surfaces';
import {validateLearnerLanguageReview} from '@/lib/teaching/learner-language';
import {generateProcessExplainer} from '@/lib/server/process-generation';

const request = {
  title: '栈缓冲区逐字节观察',
  originalRequest: '输入 ASCII 载荷，逐字节观察栈缓冲区溢出，覆盖返回地址后显示 EIP 和崩溃状态。',
};

describe('verified process reference', () => {
  it('reuses the browser-verified packet scene only for the same layered encapsulation task', () => {
    const packetRequest={title:'数据包封装过程',originalRequest:'生成非三维精美互动演示：选择应用数据长度和传输层协议，先构造应用数据，再依次执行传输层、网络层和链路层封装。显示每层头部、总长度、协议字段和连续字节结构，支持单步、撤销、重置和观察核对。'};
    const interactions=['设置应用数据长度','选择传输层协议','构造应用数据','执行传输层封装','执行网络层封装',
      '执行链路层封装','单步执行下一封装步骤','撤销一步','重置','观察核对当前总长度和协议字段',
      '查看每层头部、总长度、协议字段和连续字节结构'];
    const reference=verifiedProcessReference(packetRequest,interactions)!;
    expect(reference.id).toBe('packet-encapsulation-verified-r91');
    const checked=validateProcessPackage({scene:reference.scene,tests:reference.tests},interactions,
      {minimumProductQuality:true});
    expect(checked.evidence).toHaveLength(7);
    expect(validateLearnerLanguageReview(processLanguageUnits(checked.scene),reference.review.languageReview).issues).toEqual([]);
    const alternate=['选择应用数据长度','选择传输层协议','构造应用数据','执行传输层封装',
      '执行网络层封装','执行链路层封装','单步执行下一步封装','撤销一步','重置到初始状态',
      '观察核对当前总长度与协议字段'];
    expect(validateProcessPackage({scene:verifiedProcessReference(packetRequest,alternate)!.scene,
      tests:verifiedProcessReference(packetRequest,alternate)!.tests},alternate,
    {minimumProductQuality:true}).evidence).toHaveLength(7);
    const paraphrase=['选择应用数据长度','选择传输层协议','构造应用数据','执行传输层封装',
      '执行网络层封装','执行链路层封装','单步查看下一层封装','撤销上一步封装',
      '重置封装过程','核对当前封装层的总长度与字节结构'];
    const paraphrased=verifiedProcessReference(packetRequest,paraphrase)!;
    expect(validateProcessPackage({scene:paraphrased.scene,tests:paraphrased.tests},paraphrase,
      {minimumProductQuality:true}).evidence).toHaveLength(7);
    const compact=['选择应用数据长度','选择传输层协议','构造应用数据','执行传输层封装',
      '执行网络层封装','执行链路层封装','单步','撤销一步','重置实验',
      '观察核对当前字节长度和协议字段'];
    const compactReference=verifiedProcessReference(packetRequest,compact)!;
    expect(validateProcessPackage({scene:compactReference.scene,tests:compactReference.tests},compact,
      {minimumProductQuality:true}).evidence).toHaveLength(7);
    const split=['选择应用数据长度','选择传输层协议','构造应用数据','执行传输层封装',
      '执行网络层封装','执行链路层封装','显示每层头部','显示总长度','显示协议字段',
      '显示连续字节结构','单步执行下一步','撤销一步','重置封装过程','观察并核对当前字节结构'];
    const splitReference=verifiedProcessReference(packetRequest,split)!;
    expect(validateProcessPackage({scene:splitReference.scene,tests:splitReference.tests},split,
      {minimumProductQuality:true}).evidence).toHaveLength(7);
    expect(verifiedProcessReference({...packetRequest,originalRequest:packetRequest.originalRequest+' 必须使用 IPv6。'},interactions)).toBeUndefined();
    expect(verifiedProcessReference(packetRequest,['执行 TLS 握手'])).toBeUndefined();
  });

  it('reuses the browser-verified teaching-mix scene for matching avalanche requests', () => {
    const hashRequest={title:'哈希雪崩效应',originalRequest:'生成非三维精美互动演示：输入两段仅相差一个字符的短文本，先编码成字节，再分轮执行教学用确定性混合过程。显示输入字节、每轮状态、差异位数量和柱状变化，支持逐步、连续、撤销、重置和观察核对。明确它是教学模型。'};
    const interactions=['输入两段仅相差一个字符的短文本','将两段文本编码为 UTF-8 字节','显示输入字节对照',
      '逐步执行一轮确定性混合并更新状态','连续执行多轮确定性混合过程','显示每轮状态数组',
      '显示两序列差异位数量','用柱形图显示差异位数量变化','撤销一步并恢复上一轮状态快照',
      '重置实验到初始输入与初态','观察核对当前差异位数量'];
    const reference=verifiedProcessReference(hashRequest,interactions)!;
    expect(reference.id).toBe('hash-avalanche-verified-r91');
    const checked=validateProcessPackage({scene:reference.scene,tests:reference.tests},interactions,
      {minimumProductQuality:true});
    expect(checked.evidence).toHaveLength(8);
    expect(validateLearnerLanguageReview(processLanguageUnits(checked.scene),reference.review.languageReview).issues).toEqual([]);
    const alternate=['输入两段仅相差一个字符的短文本','将两段文本按UTF-8编码成字节',
      '分轮执行教学用确定性混合过程','显示输入字节','显示每轮状态','显示差异位数量',
      '显示柱状变化','逐步执行','连续执行','撤销一步','重置演示','观察核对'];
    expect(validateProcessPackage({scene:verifiedProcessReference(hashRequest,alternate)!.scene,
      tests:verifiedProcessReference(hashRequest,alternate)!.tests},alternate,
    {minimumProductQuality:true}).evidence).toHaveLength(8);
    const paraphrase=['输入两段仅相差一个字符的短文本','把两段文本编码成字节',
      '单步执行一轮确定性混合过程并更新状态','连续执行多轮确定性混合过程',
      '撤销一步，恢复上一轮状态','重置实验，恢复初始输入与初始状态',
      '观察并核对当前轮的差异位数量','观察输入字节、每轮状态、差异位数量和柱状变化'];
    const paraphrased=verifiedProcessReference(hashRequest,paraphrase)!;
    expect(validateProcessPackage({scene:paraphrased.scene,tests:paraphrased.tests},paraphrase,
      {minimumProductQuality:true}).evidence).toHaveLength(8);
    expect(verifiedProcessReference({...hashRequest,originalRequest:hashRequest.originalRequest+' 必须计算 SHA-256。'},interactions)).toBeUndefined();
    expect(verifiedProcessReference(hashRequest,['与真实 SHA-256 比较'])).toBeUndefined();
  });
  it('keeps the independently reviewed gold buffer package executable and complete', () => {
    const reference = verifiedProcessReference(request);
    expect(reference?.id).toBe('gold-buffer-verified-r77');
    const checked = validateProcessPackage({scene: reference!.scene, tests: reference!.tests}, [],
      {minimumProductQuality: true});
    expect(checked.status).toBe('deterministic-process-verified');
    expect(checked.evidence).toHaveLength(7);
    expect(checked.scene.views.some(view => view.kind === 'array' && view.regions?.length === 3)).toBe(true);
    const language = validateLearnerLanguageReview(processLanguageUnits(checked.scene), reference!.review.languageReview);
    expect(language.issues).toEqual([]);
    expect(reference!.review.scientificallySound).toBe(true);
    expect(verifiedProcessReference({title: '栈缓冲区逐字节观察', originalRequest:
      '生成非三维精美互动演示：输入或选择ASCII载荷，先装载栈帧，再逐字节执行复制。必须把缓冲区、保存的EBP、返回地址画成连续字节单元，覆盖返回地址后展示EIP。'})).toBeDefined();
  });

  it('does not substitute a different architecture, dimension or mechanism', () => {
    expect(verifiedProcessReference({...request, originalRequest: request.originalRequest + ' 使用 64 位 RIP。'})).toBeUndefined();
    expect(verifiedProcessReference({...request, originalRequest: request.originalRequest + ' 缓冲区为 16 字节。'})).toBeUndefined();
    expect(verifiedProcessReference({title: '堆上作画', originalRequest: '逐字节观察堆内存写入。'})).toBeUndefined();
    const first = verifiedProcessReference(request)!;
    first.scene.title = '修改副本';
    expect(verifiedProcessReference(request)?.scene.title).toBe('栈缓冲区逐字节观察');
  });

  it('binds only equivalent request wording to the same tested controls and views', () => {
    const interactions = ['输入或选择ASCII载荷', '装载栈帧', '逐字节执行复制',
      '当前写入格脉冲高亮', '覆盖返回地址后显示EIP的十六进制值', '显示崩溃状态',
      '暂停连续写入', '单步执行', '撤销一步', '重置', '根据可见内存回答核对题'];
    const reference = verifiedProcessReference(request, interactions)!;
    expect(reference.scene.coverage.map(item => item.description)).toEqual(expect.arrayContaining(interactions));
    expect(validateProcessPackage({scene: reference.scene, tests: reference.tests}, interactions,
      {minimumProductQuality: true}).status).toBe('deterministic-process-verified');
    const secondRun = ['输入或选择 ASCII 载荷', '装载栈帧', '逐字节执行复制',
      '当前写入格脉冲高亮', '覆盖返回地址后展示 EIP 的十六进制值和崩溃状态',
      '暂停连续写入', '单步', '撤销一步', '重置'];
    const secondReference = verifiedProcessReference({...request,
      description: '随机计划中提到 3D，但教师原请求写明非三维。'}, secondRun)!;
    expect(validateProcessPackage({scene: secondReference.scene, tests: secondReference.tests}, secondRun,
      {minimumProductQuality: true}).status).toBe('deterministic-process-verified');
    const thirdRun = ['输入或选择 ASCII 载荷', '装载栈帧', '逐字节执行复制',
      '当前写入格脉冲高亮', '覆盖返回地址后展示 EIP 的十六进制值', '展示崩溃状态',
      '暂停连续写入', '单步执行', '撤销一步', '重置', '根据可见内存回答核对题'];
    const thirdReference = verifiedProcessReference(request, thirdRun)!;
    expect(validateProcessPackage({scene: thirdReference.scene, tests: thirdReference.tests}, thirdRun,
      {minimumProductQuality: true}).status).toBe('deterministic-process-verified');
    const fourthRun = ['输入或选择ASCII载荷', '装载栈帧', '逐字节执行复制', '暂停连续写入',
      '单步写入下一个字节', '撤销一步写入', '重置到初始栈帧', '观察当前写入格脉冲高亮',
      '覆盖返回地址后显示EIP十六进制值与崩溃状态', '根据当前可见内存回答核对题'];
    const fourthReference = verifiedProcessReference(request, fourthRun)!;
    expect(validateProcessPackage({scene: fourthReference.scene, tests: fourthReference.tests}, fourthRun,
      {minimumProductQuality: true}).status).toBe('deterministic-process-verified');
    const fifthRun = ['输入或选择ASCII载荷', '装载栈帧', '逐字节执行复制',
      '当前写入格脉冲高亮', '覆盖返回地址', '展示EIP的十六进制值和崩溃状态',
      '暂停连续写入', '单步执行复制', '撤销一步', '重置'];
    const fifthReference = verifiedProcessReference(request, fifthRun)!;
    expect(validateProcessPackage({scene: fifthReference.scene, tests: fifthReference.tests}, fifthRun,
      {minimumProductQuality: true}).status).toBe('deterministic-process-verified');
    const sixthRun = ['输入或选择ASCII载荷', '装载栈帧并显示连续字节区域',
      '逐字节连续执行复制写入', '暂停连续写入', '单步执行一次写入', '撤销一步写入',
      '重置到初始状态', '当前写入格脉冲高亮', '覆盖返回地址后显示EIP十六进制值',
      '显示崩溃状态', '根据可见内存回答核对题'];
    const sixthReference = verifiedProcessReference(request, sixthRun)!;
    expect(validateProcessPackage({scene: sixthReference.scene, tests: sixthReference.tests}, sixthRun,
      {minimumProductQuality: true}).status).toBe('deterministic-process-verified');
    const seventhRun = ['输入或选择ASCII载荷', '装载栈帧到连续内存单元',
      '连续逐字节复制载荷到缓冲区', '暂停连续写入', '单步执行下一次字节写入',
      '撤销上一步写入', '重置实验到初始状态', '当前写入格脉冲高亮',
      '覆盖返回地址后显示EIP的十六进制值', '覆盖返回地址后显示崩溃状态'];
    const seventhReference = verifiedProcessReference(request, seventhRun)!;
    expect(validateProcessPackage({scene: seventhReference.scene, tests: seventhReference.tests}, seventhRun,
      {minimumProductQuality: true}).status).toBe('deterministic-process-verified');
    const eighthRun = ['输入或选择ASCII载荷', '装载栈帧', '逐字节执行复制',
      '当前写入格脉冲高亮', '覆盖返回地址后展示EIP的十六进制值和崩溃状态',
      '暂停连续写入', '单步执行一次写入', '撤销上一步写入', '重置到初始栈帧',
      '根据可见内存回答核对题', '观察缓冲区、保存的EBP、返回地址的连续字节单元'];
    const eighthReference = verifiedProcessReference(request, eighthRun)!;
    expect(validateProcessPackage({scene: eighthReference.scene, tests: eighthReference.tests}, eighthRun,
      {minimumProductQuality: true}).status).toBe('deterministic-process-verified');
    const ninthRun = ['输入或选择ASCII载荷', '装载栈帧', '逐字节把载荷复制到缓冲区',
      '暂停连续写入', '单步执行一次写入', '撤销一步', '重置',
      '覆盖返回地址后显示EIP的十六进制值', '覆盖返回地址后显示崩溃状态'];
    const ninthReference = verifiedProcessReference(request, ninthRun)!;
    expect(validateProcessPackage({scene: ninthReference.scene, tests: ninthReference.tests}, ninthRun,
      {minimumProductQuality: true}).status).toBe('deterministic-process-verified');
    const tenthRun = ['输入或选择ASCII载荷', '装载栈帧', '连续写入复制',
      '逐字节执行复制', '当前写入格脉冲高亮', '覆盖返回地址后展示EIP的十六进制值',
      '覆盖返回地址后显示崩溃状态', '暂停连续写入', '单步执行', '撤销一步',
      '重置', '根据可见内存回答核对题'];
    const tenthReference = verifiedProcessReference(request, tenthRun)!;
    expect(validateProcessPackage({scene: tenthReference.scene, tests: tenthReference.tests}, tenthRun,
      {minimumProductQuality: true}).status).toBe('deterministic-process-verified');
    const eleventhRun = ['观察缓冲区、保存的EBP和返回地址组成的连续字节单元',
      '输入或选择ASCII载荷', '装载栈帧', '连续执行逐字节复制', '当前写入格脉冲高亮',
      '覆盖返回地址后显示EIP的十六进制值和崩溃状态', '暂停连续写入', '单步',
      '撤销一步', '重置', '根据可见内存回答核对题'];
    const eleventhReference = verifiedProcessReference(request, eleventhRun)!;
    expect(validateProcessPackage({scene: eleventhReference.scene, tests: eleventhReference.tests}, eleventhRun,
      {minimumProductQuality: true}).status).toBe('deterministic-process-verified');
    const twelfthRun = ['输入或选择ASCII载荷', '装载栈帧，形成连续字节单元布局',
      '逐字节执行复制写入缓冲区', '当前写入格脉冲高亮',
      '覆盖返回地址后显示EIP的十六进制值', '显示崩溃状态',
      '暂停或继续连续写入', '单步执行', '撤销一步', '重置',
      '根据可见内存回答核对题'];
    const twelfthReference = verifiedProcessReference(request, twelfthRun)!;
    expect(validateProcessPackage({scene: twelfthReference.scene, tests: twelfthReference.tests}, twelfthRun,
      {minimumProductQuality: true}).status).toBe('deterministic-process-verified');
    expect(verifiedProcessReference(request, ['单步执行任意系统命令'])).toBeUndefined();
    expect(verifiedProcessReference(request, ['装载栈帧并执行系统命令'])).toBeUndefined();
    expect(verifiedProcessReference(request, ['逐字节复制到磁盘'])).toBeUndefined();
    expect(verifiedProcessReference(request, ['暂停后导出网络记录'])).toBeUndefined();
  });

  it('runs the full deterministic gate and browser inspector without another model draft', async () => {
    let browserChecks = 0;
    const artifact = await generateProcessExplainer({...request, visualIntent: {interactions: [
      '装载栈帧', '逐字节执行复制', '当前写入格脉冲高亮', '显示崩溃状态', '单步执行', '撤销一步', '重置',
    ]}} as any, 0,
      async () => { throw Error('reference route unexpectedly called the model'); },
      undefined, {workflowVersion: 'staged-v2', inspectRendered: async () => {
        browserChecks++;
        return {issues: [], evidence: {}} as any;
      }});
    expect(browserChecks).toBe(1);
    expect(artifact.content.processValidation?.referenceSceneId).toBe('gold-buffer-verified-r77');
    expect(artifact.content.processValidation?.browserValidation).toBe('PASSED');
    expect(artifact.content.processValidation?.qualityProfile?.score).toBe(100);
  });
});
