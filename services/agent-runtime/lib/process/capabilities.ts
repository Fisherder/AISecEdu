import type {ProcessScene} from './schema';

export function isObjectSelectionInput(input:ProcessScene['inputs'][number]):boolean {
  return input.mode==='live'&&/select|index|evidence|node|device|object|source|target|file|path|record|dataset|table|resource|选|下标|证据|对象|目标|设备|文件|来源|记录|路径|邮件|数据集|文档|资料/i.test(input.id+' '+input.label)&&
    (input.type==='select'||['number','range'].includes(input.type)&&input.min===0&&input.step===1&&Number.isInteger(input.max));
}

export const PROCESS_APPEARANCE_BRIEF = '播放器实际标记样式：数组activeIndex为橙色边框并抬升当前格；当本步写入改变该格的值时，changed会触发缩放、青色高亮与向外淡出的脉冲环；markedIndices为深青绿色底色，不是灰色或红色。数组regions支持固定整数边界，也支持读取当前state的表达式边界；固定end含尾格，表达式end不含尾格。尚未出现的区域用start=0、end=0的表达式隐藏；出现后边界必须落在当前数组内。按从左到右的区域顺序交替着色，不能自定义每个区域的颜色。柱形activeIndex为橙色填充，markedIndices为橙色外框。默认不支持每个view自定义标记颜色。说明优先写“带底色的格”“橙框中点”等真实观察证据；不能凭标题或文案承诺不存在的颜色。';

export const PROCESS_RUNTIME_BEHAVIOR_BRIEF =
  '运行时重置恢复initialState和inputs.default；inputs.mode省略或reset时修改条件会重新开始，mode=live时修改保留当前领域状态并可撤销。live适合实验中的调节、对象选择、策略参数；reset适合重新装载源数据。暂停只停止自动运行。决策选择不是播放控制：decisions声明情境when、2–6个choices动作ID及observe状态字段；学生选一个动作后用真实updates改变结果，自动执行遇到决策点停止。回到决策点恢复相同状态、输入与记录，保存原方案的结果供本地比较，不重新生成；重置才清空比较。questions核对当前证据，状态/输入变化会清空旧答案。';

export const PROCESS_LEARNING_QUESTION_BRIEF =
  '区分学习问题与自动核对题：选定方案中的所有知识问题都要保留在学生可见内容中，但口头预测、“为什么”、比较多次实验、概括规律等开放讨论题应在阶段说明或text视图中呈现，并用当前证据和因果解释辅助学生思考；不能伪装成只接受一种固定措辞的自动评分。questions仅用于立即核对当前可见的单一数值或简短读数，如当前字节、数量、索引；evidenceView必须对应真实显示的值。不能遗漏已选方案中的讨论问题，也不能仅因为它们没有成为questions中的输入框就判定缺失。教师明确要求自动评价开放回答时，应说明当前能力缺口，不改成机械字符串匹配。';

export function requestedEvidenceQuestionCount(request:Record<string,unknown>):number {
  const text=[request.originalRequest,request.description].filter(part=>typeof part==='string').join('\n');
  if(!/(?:核对题|观察题|数值题|读数题|quiz|verification question)/i.test(text))return 0;
  if(/(?:无需|不要|不需要).{0,6}(?:核对题|观察题|数值题|读数题)/.test(text))return 0;
  const count=/([一二两三四五六1-6])(?:道|个).{0,6}(?:题|问题|核对)/.exec(text);
  return count?(count[1]==='两'?2:Number(count[1])||'一二三四五六'.indexOf(count[1])+1):1;
}

export const PROCESS_EXPLANATION_EVIDENCE_BRIEF =
  '学生说明也必须随证据成立：标题、summary、stages.explanation是静态文字，不能把某组测试或预设的结果写成对所有输入都成立的当前事实。动态当前数值应由views.value或actions.feedback读取实际input/state计算；静态算例必须明确写出完整输入、必要初值与“例如”，一般规律用条件和因果关系说明。输入长度相同不代表字符、字节、数量或最终结果相同。审查修正建议同样遵守此规则，不能把actualTests中的单个数值直接写进通用阶段说明；计算测试通过也不能代替文字正确性。验证时应包含至少一组保持长度或操作次数相同但内容/参数不同的对照（当输入领域允许），用来检查模型及学生说明是否错误依赖某个固定样例。';

export const PROCESS_DECISION_BRIEF =
  '新演示默认采用决策探索：至少一个真实情境有2–6个同时可执行、因果不同的领域选择，由学生判断后操作。decisions:[{id,prompt,when:布尔表达式,choices:[动作ID],observe:[{field:初态状态变量ID,label:结果证据名称}]}]。同起点不同选择必须改变实际可见数值或结构证据（例如传播范围/设备状态/业务损失/内存写入），不能仅改phase、选项标签、日志或固定解释。不把正确答案预先写进选择描述；失败或不理想选择也产生可观察结果，允许回到决策点改进。可设计连续的观察→选择→后果→修正，而非每次都点下一步。过程推进仍可连续，但不能自动替学生作决策。observe字段由内置比较表显示；核心结果也用结构图或数值视图呈现。同一状态最多一个决策点。没有选择的播放、时间线、相机移动、输入框不算决策。只有教师明确限定纯观察、固定逐步顺序且不要选择时才可省略decisions。';

export const PROCESS_PRODUCT_QUALITY_BRIEF =
  '完整成品形成探索闭环：观察当前情境→直接操作对象或实时调参→作领域决策→看到同步因果证据与即时反馈→返回同一起点尝试另一方案→比较后果并解释。决策实验至少有场景证据、真实状态读数与同起点比较，至少1个array/bars/code/topology结构视图，按实际教学需要组织视图；情境与后果可为两阶段。教师要求的核对题须保留，否则核对题可选。3组真实执行测试覆盖不同选择、边界和恢复；不同选择在至少一种合法条件下有真实后果差异，边界下结果相同可以成立。字节内存应展示代码、区域字节格、活动位置与寄存器，不硬套其他主题。完成和风险由模型计算，不能用弹窗或装饰动画冒充。';

export const PROCESS_PLANNING_BRIEF = `三方案规划应保留教师全部要求，区别在具体领域决策、对象操作、反馈与证据组织。高级互动是默认能力；有意义时设计决策、实时调节和结果比较，不为凑数量添加无关评分或独立实验。每份方案明确学生要判断什么、能选择什么、不同选择如何影响领域状态、如何比较和修正。
真实显示能力：array、bars、topology的pick:{input:live数值或select输入ID,action?:动作ID}把学生点击的对象下标写入输入，并可原子执行领域动作。用activeIndex绑定{input:选中下标ID}显示当前选择；下标范围与对象数量匹配。实际选择可用于隔离节点、写入位置、控制目标等，不能只读说明。数值、文本、代码、数组、柱形和拓扑读取真实状态。markedIndices表示已处理对象；regions绑定状态边界。不要承诺尚未实现的拖拽、任意物理引擎、完整CPU仿真或正式评分。
实时参数mode=live不中断领域进展；源数据mode=reset重新装载。回到决策点和方案比较由播放器内置，不能生成假的“恢复”状态或另用AI调用。自动评分只核对当前读数；开放讨论在说明或text中结合证据呈现，不机械匹配。暂停、撤销、重置、连续执行仍由播放器负责，actions只写领域操作。已选方案的功能必须真实落实，不用文案代替。`;

export const PROCESS_CAPABILITY_BRIEF = `${PROCESS_RUNTIME_BEHAVIOR_BRIEF}\n${PROCESS_APPEARANCE_BRIEF}\n${PROCESS_PLANNING_BRIEF}\n${PROCESS_DECISION_BRIEF}\n${PROCESS_LEARNING_QUESTION_BRIEF}\n${PROCESS_EXPLANATION_EVIDENCE_BRIEF}\n${PROCESS_PRODUCT_QUALITY_BRIEF}
决策探索型过程使用candidate.generate + artifactType=simulation、interactive-2d、twoDimensionalFormat=simulation。一个页面由确定性领域状态计算结构、读数、阶段和反馈，不拆成逐页幻灯片。学生输入代码不执行，不连接真实设备。三维空间与镜头功能不能代替领域决策；按需采用相同状态转移与模型绑定。反馈文案面向学生，不展示生成命令。`;
