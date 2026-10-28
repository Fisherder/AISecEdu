# 完整开发环境与版本推广

开发入口：运行 `make generation-dev` 建立 SSH 隧道，打开 http://127.0.0.1:28080/teacher 。这是与当前生产同源的完整 AISecEdu 平台，包含原教师 AI 共创、课程、成品、数据库、题目和用户工作区快照。独立预览页面已经移除。

## 隔离方式

开发运行在服务器外层容器 `aisecedu-development`，生产仍为 `pwncollege-dojo`。生产快照克隆到独立 ZFS dataset `rpool/aisecedu-development`，源码位于 `/srv/aisecedu-development-volume/aisecedu-dojo`；数据库、Redis、Docker 数据和文件均使用克隆卷。用户目录的 Btrfs 文件系统也使用独立 UUID 与 loop 设备。复制时的生产未提交改动保留在开发副本中，基础服务锁定生产当时实际运行的镜像 ID。

开发会话和服务密钥重新生成；邮件、Discord、备份上传和生产任务队列关闭或隔离。模型服务沿用 AISecEdu 的 DeepSeek 配置，密钥只保存在服务器私有配置中。服务端口仅绑定服务器 loopback，通过 SSH 转发访问；无需开放公网端口。开发使用生产构建方式，原页面、权限校验和后台任务链路均保留。环境地址、独立存储和这些隔离项是必要差异。

`ops/staging/` 记录本机部署的准备、用户文件系统复制、启动和连接脚本。准备脚本依赖当前服务器的 ZFS/Btrfs 布局，不能未经适配用于另一台服务器。私有 `docker-compose.staging.yml` 含真实配置，已加入忽略规则，禁止加入发布包或 Git。

## 教师 AI 共创改进

原有结构化需求确认、方案选择、权限与发布审批继续生效。完整平台后端将需求确认作为创作协议的一部分，本次不改写这一协议。

`AISECEDU_TEACHING_DEMO_ENGINE=html-v1` 将原教师流程中通过意图与来源核验的单主题二维 RSA、DH、AES-128、SHA-256、HMAC-SHA256 演示交给新生成引擎。借鉴知点工坊的一次完整 HTML 生成方式，最多允许初稿加两次定点修复或续写；底稿与累计预算跨任务保存，检查服务恢复时复用底稿。签名、多主题、其他模式及三维需求继续走既有路径。新引擎作品修订也进入原共创入口并重新检查。

独立检查器使用 Node crypto / BigInt 计算预期值，并通过真实浏览器检查可见结果、步骤、对照实验、练习反馈、重置与手机布局。这些是有界算法与交互测试，教师仍需验收题意和教学解释。

流式回答的审计收尾与模型输出存在异步先后关系：任务必须等待实际 provider 终态记录提交后才检查完整性，不能把正常收尾时序当成失败重跑。请求、响应字节和终态仍在消费前后按原合同持久化，不绕过审计。写入端完整消费回执；短暂断线或 5xx 最多重送同一条事件两次，使用同一个 15 秒期限。接收端按事件键和内容哈希去重；权限、租约和合同冲突等 4xx 立即失败。审计重送不重新调用模型。

## 开发验收

1. 在完整开发平台原教师 AI 共创中创建私有作品，检查方案、生成进度、作品预览和修订。
2. 运行 `make generation-check`，以及 agent-runtime 的 TypeScript 检查。浏览器检查必须实际运行。
3. 记录完整教师流程的任务 ID、调用与修复次数、作品 ID 和检查结果。单独的合成微基准不能代表完整教师流程速度。
4. 提交经过验收的源码，保留本次实际运行镜像。

## 构建一次，推广同一镜像

使用 Git 分支 + Docker Compose + 不可变镜像配对。开发验收完成后，在部署主机的已提交开发仓库执行：

```sh
make generation-export RELEASE=/srv/aisecedu-development-control/releases/<version> CONTAINER=aisecedu-development
```

该命令直接导出正在运行的两个镜像，不再构建。包内记录源码 commit、两个镜像 ID 和归档 SHA-256，不包含数据库、私有配置或 API Key。也可用 `generation-release` 先构建包，再应用到开发环境验收。

应用默认只显示计划。指定生产容器并显式执行时才更新生产：

```sh
make generation-promote RELEASE=/path/to/reviewed-release CONTAINER=pwncollege-dojo
make generation-promote RELEASE=/path/to/reviewed-release CONTAINER=pwncollege-dojo APPLY=1
```

只更新 `agent-runtime` 和 `courseware-inspector`，不迁移数据库、不重新构建镜像。工具合并目标已有 Compose 配置，保留其他服务配置、密钥和端口；保存上一完整覆盖配置与实际运行镜像 ID。健康检查失败自动尝试回滚。人工回滚：

```sh
make generation-rollback CONTAINER=pwncollege-dojo
make generation-rollback CONTAINER=pwncollege-dojo APPLY=1
```

默认目标是开发容器，避免误操作生产。上一镜像和 `.local-state/generation-releases/<container>/` 必须保留；这些目录含私有部署配置，权限为私有，不提交 Git。本次工作只应用开发环境。
