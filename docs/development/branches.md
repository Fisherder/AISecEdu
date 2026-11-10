# 统一开发分支约定

自 2026-11-03 起，GitHub 仓库默认分支和普通开发 PR 的目标统一为 `develop`。

```text
feat/<成员>/<任务> 或 fix/<成员>/<任务>
    -> develop（审查、检查和开发集成）
    -> main（由维护者组织验收后的发布整合）
```

`develop` 以已分发给成员的协作基线 `222c024c698888a82c9a9ff5efb161966ae86e32` 为共同祖先建立，包含完整平台和团队检查工具。当前 `main` 是较早版本，不能替代新任务的 `origin/develop` 起点。`deployment/*` 为部署记录，不接收普通功能 PR。

## 新任务

在个人仓库中确认已有工作，再执行：

```sh
git status --short --branch
git fetch origin
git switch -c feat/yourname/task-name origin/develop
```

分支示例替换为实际成员和任务名。工作完成后提交、推送个人分支，GitHub PR 的 base 选择 `develop`。如果使用已安装的 GitHub CLI，可执行 `gh pr create --base develop`。

## 已有任务

保留当前任务分支和提交。先 `git fetch origin`，再用 `git log --oneline origin/develop..HEAD` 与 `git diff origin/develop...HEAD` 检查个人改动。原始协作基线已在 `develop` 历史内，不需要把整份基线重新作为个人改动提交。

确需吸收新的协作改动时，在确认工作已保存后做正常 merge，或与审查者约定 rebase；不自动 reset、clean、切换或覆盖他人任务分支。只更新远程引用不会改变当前工作树。

## 合并和发布

普通改动至少一位非作者审查；`develop` 禁止强推和删除，按实际分支保护完成必需检查和讨论解决。平台权限、数据库、评分、容器与发布改动另由对应维护者复核。

合入 `develop` 不等于已经部署到共享平台或生产。维护者在冻结 commit 与镜像上安排联调、验收和发布；`main` 的整合及实际部署单独进行，不自动覆盖服务器上正在运行的分支。

服务器只读镜像 `/srv/aisecedu-team/repository.git` 默认提供 `develop`。旧准备快照仍保留，运行中的完整开发版和生产源码均不因本次分支建立而切换。
