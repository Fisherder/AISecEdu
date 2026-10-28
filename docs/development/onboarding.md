# AISecEdu 新成员开发手册

你将在 `10.92.35.7` 上参与玄甲教学平台开发。服务器已有完整独立开发版，你在自己的代码目录开发，维护者负责共享平台部署和生产发布。按本手册可以完成接入、第一次代码修改、检查和交付。

## 接入前提供的信息

向维护者提供希望使用的 Linux 账号名、SSH 公钥、GitHub 用户名及主要负责模块。发送公钥，例如 `id_ed25519.pub`，不要发送私钥。Linux 账号和代码仓库权限需要分别开通。

本次准备没有新增成员账号。没有账号时可以先阅读源码包和本文；取得维护者确认的账号后，再执行下面的服务器操作。文中的 `dev_yourname` 是示例，替换为实际账号。首次连接时向维护者核对服务器主机密钥指纹。

## 系统地图

| 目录 | 负责什么 |
| --- | --- |
| `dojo_theme/` | 教师、学生、课程与工作区的模板、样式和浏览器交互 |
| `dojo_plugin/api/`、`pages/`、`models/` | CTFd Flask 插件中的 API、页面与数据库模型 |
| `dojo_plugin/learning/` | 题目、证据、Tutor、评分与学情 |
| `dojo_plugin/agent_runtime/` | 智能体权限、持久任务、材料、工具和结果 |
| `services/agent-runtime/` | 内部 Next.js 生成与渲染运行时 |
| `services/courseware-inspector/` | 真实浏览器内容检查 |
| `workspace/` | Linux、Windows、编辑器和实验环境 |
| `test/`、`ops/` | 测试与运维；部分脚本能改变平台，先确认用途 |

课程使用兼容模型 `Dojos`，章节为 `DojoModules`，题目发布关系为 `DojoChallenges`。身份、课程、成绩和持久任务属于同一平台 PostgreSQL；内部运行时不是另一套独立产品。先阅读根目录 `AGENTS.md`、[开发规范](standards.md) 和与你任务相关的架构文档。

## 登录和取得个人代码

在自己的电脑执行：

```sh
ssh dev_yourname@10.92.35.7
```

在服务器自己的账号中执行：

```sh
mkdir -p ~/work
git clone --no-local /srv/aisecedu-team/repository.git ~/work/aisecedu
cd ~/work/aisecedu
git remote rename origin baseline
git remote add origin https://github.com/Fisherder/AISecEdu.git
git config user.name '你的姓名'
git config user.email '你的提交邮箱'
git switch -c feat/yourname/first-task
```

`baseline` 是服务器只读协作基线。`origin` 用于个人提交和 PR，推送前需要仓库授权；不要使用他人的 GitHub token。服务器基线包含当前开发成果，可能领先远程默认分支，合并前由维护者确认目标分支。

开发目录为 `~/work/aisecedu`。不要到 `/srv/aisecedu-dojo` 或 `/srv/aisecedu-development-volume/aisecedu-dojo` 修改文件、切分支或安装依赖；它们分别挂载给运行中的生产与共享开发平台。

## 工具链和第一次检查

服务器提供隔离安装的 Node.js 22 和 pnpm 10.28.0，不替换其他项目使用的系统 Node。显式设置本终端 PATH：

```sh
export PATH=/opt/aisecedu-toolchains/node22/bin:/opt/aisecedu-toolchains/pnpm10/bin:$PATH
node --version
pnpm --version
python3 --version
make dev-bootstrap
source .venv/bin/activate
make dev-check
```

Python 基线为 3.12。`dev-bootstrap` 只在你的源码副本建立 `.venv` 并安装固定的检查依赖；没有服务器管理权限要求。`dev-check` 不连接平台，不创建账号或课程，不调用模型。检查完成后仍需执行本次改动对应的测试。

涉及内部运行时才按需安装其依赖：

```sh
cd services/agent-runtime
pnpm install --frozen-lockfile
pnpm exec tsc -p tsconfig.build.json --noEmit
pnpm exec vitest run tests/与你修改对应的测试文件
```

最后一条是测试路径写法示例，替换为实际存在的文件。依赖安装包含构建步骤，先与维护者协调资源。全仓测试和部分运维脚本会启动环境或写数据库，不能因为名字包含 `test` 或 `verify` 就直接运行。

## 打开共享开发平台

在自己电脑另开终端，执行以下命令并保持连接：

```sh
ssh -N -o ExitOnForwardFailure=yes \
  -L 127.0.0.1:28080:127.0.0.1:28080 \
  -L 127.0.0.1:28443:127.0.0.1:28443 \
  -L 127.0.0.1:4443:127.0.0.1:24443 \
  dev_yourname@10.92.35.7
```

在自己电脑的浏览器打开 `http://127.0.0.1:28080/teacher`，使用维护者单独发放的平台测试账号。SSH 登录账号与平台教师账号不是同一种身份。测试账号和课程以维护者分配范围为准，不访问生产快照中的真实学生记录。

如果自己电脑也有本仓库，可用 `AISECEDU_DEVELOPMENT_HOST=dev_yourname@10.92.35.7 make generation-dev` 建立相同隧道。主机指纹核对、账号和密钥授权完成后再连接。2224 是开发平台的学生工作区 SSH，不是服务器开发登录端口。

## 修改代码与申请联调

先创建一个有负责人和验收条件的任务。修改后检查差异并执行相关测试：

```sh
git diff --check
make dev-check
git status --short
git add 你实际修改的文件
git commit -m '说明具体问题和修改结果'
git rev-parse HEAD
```

需要共享环境时，在服务器登记完整的 40 位 commit。下面用终端变量保存真实提交值：

```sh
commit=$(git rev-parse HEAD)
aisecedu-dev status
aisecedu-dev request build "$commit" --purpose '任务编号及构建目的'
aisecedu-dev reserve "$commit" --minutes 90 --purpose '任务编号及验收范围'
aisecedu-dev request browser "$commit" --purpose '具体页面、操作与预期结果'
```

第一阶段采用人工调度：`request` 只登记，返回 `QUEUED` 不代表构建或部署完成。维护者审查、领取和执行后更新状态。已有预约即使过期也不会自动覆盖；遇到占用联系持有人或维护者。

验收结束，确认没有仍在运行的任务，再交还环境：

```sh
aisecedu-dev release --note '验收结果、遗留问题及恢复状态'
```

如果代码尚未部署到共享环境，刷新浏览器不会显示你个人目录的修改。不要自行重启 CTFd、Worker、Nginx 或 Docker。

## 提交给维护者

有仓库推送权限时推送自己的分支并创建 PR，使用仓库模板写清行为、数据影响、测试和恢复方法。普通修改由非作者审查；高风险范围由对应维护者审核。

```sh
git push -u origin HEAD
```

暂时没有 GitHub 权限时，把本任务改动导出为补丁，交给维护者接收；不要发送整份带 `.env`、缓存或数据的个人目录。

```sh
mkdir -p ~/deliveries
git format-patch --stdout baseline/team/development-foundation-20261028..HEAD > ~/deliveries/first-task.patch
```

维护者若已更新服务器基线，先 `git fetch baseline` 并确认本任务起点。提交已进入 PR 的历史修改前与审查者协调；避免覆盖他人的提交。

## 常见问题

| 情况 | 处理 |
| --- | --- |
| 无法 SSH 登录 | 核对 Linux 账号、公钥、VPN 和主机指纹，不使用共享 ubuntu 密码 |
| clone 被拒绝 | 请维护者核对 `aisecedu-dev` 组与源码镜像读取权限 |
| `aisecedu-dev` 被拒绝 | 账号尚未加入开发组，或需要重新登录刷新组成员关系 |
| Node 显示 18 | 设置上面的工具链 PATH；不要使用 sudo 全局升级 |
| 浏览器仍显示旧界面 | 查看共享平台当前部署版本，申请联调后由维护者部署 |
| 模型、构建或测试失败 | 保存任务编号和错误，区别源码、资源、权限与服务问题，不清空整库重试 |
| 需要改题目或评分 | 先按实际课程与题型解析分层规范，再安排真实检测器验收 |

交付前确认：改动只属于本任务；没有凭据与学生数据；说明执行过和未执行的检查；提供清晰的验收与恢复步骤。生产发布由维护者完成。
