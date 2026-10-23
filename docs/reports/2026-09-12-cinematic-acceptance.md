# 三维演示生成重构与验收

目标服务器：10.92.35.7。工作树：`/Users/fisherder/aisecedu-authoring-20260912`。

状态：2026-09-12 完成部署、三份正式 AI 示例及浏览器验收。当前版本分别为 5、7、5，保持为教师项目，未发布给学生。

## 根因与改动

旧路径包含要求伪三维卡片的提示、一次整页 HTML 生成、受限高度预览，以及改写整页的修订方式。能点击按钮、存在 Canvas 或像素变化，不足以证明构图、教学变化和说明对应。

新路径将分镜设计、SceneIR、验证、讲解复核和编译分开。SceneIR 保存实体 ID、层级、位置/拆解/显隐等轨道、相机和章节；播放器使用离线 Three.js、程序化精细模型、PBR 材质、阴影、环境光与可调辉光。项目合集、课程绑定的可选性、权限、历史版本和 Flash 模型配置保持兼容。

新增沉浸预览会扩展内外两层 iframe，但不重建它们、不丢失播放位置；支持从最内层 Esc 返回。播放、暂停、单步、回拖、重置、镜头探索和结构拆解共用确定性时间轴。暂停时不持续重画场景。

研究参考及适用边界见 [研究报告](/Users/fisherder/aisecedu-authoring-20260912/docs/reports/2026-09-12-cinematic-research.md)。借鉴 [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC)/[MAIC-UI](https://github.com/THU-MAIC/MAIC-UI) 的内容与呈现分离、[Motion Canvas](https://motioncanvas.io/docs/flow/) 的时间编排和 [Theatre.js](https://www.theatrejs.com/) 的属性轨道原则，不声称原样集成了这些完整产品。

## 实测发现与修复记录

| 发现 | 处理与证据 |
| --- | --- |
| 生产编译将 `.css?raw` 交给 CSS loader，HTML 中 `<style>` 为空 | 改为纯文本样式资产；检查 Next 产物以及正式生成 HTML，样式长度 6771 字节；浏览器检查实际计算样式 |
| 模型将 tube.points 等数组放到 params，引发维度错误，原错误被冗长 union 消息淹没 | 仅对无歧义结构做规范化，其余严格验证；反馈具体字段路径 |
| 删除节点后修订使用的数组索引漂移 | 增加稳定节点/连接 ID 路径和精确补丁错误信息；历史版本在失败时不变 |
| 暂停仍持续渲染、投影标签使用旧相机矩阵等问题 | 统一更新顺序和 dirty render；实际 WebGL1/2 回归 |
| 文案声称粒子表示数值、存在格单元/额外控件，实际没有实现 | 增加逐章文本复核；人工继续对照 SceneIR 和正式截图，不能把模型复核当作绝对正确 |
| 初版机柜埋入地面、整个涡轮根对象旋转、读数柱重叠 | 已调整落点、内部转子、拆解和分行读数；最终版本的偏离、独立对照及恢复均通过数据断言和画面核对 |
| 栈帧仅移动、没有退出；旧值不在对应父层；PC 旧轨道覆盖新位置 | 已补齐显隐、父子关系、PC 与返回事件；四层在调用前隐藏、依次出现、依次退出，结果保留 |
| 关键值标记被上层板遮挡 | 调整局部近景机位，将标记移至层板无遮挡前角，最终截图可见；返回起点同步更新 |
| 行星重复球壳/星环遮挡、轨道进入星体附近 | 删除重复遮挡物；卫星全过程采样保持在保守边界外，增加真实卫星特写与附着本体的方向标记 |
| 模型以 replace 新增尚不存在的 parent，违反补丁协议 | 原版本保留；明确采用 add 或完整节点替换后成功，不把此类合同失败误判为服务器网络不可达 |

初始三例由正式教师项目页面提交自然语言、选择生成方案产生。不是以手写 `reference-scenes.ts` 夹具冒充 AI 生成。夹具只用于渲染基准。

## 正式示例与证据位置

| 示例 | 正式入口 / 当前版本 | 场景与最终任务 |
| --- | --- | --- |
| 工业闭环：表象与真实 | [打开](http://10.92.35.7:8080/teacher/artifacts/artifact_a5c676bcfe6341c6a568992261d9b467) · v5 | 13 节点、6 轨道、8 镜头、4 章节；`job_7fc9a09b0cc34ee89cf05c0a5a299810` |
| 走进处理器：一次调用的旅程 | [打开](http://10.92.35.7:8080/teacher/artifacts/artifact_3a118a4bd41b41a29e0723484231cd3a) · v7 | 19 节点、23 轨道、11 镜头、7 章节；`job_53faa6cd150c4a058ee92b0b4a563581` |
| 轨道交会：从远景到近距观察 | [打开](http://10.92.35.7:8080/teacher/artifacts/artifact_201033cd8453466e9115116ecc44af4a) · v5 | 10 节点、9 轨道、10 镜头、5 章节；`job_fe15bcb5a859449bbbe076bb4a4f949c` |

均为独立教师项目，`dojoId=null`。每次生成/修订保留任务 ID、前后数据、模型路由和失败记录，位于 `cache/cinematic-production/example-1` 至 `example-3`。最终三次任务实际模型均为 `deepseek-v4-flash`，无 Pro、无降级。

“连续调整没效果”的回归证据：处理器第二次定向调整把强调色从 `#5bdded` 改为 `#f7ad52`，首镜头位置从 `[9,7,17]` 改为 `[8.1,6.3,15.3]`，target/fov 不变，全部对象 ID 和动画轨道保持相同。镜头确实推进，但模型并未严格实现所提示的绕 target 等比 0.9 缩放；因此仅认定定向改色/推进生效，不宣称精确数值编辑达标。其前后 JSON 和截图分别保存在 `second-adjustment-*` 与 `before-second-*`。

## 最终验证

- 本地相关单元测试：20 文件、234/234 通过，0 失败。原始结果：[final-unit-tests.json](/Users/fisherder/aisecedu-authoring-20260912/cache/cinematic-production/final-unit-tests.json)。生产 Next 构建及 TypeScript 检查通过。
- 真实 Chrome WebGL1/2 播放器定向回归：84/84 断言通过，涵盖隐藏标签/鼠标拾取、暂停、回拖、透明度、释放等；此次定向运行仅保留工具 stdout，没有伪造独立报告文件。
- 正式浏览器：三例全部通过，16 个章节阶段截图留档，运行错误 0。测试播放、暂停、单步、重置、时间轴首尾键、章节跳转、2 倍速、鼠标拖动探索、缩放、全部画质、结构拆解、原生全屏、沉浸保留内外 iframe、内部 Esc 退出和 390px 手机布局；暂停时没有额外场景重绘。
- [场景语义断言](/Users/fisherder/aisecedu-authoring-20260912/cache/cinematic-production/semantic-verification.json)：检查三通道独立位置与恢复、四层依次显隐、PC 方位、标记父层、返回终点、卫星边界与方向继承。它补充人工看图，不替代视觉判断。
- 三份最终离线副本在真实 Chrome 再次通过；测得约 60 FPS，禁用 WebGL 时兼容视图控制也通过。这是本机、这些场景的测试，不是所有设备、所有生成内容或并发量的保证。

正式浏览器原始报告：[工业](/Users/fisherder/aisecedu-authoring-20260912/cache/cinematic-production/example-1/browser-verification.json)、[处理器](/Users/fisherder/aisecedu-authoring-20260912/cache/cinematic-production/example-2/browser-verification.json)、[卫星](/Users/fisherder/aisecedu-authoring-20260912/cache/cinematic-production/example-3/browser-verification.json)。

## 实际画面

工业：三路读数对照。

![工业闭环](/Users/fisherder/aisecedu-authoring-20260912/cache/cinematic-production/example-1/shot-2.png)

处理器：局部值标记位于可见的层板前角。

![处理器栈帧](/Users/fisherder/aisecedu-authoring-20260912/cache/cinematic-production/example-2/shot-3.png)

卫星：近景、结构展开与本体方向。

![卫星结构](/Users/fisherder/aisecedu-authoring-20260912/cache/cinematic-production/example-3/shot-2.png)

## 离线交付

[三维教学演示示例 ZIP](/Users/fisherder/aisecedu-authoring-20260912/cache/cinematic-delivered-20260912/三维教学演示示例-20260912.zip) 含三份自包含 HTML、README 和 Three.js 许可；已通过压缩包完整性检查。它们是正式 AI SceneIR 的同版播放器导出副本，不是手工夹具。离线播放不需要 VPN/登录/CDN；在线修订、项目权限和学习记录仍需平台。离线测试报告：[browser-report.json](/Users/fisherder/aisecedu-authoring-20260912/cache/cinematic-delivered-20260912/browser-report.json)。

## 部署与环境边界

发布使用严格源文件哈希、活动任务检查、旧源码备份、镜像回退与健康检查，只重建 agent-runtime；其他当时运行中的容器启动时间必须保持不变。发布记录在服务器 `/srv/aisecedu-dojo/data/cinematic-20260912/release-*`。

最终镜像为 `aisecedu/agent-runtime:cinematic-20260912-v3`，ID `sha256:65192bc8006a0a74164dc821677ce790fbb407b5dfa01d1462c2db0a5cc8f448`，状态 healthy。无凭据执行接口返回 401，发布器记录 `unrelatedContainersPreserved=true`。

本次未修改 Clash、aTrust、云端 62.234.153.107 或 Windows 基镜像。服务器现有 8443 入口返回 307 至 8080；最终链接使用已实测的 8080 入口，不把本机对 8443 的间歇 TLS 失败误写成演示服务失败。

Clash GUI/core 的 PID 始终为 30987/31006；经 127.0.0.1:7890 代理访问 HTTPS 验证返回 200。曾发生内网短暂 ECONNRESET，恢复后按原任务记录继续，未为此重启代理或创建重复项目。

## 限制

这些是可探索的教学概念动画，不是工业控制、真实内存执行或轨道力学数值仿真。精细资产共十类，并可组合基础几何，但不能保证任何任意题材一次生成都具有同等质量。自动结构校验和讲解复核不会替代教师审阅。WebGL 缺失时提供基础二维兼容视图，不声称其具有等同的三维细节和交互表达。此次浏览器表现不构成 200 人/100 个智能体压力测试结果。
