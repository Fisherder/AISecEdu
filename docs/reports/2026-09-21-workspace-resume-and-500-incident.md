# 故障与修复：工作区返回后不恢复 + 500 事故（2026-09-21）

## 一、事故：登录后大量页面 Internal Server Error

**现象**：登录状态下 `/student`、`/workspace`、题目页全部 500；未登录的 `/`、`/dojos` 正常。

**根因**：为修复"返回工作区不恢复"改动 `dojo_plugin/pages/workspace.py` 时，补丁把两个辅助函数
（`_challenge_for_running_container`、`_uncached`）插到了路由装饰器和视图函数之间：

```python
@workspace.route("/workspace", methods=["GET"])
@authed_only
def _challenge_for_running_container(user):   # 装饰器挂到了辅助函数上
```

结果 `pwncollege_workspace` 蓝图里没有 `view_workspace` 这个端点，而导航栏每个页面都会执行
`url_for('pwncollege_workspace.view_workspace')`，于是所有带导航栏的页面抛
`KeyError: 'pwncollege_workspace.view_workspace'` → 500。

**修复**：把辅助函数移到装饰器之前，恢复
`@workspace.route("/workspace") / @authed_only / def view_workspace()` 的顺序。
验证：`/student`、`/workspace`、`/workspace?service=desktop`、题目页、`/dojos?tab=mine` 全部 200。

> 教训：`dojo_plugin/pages/*.py` 这类文件必须按"装饰器紧跟视图函数"检查，改完要看部署后的
> 函数签名（本次已加检查步骤：`grep -A 3 '@workspace.route' 部署文件`）。

## 二、原始问题：从工作区去别的页面后，按返回无法继续

**原因有两层**

1. 服务端：`/workspace` 只按"当前章节"（`get_current_dojo_challenge()`）决定渲染内容。
   学生去过别的页面后这个"当前位置"会变/丢失，于是即使容器仍在运行，页面也渲染成
   "还没有启动实验"。
2. 浏览器：按返回时页面常常是从**后退缓存（bfcache）/ HTTP 缓存**里直接恢复的旧 HTML，
   脚本不再重新初始化，看到的还是那份陈旧空态。

**修复**

1. `/workspace` 增加容器回退：没有"当前章节"时，用运行中容器自身的标签
   （`dojo.dojo_id` / `dojo.module_id` / `dojo.challenge_id`，容器创建时写入）反解出题目，
   校验课程权限后按正常工作区渲染 —— 容器在，工作区就在。
2. `/workspace` 与空态页响应加 `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`；
   两个模板加 `pageshow` 监听：若是从后退缓存恢复（`event.persisted`）则重新加载，
   让服务端按当前容器重新渲染。

**验证（真实浏览器）**

| 步骤 | 结果 |
| --- | --- |
| 容器运行中打开 `/workspace?service=desktop` | 非空态，桌面 iframe 正常加载 |
| 跳到 `/student` 后点浏览器返回 | 工作区页恢复且桌面 iframe 正常，不再出现"还没有启动实验" |
| 没有容器时打开 `/workspace` | 仍显示空态与"最近实验"列表（行为不变） |
