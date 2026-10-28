# AISecEdu 团队维护者操作手册

本手册面向现有服务器维护者，开发者使用 [新成员手册](onboarding.md)。本轮不新增 Linux 账号或他人的密钥；成员资料到位后按这里的接入步骤处理。

## 目录与当前边界

`/srv/aisecedu-team/source` 是独立协作准备分支，`repository.git` 是供成员读取的源码镜像，`releases` 保存源码交付包，`public` 保存无秘密的环境记录。`control`、`secrets` 和 `jobs` 由 root 管理。

生产与完整开发平台保留原目录和容器。协作分支不会自动覆盖正在运行的开发功能分支；推广前须比较新增功能和生产修改。初始核对确认生产的 10 项源码改动均已包含在开发基线 `bb3abe19`，原始差异仍单独备份在团队 control 目录。

当前开发副本仍是受限生产快照，不因建了协作目录就自动脱敏。默认不开放原始数据库、真实 Home、对话与旧配置；成员平台账号只授予专门测试课程。需要更广泛数据访问前先安排合成数据与脱敏验收。

## 预约与人工任务调度

`aisecedu-dev status` 显示共享预约与任务。成员可登记任务和预约，只有 `aisecedu-maintainers` 或 root 可使用 `resolve`。数据库位于 root 私有的 `control/coordination.sqlite3`。程序不运行用户代码、不重启服务，也不提供任意 Shell 执行。

领取与结束任务：

```sh
aisecedu-dev resolve 真实任务编号 RUNNING --note '已审查 commit、资源和目标环境，开始执行'
aisecedu-dev resolve 真实任务编号 SUCCEEDED --note '实际命令、退出结果与验收证据位置'
```

失败填 `FAILED`，未执行或已经确认实际停止的任务填 `CANCELED`。状态变化必须对应真实工作。首阶段所有任务串行，浏览器和工作区任务还必须匹配申请人及预约 commit。过期预约不自动释放；交还前确认后台作业和恢复状态。

领取重型任务会检查容量：build 预计额外 6 GiB，browser 为 2 GiB，workspace 为 4 GiB，另保留 8 GiB MemAvailable；磁盘至少余 110 GiB。实际执行还须使用无特权任务身份、独立目录和 cgroup 限额，不能在 root 下运行未经审查的分支脚本。请求登记程序尚无自动构建执行器。

构建建议初始限制 4 CPU、6 GiB、禁止额外 Swap；根据实际峰值校准。使用固定 commit 的冻结副本，不执行来自成员可随时修改目录中的 root 脚本。个人分支不得获得生产密钥或宿主机 Docker socket。

## 成员资料到位后的接入

登记 Linux 账号、公钥指纹、GitHub 用户、模块、平台测试账号与课程范围，参考 `ops/team/member.example.json`。账号使用 `dev_<标识>`，个人 Home 权限为 0700，公钥目录为 0700，`authorized_keys` 为 0600，只加入 `aisecedu-dev`。不要加入 `sudo`、`docker` 或 `aisecedu-maintainers`；维护角色另行授权。

由管理员使用系统账号管理工具创建账号并安装已经核验的公钥，测试新的独立 SSH 连接，确认没有密码共享。然后以该账号执行新成员手册中的 clone、工具链和快速检查。Linux 和 GitHub 授权分别管理，不把他人个人 token 放入共享凭据。

新成员验收包括：能读取源码镜像并建立个人 clone；能运行快速检查；能登记自己的任务；无法结束他人预约或领取任务；不能读取团队 control、secrets 和生产配置；不能调用宿主机 Docker。平台只开放其测试课程。

## 更新协作基线和源码包

协作代码只在 `source` 的专用分支审查提交。更新只读镜像前确认分支与干净状态，使用镜像现有 `source` remote 从受信任 source fetch，再设置明确分支为 HEAD；镜像保持 root 所有、开发组只读，不使用全员可写的共享 `.git`。

源码包由 `git archive` 从已提交基线导出，旁边保存 commit 和 SHA-256。不打包私有配置、control、数据库、个人目录或运行数据。若新增文件只在工作目录而未提交，不宣称它已经进入交付包。

团队基线尚未因此自动推送到 GitHub。准备分支、CODEOWNERS、PR 模板和 CI 工作流纳入远程后，由仓库管理员配置主分支保护、至少一位非作者审查、必需检查和禁用强推；源码文件本身不能启用远程规则。

## 现有服务发布范围

`generation-export/promote/rollback` 仅处理 `agent-runtime` 和 `courseware-inspector`。执行前核对源码与运行镜像的真实对应关系，清单中的 commit 不能只取当前目录 HEAD 后直接假定一致。

涉及插件、主题、Worker、Nginx、工作区或 schema 的改动需要额外的成组部署与兼容验收。本轮不新增通用生产发布器，不把生产数据库或用户 Home 同步为开发状态。发布前保留上一版本和需要的数据备份，生产使用已验收产物，避免重新构建。

原文档中的 `make deploy`、`./deploy.sh -t` 和 `ops/verify-*` 包含能改变平台的命令。先检查实际目标、当前预约和测试数据范围，再决定在完整开发环境执行。

## 准备项回退

本轮新增内容集中在 `/srv/aisecedu-team`、`/opt/aisecedu-toolchains`、固定 CLI 路径、专用 sudoers 文件及 Git 的单一路径 safe.directory。业务服务不依赖这些工具。回退时先保留预约和任务数据库、源码提交与归档，再移除专用 CLI 和 sudoers 条目；不要连带改动系统 Docker、业务配置、生产数据或现有开发卷。
