# DeepSeek PR 自动开发流程

成员仍在个人分支提交 PR，目标为 `develop`。启用后，GitHub Actions 自动读取当前提交，使用指定 DeepSeek 模型审查并修复明确问题，再由独立模型任务复审；符合策略的 PR 自动获得机器人审批，等待全部必需 CI 通过后自动合并。作者直接查看原 PR 的同一条汇总评论，无需转交补丁。

## 自动执行范围

1. 只接收同一仓库、受信任成员、非草稿且目标为 `develop` 的 `feat/`、`fix/`、`team/` 分支 PR。
2. 任务分支落后时正常合并最新 `develop`，保留原作者提交；出现冲突时停止，不强推。
3. 编码任务只修复可复现的问题，不扩展需求。每次人工提交后最多两轮自动修复；自动同步基线不重置修复次数。
4. 独立复审输出结构化问题、严重性、文件和行号。AI 输出缺失或格式错误、接口失败、发布失败均不能标为通过。
5. 修复以追加提交交付到原任务分支，再运行真实 CI。生成了补丁不等于检查通过。
6. 普通 PR 通过 AI 复审后，由 `github-actions[bot]` 提交明确标注 AI 身份的审批并开启 GitHub 自动合并；GitHub 继续执行分支保护。合入 `develop` 后自动安排其他开放 PR 同步基线。

`ops/team/ai_policy.json` 是维护者控制的范围入口。权限 API、数据库模型、评分、异步命令入口、基础设施、依赖、工作流、开发规则及出题标准等变更保留维护者复核。模型发现需求不明确、架构或安全判断、真实联调证据缺失时也会停止自动合并。规模限制为 40 个文件、1,500 行变更；机器人修复限 250,000 字节，不允许修改任何既有测试文件、修改受保护路径或夹带无关源码。回归测试只能新增独立的 `test/test_*.py` 模块；既有测试及辅助模块的纯追加也拒绝，避免追加跳过、重定义或导入副作用改变原有验证。发布器在独立检出中依据原始 HEAD 的真实文件树重新执行同一校验，不能只信任模型阶段生成的补丁。

AI 不自动解决人的审查讨论，不部署共享平台或生产，不把学生数据、测试账号或服务器密钥交给云端任务。完整平台 CI 使用 GitHub 的隔离环境；私有课程、真实模型质量及评分联调仍按维护者任务记录执行。

新反馈、基线或失败检查变化后，独立的可信门禁任务创建新的进行中检查，并撤回旧机器人审批和自动合并，再交给模型重审。即使 GitHub 拒绝撤销旧状态，失败处理也先记录失败检查，阻止当前提交合并。两轮限制只约束自动修复，不允许用旧结论忽略新的人工反馈。审查任务只读代码，测试在 CI 或可写修复任务中执行；超时、取消或缺少结果文件都会报告失败。

模型结果仍按固定结构校验。只清理额外的 `null` 空占位字段；额外的 `trigger` 描述原样附入问题正文。原始结果保留在验收附件，问题、严重性及人工要求保持不变。缺少字段、类型错误、其他非空未知字段或无效 JSON 均停止，不能借格式纠正改变审查结论。

## 模型和凭据

模型固定为 `deepseek-v4.1-flash-1017`，通过维护者授权的 OpenAI Responses 兼容网关调用，不自动降级或切换模型。编码执行使用固定版本的 Codex CLI；推理请求走该网关，不使用 ChatGPT 登录或 OpenAI API 额度。

凭据保存在两个独立的 GitHub Environment Secret 中，不使用普通 Repository Secret：

| Environment | Secret | 用途 |
| --- | --- | --- |
| `aisecedu-ai-model` | `DEEPSEEK_API_KEY` | 用户授权的模型网关 Key，只进入模型 API 代理 |
| `aisecedu-ai-publish` | `AI_AUTOPILOT_SSH_KEY` | 仅此仓库的可写 Deploy Key，只进入发布任务 |

两个环境只允许 `develop` 引用，不允许普通功能分支或 PR 引用读取凭据。首次初始化临时允许本次 PR 的精确引用 `refs/pull/2/merge`，完成后删除这两条例外。环境设置 `deployment: false`，仅用于凭据控制，不代表部署平台。

仓库 Variables：

| 名称 | 用途 |
| --- | --- |
| `DEEPSEEK_BASE_URL` | 以 `/v1` 结束的 HTTPS 网关地址 |
| `DEEPSEEK_MODEL` | 固定模型调用名 |
| `AI_AUTOPILOT_ENABLED` | `true` 启用；`false` 停止新任务 |
| `AI_AUTOPILOT_BOOTSTRAP_HEAD` | 仅初始化时使用的精确提交授权；完成后删除 |

模型任务运行于 GitHub 托管临时 Runner，并通过官方 Codex Action 的 API 代理和 `drop-sudo` 隔离上游 Key。发布任务不运行模型或 PR 脚本，仅验证当前提交、追加修复、发布结果和申请自动合并。仓库 Deploy Key 让追加提交正常触发下一轮 CI，避免普通 `GITHUB_TOKEN` 引起的人工重跑批准。

首次审查、可写修复和独立复审分别运行于新的临时 Runner，每个任务只调用一次 Codex Action。`drop-sudo` 对当前任务不可逆，不能在同一 Runner 中恢复权限后再次调用；独立复审从原 head 重新检出并应用已验证补丁，包含新增测试文件。各阶段通过限定保存期的产物传递结果，只有受隔离写入凭据控制的发布任务可以推送。参见 [官方执行与权限说明](https://learn.chatgpt.com/docs/github-action#manage-privileges)。

持有写入凭据的发布任务先将产物中的 PR 编号、HEAD、基线与分支，绑定到可信准备步骤的独立工作流输出，再从 GitHub 重新取得实际 PR 文件、维护者复核范围和修复次数，并在独立检出中应用补丁后重新验证路径、大小与既有测试行保护。发布器再次拒绝 `main`、部署分支等非任务分支；同步基线的合并目标必须与 GitHub 当前 `develop` 提交完全一致，产物中的其它提交不能被当作基线。模型任务上传的上下文和补丁不能单独决定发布权限；校验失败时不提交或推送。

独立复审仍有 P0–P2 问题时，发布器拒绝提交和推送该补丁，关闭旧审批并记录失败；原成员分支保持不变。未要求人工判断且仍有修复额度时，可进入下一轮。仅有整份 PR 的维护者复核要求、且没有阻断缺陷时，范围内的明确修复可先追加为待审阅提交；`requires_human` 原样保留，自动审批与合并继续停止，直至维护者处理。

PR 接口中的 `base.sha` 可能保留旧快照，不能代表目标分支的实时 HEAD。准备与发布阶段均独立读取 GitHub `refs/heads/develop`；比较、审查签名和基线同步使用该实时提交。审查期间目标分支推进即重排，读取失败则停止，不回退到旧 PR 快照。正常同步仍保留成员提交、不强推。

自动化使用 Actions 运行时间和用户网关额度；每个任务有超时，修复次数受限。同一提交与相同失败检查的审查结果会复用，减少重复调用。网关额度不足、配额或模型不可用会明确失败并反馈，不报告成功。

日常 PR 先运行无模型凭据的快速 CI，再由 `workflow_run` 在默认分支执行可信审查工作流。CI 失败及恢复都会触发重新判断；不使用 `pull_request_target` 检出并执行 PR 脚本。标题或描述变更、草稿转为正式 PR 也会触发快速 CI。人工评论和手动重试从默认分支进入同一流程。

## 维护者操作

初始化前启用仓库的 Allow auto-merge，以及 Actions 创建审批的权限。`develop` 保持至少一位非作者审批、旧审批失效、禁止强推/删除和讨论解决；必需检查包含 `contributor-checks`、`audit`、`singlenode DOJO Test`、`multinode DOJO Test` 与 `DeepSeek review`。不要为通过自动合并而移除失败检查。

工作流入口为 `.github/workflows/ai-pr-autopilot.yml`。维护者可从 Actions 手动运行，提供 PR 编号和实际任务分支名；修改凭据后以此重试。原 PR 有新人工提交、CI 失败或 `develop` 推进时也会自动触发相应处理。

暂停全部新任务将 `AI_AUTOPILOT_ENABLED` 设为 `false`；已经运行的任务需在 Actions 取消，已开启的 PR 自动合并需在 PR 上单独关闭。持久暂停单个 PR 时添加 `ai:paused` 标签并关闭其自动合并；标签存在期间不调用模型、不追加修复，也不审批合并。恢复时移除标签并从 Actions 手动重审（retry 设为 true）。复用缓存不会重新开启手动关闭的自动合并或补发审批；新输入需要持续暂停时应保留标签。轮换模型 Key 更新对应 Secret；轮换仓库写入 Key 时，同时替换 Secret 并撤销旧 Deploy Key。修改策略和工作流须维护者复核，不能由机器人为自己扩大权限。

`.github/CODEOWNERS` 只为维护者复核路径指定 `@Fisherder`，并启用 GitHub 的必需 Code Owner 审批。普通路径仍允许独立 AI 审批；涉及自动化、权限、容器、依赖或开发规则的 PR 必须获得维护者审批，不能只凭机器人审批合并。初始化 PR 由维护者完成最终集成，不为初始化移除失败 CI。

## 验证

`make dev-check` 包含调度与发布边界的离线回归、启动配置回归，以及桌面桥接父窗口来源、nonce 和本地脚本加载的协议回归；课件模块存在时也执行其单测。Team quick checks 还会在课件浏览器组件测试存在时安装固定 Playwright 并执行该测试。完整 DOJO CI 继续作为独立必需检查。

代码工作区的 Esc 由托管扩展 `xuanjia.assignment-reader` 的静态按键声明交给 VS Code 内置 `workbench.action.terminal.sendSequence`，只向普通聚焦终端发送一个 ESC 字节，不在 DOM 桥接中合成键盘事件。终端查找、文本选择、建议和辅助阅读等界面保留原有 Esc 行为。扩展安装必须显式生成规范文件名 `package.json` 和 `extension.js`，不能把 Nix store 路径的哈希基名直接复制到扩展目录；快速回归执行真实安装脚本段并通过托管扩展索引引导验证。此修复需要更新工作区 profile，并在新工作区实际核验；只重启 Web 服务不能更新已构建的托管扩展。协议检查核对声明与资源副本，真实 Vim/Esc/结果文件测试仍由完整 CI 执行。

完整 CI 按 `ops/team/app_test_manifest.json` 分组：依赖 CTFd 的完整模块和混合文件中的指定用例，在实际 CTFd 容器及请求上下文中运行；其余单测、HTTP 和浏览器用例在客户端镜像运行。应用阶段使用冻结源码、真实应用依赖及同一隔离实例的合成数据库，保留所需 HTTP 夹具；客户端会明确报告已交给应用阶段的用例。两部分均为必需步骤，任一步失败都阻止合并。`ops/team/app_units.py` 与应用 Runner 只接受 `coverage` 环境。快速检查核验分组清单及直接导入 CTFd 的用例，防止遗漏或重复分组。

完整 CI 的 `coverage` 环境加载仓库基础 Compose 和专用 `docker-compose.coverage.yml`，从源码构建组件；专用覆盖将 cAdvisor 切换到官方 `gcr.io/cadvisor/cadvisor`，固定已核验的多架构 manifest 摘要，避免 GitHub Runner 依赖校园镜像的连通性。监控服务、挂载与权限仍保留。空数据库启动时，PgBouncer 等 PostgreSQL TCP 就绪，后台 Worker 等 CTFd 完成迁移并通过健康检查。服务器的本地镜像标签、迁移后 Nix 路径和发布覆盖文件不进入临时 Runner。生产及共享开发环境不加载 coverage 覆盖，继续按原有方式运行。GitHub 构建使用其 Ubuntu Azure 镜像源，并为软件包下载设置有限重试；索引下载失败直接报错，避免带着不完整索引继续安装。

同一 PR 的新提交会自动取消旧版本的 DOJO CI，最新提交继续执行全部必需检查。启动配置与测试参数透传在镜像构建前验证；平台启动成功后，应用上下文和客户端测试两部分分别执行并保留失败结果。

外层与测试镜像分别使用 GitHub BuildKit 缓存，构建成功即保存，避免整套测试尚未通过就丢失已完成的编译结果。合入 `develop` 后也运行 CI，建立供后续 PR 读取的基线缓存。Runner 加载构建镜像后清理本地 BuildKit 缓存，为多节点工作区和客户端测试留出空间。远程缓存仅加速构建，保存失败不改变测试结论。参见 [Docker Actions 缓存说明](https://docs.docker.com/build/ci/github-actions/cache/)。

CI 统一使用 `dojo` 容器名，确保构建的测试镜像和失败诊断指向实际容器。启动就绪依据成功的 HTTP 响应，最长等待五分钟；不依赖页面品牌字样。工作区构建器按实际进程退出码判断，失败不能因 `docker wait` 命令本身成功而被忽略。

IDA 8.4 原供应商下载地址已返回空文件，工作区改用 [2024-07-18 的完整归档](https://web.archive.org/web/20240718072537id_/https://out7.hex-rays.com/files/idafree84_linux.run)。维护者实际下载核验了 97,688,552 字节文件，SHA-256 与仓库原有 `sha256-lB8ijOSJvwoUJomA7a0WFAvil+B0kkXXg5oqOwIHCmI=` 完全一致；版本和校验值保持原值，CI 仍需校验后才能构建。

参考：[Codex GitHub Action](https://learn.chatgpt.com/docs/github-action)、[DeepSeek Codex 接入](https://api-docs.deepseek.com/quick_start/agent_integrations/codex/)、[GitHub 自动合并](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/automatically-merging-a-pull-request)。
