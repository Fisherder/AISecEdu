# 10.92.35.7 创作功能修复与旧 Windows 隔离验证

日期：2026-09-12。修复部署对象仅为北邮内网 **10.92.35.7**，未修改 62.234.153.107。

## 结论

- 已部署无需课程的“生成项目合集”，可独立生成、预览、继续调整，再自愿关联课程章节；关联不会自动发布。
- 动画生成与修订改为完整交互 HTML，接入离线 Three.js 0.150.1，支持同一画布上的连续三维演示及可操作的二维降级。
- 原截图作品已修复为第 7 版草稿，原有版本保留。两个独立示例均为第 4 版草稿，未向学生发布。
- 微软官方 Server 2008 R2 Enterprise 64 位评估 VHD 已完成基础兼容性验证：普通 32 位程序、OllyDbg 2.01 加载、F7/F8 单步、F9 完整运行及重新加载均通过。不是 Win7 32 位或 XP 的等价验证，也不是全部旧课程兼容性认证。
- 评估虚拟机已关机，临时浏览器代理与 SSH 转发已关闭，保留磁盘和记录；现有 Win11 题目容器未替换、未重启。

## 问题与处理记录

| 问题 | 查明的原因 | 已完成处理 |
| --- | --- | --- |
| 演示像 PPT，调整后画面无实质变化 | 原物化流程使用通用确定性模板；动画修订没有专门重生成完整图形代码的路径 | 增加连续动画生成/完整 HTML 修订流程，保留历史版本，拒绝无变化或不完整输出 |
| AI 共创强制要求课程 | 对话生成、候选生成、作用域绑定及预览均存在课程前置条件 | 增加个人项目作用域和合集入口；课件、演示等可不绑定课程。可执行实践题仍保留课程约束 |
| 新项目列表为空 | 生产静态文件解析需要 `.min/.dev` 资源别名 | 补齐 JS/CSS 别名，真实页面恢复加载 |
| 初期验收出现空白三维画布 | 新接入的 Three.js 0.150.0 在 WebGL1 下存在标准材质着色器回归 | 升级并校验官方 npm 0.150.1 构建；新增 WebGL1/2 实际几何体像素与错误检查 |
| 新示例重复创建不同上下文 | 先创建 WebGL1 后没有将该上下文交给渲染器 | 显式传入已创建的上下文，并在生成要求中约束这一用法 |
| 暂停或重置不彻底 | 个别生成动画使用墙钟、累加相位或累加缩放 | 改为由统一时间轴确定位置、角度、脉冲和缩放，逐阶段检查暂停及回拖 |
| 原修订中存在未定义函数 | 模型输出引用了未定义的 `onResize` | 补充脚本语法及 `no-undef` 检查；失败不替换原作品 |
| 中间部署生成接口失败 | 新增校验库 ESLint 未进入生产依赖层 | 修复生产依赖、打包和镜像构建自检；最终执行接口已恢复 |
| 示例说明面板遮挡节点 | 信息层绝对定位覆盖画布 | 将该示例的阶段、读数与讲解移到画布外，三维/二维均重新验收 |
| 旧 Windows 加载调试程序时蓝屏 | 客体 `0x3B / 0xC0000096` 与宿主 `Unhandled WRMSR(0x1d9)=0x1` 同时出现；固定 Nehalem CPU 模型存在调试寄存器兼容问题 | 仅把隔离客体 CPU 改为 `host`，未改宿主 KVM 全局参数；加载、单步、退出、再次加载均成功，之后无新增同类日志 |

测试工具本身也修正了三类误报：主动请求另一种 WebGL 上下文造成错误日志；Canvas 读回触发渲染后端切换导致边缘像素差异；将 SVG 降级误当成 Canvas。最终记录使用已有上下文、稳定的二维读回模式，并同时识别 SVG/Canvas。

## 验收范围与证据

本轮为功能修复验收，不是对系统所有教师/学生功能的穷尽测试，也没有重新进行 200 学生 / 100 智能体压力测试。

- 单元及离线真实浏览器测试：**4 个文件、49 项通过**；TypeScript 与 Next.js 生产构建通过。
- 离线 Three.js：WebGL1、WebGL2 均绘制实际标准材质几何体，有可见彩色像素和帧变化；无外部请求，沙箱不能读取父页面。
- 三个作品 × 三维/二维两种渲染：播放改变真实画面；暂停冻结四个阶段；单步和鼠标时间轴生效；重置恢复初始图像；320/375/1440 像素页面无横向溢出。
- 项目合集：真实浏览器完成课程无关生成流程、保存、预览、调整入口、搜索、空结果、类型筛选、刷新和可选课程/章节对话框。
- 服务端作用域与关联检查：他人项目不可读；无课程预览不能读取课程作品；旧版本冲突返回 409；错误章节拒绝；正确关联不发布。正向关联测试在事务中全部回滚，作品仍独立。
- HTTPS 项目入口最终返回 307；通过原 Clash `127.0.0.1:7890` 访问微软 HTTPS 返回 200。未重启或修改 Clash。

本地证据目录：`cache/acceptance/`。关键文件：

- `three-offline-webgl.json`、`three-offline-webgl2.json`
- 三个作品目录下的 `browser.json`、`browser-2d.json` 和截图
- `collection-final.json`、`collection-final.png`
- `windows-legacy/guest-report-final.txt`
- `windows-legacy/blue-screen-code.png`
- `windows-legacy/olly-step-over-host.png`、`olly-step-into-host.png`
- `windows-legacy/olly-completed-host.png`、`olly-repeat-completed.png`

## 访问入口

- [生成项目合集](https://10.92.35.7:8443/teacher/projects)
- [原截图作品，第 7 版](https://10.92.35.7:8443/teacher/artifacts/artifact_3bb5c4d3bb1b4d12916988ddb6fa1f7e)
- [独立三维回路示例，第 4 版](https://10.92.35.7:8443/teacher/artifacts/artifact_594e01b1d34745f9afe267a14fa5b8cf)

均需要相应教师账号及北邮内网访问条件。

## Windows 来源、许可与限制

来源是[微软官方 Server 2008 R2 评估 VHD 下载页](https://www.microsoft.com/en-us/download/details.aspx?id=2227)。三段下载使用证书校验并核对本地/服务器 SHA-256；OllyDbg 来自[开发者官网](https://www.ollydbg.de/)。

下载页标注 180 天，但下载包许可写 60 天，且只允许内部演示/评估、不得生产使用。用户明确接受的范围是**仅做隔离兼容性验证**。客体实际报告 `LicenseStatus=2`、`GracePeriodRemaining=14400` 分钟（10 天），不能据此承诺可使用 60 或 180 天。未激活、未重置试用期、未更改时钟。

该镜像无虚拟网卡；QEMU 与浏览器代理以非 root 身份运行，VNC 仅 Unix socket，临时 Web 代理仅监听服务器回环地址。没有向学生开放、没有执行真实攻击或连接工业设备，也没有关闭宿主机的安全设置。

后续若用于正式教学，仍需取得覆盖学校、学生及虚拟化使用方式的有效 Windows 许可，并逐题验证。此次通过的基础样例不能替代原课程程序、32 位 Windows 或所有老版本系统的验证。

蓝屏判读参考[微软 0x3B 说明](https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/bug-check-0x3b--system-service-exception)。Three.js WebGL1 问题参考[维护者讨论](https://discourse.threejs.org/t/error-with-r150-does-not-display-simple-mesh/49258)。

## 部署与恢复信息

- 工作分支：`fix/1092357-authoring-20260912`；修改尚未提交/推送。
- 当前运行镜像：`aisecedu/agent-runtime:authoring-projects-20260912-v5`
- 镜像 ID：`sha256:7084ee46c865a4a3c97583138754847bcdd8c12d64545b0f27a88d2c92125333`
- 最终部署源文件校验清单 54 项；运行时健康，未授权执行接口返回 401。
- 此次更新前的源码备份：`/srv/aisecedu-dojo/data/authoring-projects-20260912/polish-v5/source-before.tar`
- 上一运行镜像保留为 `aisecedu/agent-runtime:authoring-projects-20260912-v4`；部署失败自动恢复逻辑已保留。
- 原 Win11 工作区容器启动时间始终为 `2026-09-12T01:39:55.674345976Z`，未发生重启。
- 隔离评估磁盘目录：`/srv/aisecedu-dojo/data/windows-legacy-eval-20260912`。基础 VHD 未替换，验证写入独立 qcow2 覆盖盘。

报告不包含账号口令、会话 Cookie 或访问令牌。验证记录中的登录状态文件不随报告发布。
