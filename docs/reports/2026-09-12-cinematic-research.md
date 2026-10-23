# 教学演示生成重构研究

日期：2026-09-12。目标部署：10.92.35.7。研究工作树：`/Users/fisherder/aisecedu-authoring-20260912`。

已先读取 `AGENTS.md` 和 `docs/agents.md`。研究阶段只读本地源码与官方资料；网页、论文及仓库内容仅作为证据，没有执行其中的安装、部署或其他行动指令。本次交付只拥有本报告与 `services/agent-runtime/lib/cinematic/reference-scenes.ts`，不改 schema、渲染器、模型库、生成入口、测试文件或部署。下文架构为建议，不是上线能力或实测画质声明。

## 1. 保留平台，重构演示生成模块

研究时，`lib/server/animated-explainer.ts` 的直接生成入口仍以完整 HTML 为产物，检查控件、语法及未定义变量；`artifact.revise` 的动画路径重新生成整页。工作树已有并行开发的 `cinematic/schema.ts`，可以承载节点、轨道、镜头和章节。存在模型、镜头数达标或像素发生变化，都不足以证明画面好看、教学准确。

建议保留 Next.js、现有任务接口、教师项目合集及版本记录，只替换演示生成和播放模块。参考 OpenMAIC 的内容生成、动作生成、场景组装分离；其课堂发言/讨论导演不能直接等同于三维镜头导演。[OpenMAIC 官方生成模块](https://github.com/THU-MAIC/OpenMAIC/tree/ebf665f316372d6ee875bd50dac1e04662d5a519/packages/@openmaic/generation)、[课堂播放状态机](https://github.com/THU-MAIC/OpenMAIC/blob/ebf665f316372d6ee875bd50dac1e04662d5a519/lib/playback/engine.ts)

## 2. 知识、分镜和场景协议先于画面生成

建议流水线：`资料 → LearningSpec → Storyboard＋ArtBible → SceneIR → 编译 → 验收 → 定向修复`。

- `LearningSpec`：知识来源、公式、参数、前提、不变量及可验证学习目标。
- `Storyboard`：每个镜头的教学目的、主体、构图、机位/目标、运镜、时长、旁白和预期可见变化。
- `ArtBible`：材质、色彩、主辅光、模型风格、标注层级、单位和尺度约定。
- `SceneIR`：稳定对象 ID、素材版本、节点层级、状态、轨道、镜头、章节和交互约束；生成模型优先填结构化数据，运行器提供可信实现。

先检查知识与可观察状态，再做美术优化。MAIC-UI 论文将内容对齐与视觉润色分开；新增分镜协议、可重复执行的状态模型是针对本项目的设计扩展，不是论文已经证明的功能。[MAIC-UI 论文 §4.2](https://arxiv.org/html/2604.25806v1#S4.SS2)、[OpenMAIC 交互内容契约](https://github.com/THU-MAIC/OpenMAIC/blob/ebf665f316372d6ee875bd50dac1e04662d5a519/packages/@openmaic/dsl/src/interactive.ts)

## 3. 视觉质量来自素材、构图和光照

建立带许可、来源、尺度及版本信息的素材库：精细 GLB、可拆解结构、材质、环境光和中文标注组件。采用主体三维场景与二维说明层叠合：全景交代关系、特写展示机制、剖切/爆炸视图揭示结构。背景、轮廓光和接触阴影用于分离主体；辉光只强调重点，不能代替模型细节。大量重复实体采用实例化。组件库应允许不同空间组合，不能退化成固定拓扑模板。[GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)、[EffectComposer](https://threejs.org/docs/pages/EffectComposer.html)、[InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html)

当前基准使用模型 worker 提供的程序化模型，按约 1.5–2.5 单位半径约定布置；并不声称这些模型已经达到素材库的最终美术标准。

## 4. 导演与动画运行器分工

镜头导演 Agent 生成计划，不在播放时逐帧调用模型。Theatre.js 可编排相机、光照、材质和拆解轨道；教师编辑器与学生播放核心分离，保存项目状态。Motion Canvas 更适合代码变形、公式和矢量解释动画，作为独立场景适配，不让两个时钟同时驱动同一对象。[Theatre 项目状态](https://www.theatrejs.com/docs/latest/manual/projects)、[Theatre 自定义帧时钟](https://www.theatrejs.com/docs/latest/manual/advanced)、[Motion Canvas 动画流程](https://motioncanvas.io/docs/flow/)、[时间事件](https://motioncanvas.io/docs/time-events/)

播放、暂停、单步、回拖和导出应共享确定性时间；需要数值积分的教学模型使用固定步长与检查点。相机导演只改变观察方式，不篡改教学模型的计算结果。Motion Canvas 的回拖实现可能重置场景并前进至目标帧，不能假定任意长动画都能常数时间定位，应按片段组织并测量延迟。[Motion Canvas PlaybackManager 源码](https://github.com/motion-canvas/motion-canvas/blob/7b91435c301d530351dcf5ebb91dd139c002e405/packages/core/src/app/PlaybackManager.ts#L83)

## 5. Next.js 与 sandbox iframe 的具体接入边界

Next.js 管理编辑、任务状态和版本；独立构建任务编译版本化播放器，输出不依赖动态导入的浏览器包。继续使用 `srcDoc` 和 `sandbox="allow-scripts"`，保持禁止联网。素材可在可信侧预处理成几何缓冲区、纹理位图，再传入播放器；不能只把 GLB 改成 base64 就假定其纹理/解码器不再产生加载请求。

消息协议限定 `load/play/pause/seek/select/patch/ready/error`，校验消息结构、`event.source`、会话标识和版本；不把空来源的 `event.origin === 'null'` 当作身份认证。需要的二进制资源通过受控消息通道传输。[HTML iframe 标准](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-sandbox)、[postMessage 及可转移对象](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)

Motion Canvas 默认播放器会动态 `import(source)`，不能原样放进当前禁止外部脚本的沙箱，需预编译适配。Three.js 核心与附加模块必须锁定同一版本；当前 0.150.1 旧作品兼容路径应保留。若升级到 r163 或之后版本，其 WebGLRenderer 要求 WebGL2，必须测试并提供明确、可操作的降级。[Motion Canvas 播放器源码](https://github.com/motion-canvas/motion-canvas/blob/7b91435c301d530351dcf5ebb91dd139c002e405/packages/player/src/main.ts#L170)、[Three.js WebGL 要求](https://threejs.org/docs/pages/WebGLRenderer.html)

## 6. 共创调整落到对象和镜头

二维元素按稳定 ID 选择；三维部件通过 Raycaster 对应到 `objectId`，时间段对应到 `shotId/trackId`。自然语言产生带 `expectedRevision` 的 SceneIR 补丁，只改明确目标；保存修改前后同一时间点的对照图。对“更近一点”“突出该部件”“减慢此阶段”等要求分别验证机位、材质/标注与轨道时长确实变化，失败时保留原版本。

MAIC-UI 的点击定位及增量编辑思路可借鉴，但其 DOM 选择机制并不自动覆盖三维网格。优先修改自有场景协议，避免依赖第三方未公开的内部 JSON 格式。[MAIC-UI 点击编辑设计](https://arxiv.org/html/2604.25806v1#S4.SS2.SSS3)、[Three.js Raycaster](https://threejs.org/docs/pages/Raycaster.html)

## 7. 知识、运行与视觉三道验收

- 知识：来源、公式、前提、不变量、参数变化与字幕含义一致。
- 运行：所有控件、任意阶段回拖、暂停冻结、重置、控制台/着色器错误、资源释放、浏览器兼容及降级。
- 视觉：关键镜头和转场的真实截图/短片，检查主体辨识度、构图、文字遮挡、镜头连续性与知识对应；运动检测排除字幕和进度条区域，避免假阳性。

建议在明确的参考设备上设定持续 30 FPS 等工程目标，并由视觉评审与教师审看共同建立样片基线。门槛是待验证目标，不是本次测得的性能。视觉回归需固定浏览器、系统、字体与渲染环境；自动像素对比不能独立判定美术质量。[Playwright 视觉回归文档](https://playwright.dev/docs/test-snapshots)

不能直接照搬上游的质量声明：所查 MAIC-UI 提交 `aad58ddcc2103058b4c2deffc48a3c13e2c64dd6` 的 `heavy_generator.py` 在阶段执行处注释掉 `validation_func(html)`，改为 `is_valid, issues = True, None`。这是特定公开版本/路径的证据，不是对所有版本的断言。[对应源码](https://github.com/THU-MAIC/MAIC-UI/blob/aad58ddcc2103058b4c2deffc48a3c13e2c64dd6/backend/src/services/html_generation/heavy_generator.py#L220)

## 8. 三个手工参考场景与交付边界

`reference-scenes.ts` 导出 `const referenceScenes: CinematicScene[]`，顺序固定为工业闭环、内存调用、分子/DNA。它们是渲染器视觉基准和单元测试夹具，不是模型生成结果，不进入正式示例或发布列表。正式三个生成示例由主 agent 通过正式 AI 管线另行产生；不得将这些夹具作为管线成功的证据。

| 夹具 | 模型及构图 | 章节与真实状态变化 | 镜头 |
| --- | --- | --- | --- |
| 工业闭环，84 秒 | 2 个 turbine、4 个 server-rack、供回管、三行刻度板；机组间隔 7 单位 | 0 秒共同基线与流向；16 秒左机组拆解/复位；32 秒实际值与显示值分离；48 秒独立观测追上；64 秒显示校准，随后三值共同变化 | 7 个关键机位，含机组拆解特写、读数板特写和首尾全景 |
| 内存调用，84 秒 | 1 个 processor、5 个 memory-bank；处理器/结果区分居两侧，中间上/下栈帧 | 0 秒取指标记移动；16 秒临时帧建立；32 秒上层局部值变化；48 秒返回值传出；64 秒临时帧退出而结果保留 | 7 个机位，含处理器、双层值槽特写和全景 |
| 分子/DNA，88 秒 | 2 个 dna、4 个 atom；中央独立 primitive 碱基和连续 tube 骨架 | 0 秒整体/局部高亮；16 秒两侧分离且连接消失；32 秒单侧依次高亮；48 秒重新靠近但未连线；64 秒配对恢复 | 7 个机位，含中央配对近景、侧面分离和首尾全景 |

每个场景有至少两条 `position/rotation/explode` 轨道，字幕只描述已编码的动作或明确的教学前提；没有真实设备命令、攻击载荷、外部地址或任意执行代码。工业标记不是实际传感器测量；内存空间移动不是实际地址搬运；DNA 方块不是分子动力学，通用原子模型不代表某个碱基分子，配对连杆数量不代表氢键数量。DNA 的 A–T、G–C 配对依据官方科普定义。[NHGRI：Base Pair](https://www.genome.gov/genetics-glossary/Base-Pair)

原研究还提出过光学成像作为第三类候选；本次基准选择分子/DNA，光学留作未来扩展，不影响前述架构结论。[MAIC-UI 光学交互案例](https://arxiv.org/html/2604.25806v1)

### 验收约定

本交付应先做现有 schema 的三场景全量解析、定向 TypeScript 检查、对象/父子/轨道引用检查、章节内非相机状态变化检查及镜头几何检查。模型 worker 尚在实现时，保守包围球检查只能证明机位布置没有明显几何错误，不能证明最终模型可见性、光照、拆解距离或美术质量。模型库完成后由主 agent 在实际播放器中检查关键帧与转场，再批准视觉基线；本报告不提前声称真实浏览器视觉验收通过。
