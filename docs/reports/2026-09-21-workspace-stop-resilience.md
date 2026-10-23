# 停止题目环境按钮不可用：分析与修复（2026-09-21）

## 现象

学生在题目页点「停止」，环境没有停；页面弹出一个原样透出的 JavaScript 报错
`Unexpected token '<'`。

## 分析

`dojo_theme/static/js/dojo/actionbar.js` 里的停止流程直接用 `CTFd.fetch(...).then(r => r.json())`：

- 只要响应体不是 JSON（例如 nginx 在 ctfd 重启/不可用时返回的 502/504 HTML 错误页、或应用返回的
  500 HTML 页），`response.json()` 就抛 `SyntaxError: Unexpected token '<'`，被 `.catch` 原样显示给
  学生，请求本身也不会重试。
- 服务端的停止接口在「当前没有运行中的环境」时返回 `{"success": false, "error": "未找到活动题目运行环境。"}`。
  页面此时若还停留在“运行中”的界面（容器被回收、页面没刷新、或上一次停止响应丢失），学生点停止只会看到
  一句错误，界面不变，于是表现为“点了没反应”。

实测服务端的停止本身是好的：容器存在时 `DELETE /pwncollege_api/v1/docker` 返回 200、
`题目运行环境已停止。`，容器在 1.5 秒内消失。

## 修复

### 1. 停止改成幂等

`dojo_plugin/api/v1/docker.py` 的 `delete()`：没有任何运行环境时返回
`{"success": true, "alreadyStopped": true, "message": "当前没有运行中的题目环境。"}`，
让前端把界面同步到“已停止”，而不是卡在“运行中”。

注意：第一版补丁误改了同一个类的 `get()`（两处代码形状完全相同），会让「启动题目」拿不到
课程/章节/题目信息；已还原 `get()` 并只对 `delete()` 生效。

### 2. 前端不再裸解析响应

`dojo_theme/static/js/dojo/actionbar.js` 新增 `apiRequest(path, options, retries)`：

- 先读文本再尝试解析 JSON，解析失败不会抛出 `Unexpected token '<'`；
- 对 5xx、408、429 自动重试两次（间隔 1.5 秒）；
- 仍失败时给出可读提示：`平台暂时不可用（HTTP 502），可能正在重启或繁忙，请稍后重试。`

启动题目、停止、重置、读取题目信息四处调用统一改用它。

## 验证（真实浏览器 + 真实容器）

| 场景 | 结果 |
| --- | --- |
| 环境仍在时点停止 | `DELETE 200 {"success": true, ...}`，横幅“题目运行环境已停止，/home/hacker 文件已保留。” |
| 页面停在运行态、容器已被回收（不刷新） | `DELETE 200 {"success": true, "alreadyStopped": true}`，界面切换为已停止，提示“当前没有运行中的题目环境，已同步为停止状态。” |
| 平台不可用（停掉 ctfd）时点停止 | 自动重试两次后显示“平台暂时不可用（HTTP 502），可能正在重启或繁忙，请稍后重试。”，不再出现 `Unexpected token '<'` |
| 「重启」恢复路径 | `POST 200`，容器重建，横幅“题目容器已重新创建，/home/hacker 文件已保留。” |

## 影响文件

- `dojo_plugin/api/v1/docker.py`
- `dojo_theme/static/js/dojo/actionbar.js`
- `dojo_theme/templates/module.html`、`dojo_theme/templates/workspace.html`（资源版本号）
