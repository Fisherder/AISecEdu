# AI 学习助手：真实提问耗时拆解、回复变短、每次提问先截学生桌面（2026-09-22）

三个诉求：① 回复慢，要逐环节耗时；② 回复太长，要短；③ 每次提问先截当前工作区画面作为参考。

## 一、真实提问的逐环节耗时（实测）

测试环境：真实部署 + 真实 Windows 2000 客户机（容器 `user_7239`，镜像 `aisecedu/windows2000-lab:1`），
以学生身份调用 `POST /pwncollege_api/v1/learning/tutor`。耗时由新增的埋点采集：写入 assistant 消息的
`metadata.timings`、API 响应的 `timings` 字段，并打一行 `tutor timings ...` / `tutor route timings ...` 日志。

### 改前（第一次提问，旧代码）

| 环节 | 耗时 |
| --- | --- |
| attemptLookup（定位活动 attempt） | 34 ms |
| containerLookup（取容器） | 1 ms |
| liveProgress（容器 + 客户机实时状态采样） | 242 ms |
| tutor → context（题面/文件/证据/历史组装） | 793 ms |
| tutor → **solutionReference（私有标准解法参考）** | **43 913 ms** |
| tutor → model（真正的回答） | 2 083 ms |
| commit | 4 ms |
| **合计（学生实际等待）** | **47.3 s** |

**慢的根因**：每个 attempt 的第一次提问会同步生成"私有标准解法参考"，该调用用
`thinking=True, reasoning_effort="max", max_tokens=7000`，实测单次 44 s 左右，学生必须等它跑完
才拿到第一句回答；之后同一 attempt 的提问命中缓存，只需 ~2 s。

### 改后

| 环节 | 冷启动（打开面板后马上提问） | 常态（预热完成 / 已缓存） |
| --- | --- | --- |
| attemptLookup | 25–83 ms | 36–53 ms |
| containerLookup | 1–7 ms | 1–7 ms |
| liveProgress | 0.1 ms（面板已采样） | 0.1–232 ms |
| tutor → context | 770–808 ms | 762–841 ms |
| tutor → screenshot（新功能） | 294–322 ms | 299–306 ms |
| tutor → solutionReference | 12 096 ms（**有界等待上限 12 s**） | **0.0–0.4 ms**（缓存命中） |
| tutor → model | 1 832 ms | 1 804–2 170 ms |
| commit | 3 ms | 3–4 ms |
| **合计** | **15.2 s** | **3.4–3.7 s** |

做法：

1. **面板打开即后台预热**：`GET /learning/attempts/current`（学习助手面板展开时必然调用）触发
   `prefetch_solution_reference()`，在后台线程里生成参考；学生读消息、打字的这段时间把 44 s 消化掉。
2. **同步路径有界等待**：真的没预热完时，最多等
   `DOJO_AI_SOLUTION_PREFETCH_WAIT_SECONDS`（默认 12 s），到点就用确定性的兜底参考先把回答给学生，
   预热结果留给下一问；不再让首问无条件等 44 s。
3. **跨 worker 去重**：`attempt.data` 里写 `solutionPrefetchStartedAt` 标记（300 s 有效），
   gunicorn 多 worker 不会重复发起同一次长调用（实测修复前一次提问会重复跑 2–3 次）。
4. **提交时保护缓存**：`attempt.data` 是同一个 JSON 列，请求自身的 read-modify-write 会在 commit 时
   覆盖后台刚写入的参考；新增 `preserve_solution_reference()`，提交前从库里合并回来，避免"每问都要重跑"。
5. 等待用 `gevent.sleep`（gevent worker 下不阻塞其它请求）。

结论：**首问 47.3 s → 15.2 s，常态 ~3.5 s**。

## 二、回复变短

- 系统提示加入硬性长度约束：answer ≤120 字，diagnosis ≤40 字，observations ≤2 条（各 ≤30 字），
  nextActions ≤2 条（action ≤50 字，why ≤26 字），明确"不要复述题面/背景/长命令"；
  `max_tokens` 3200 → 1000；安全重写 2200 → 900。
- 组装层新增 `_condense_tutor_answer()`：超过 380 字时**整段丢弃**（先丢"我注意到"，再丢"我的判断"），
  始终保留"建议你接下来"，绝不把句子截半。
- 不再输出"预期观察"行（原先每个动作一行，占篇幅最大）。
- 前端不再变化结构；消息本身更短。

实测长度（assistant 消息字符数）：

| | 样本 | 平均 | 范围 |
| --- | --- | --- | --- |
| 改前 | 1（09:07 真实提问） | 1948 | 1948 |
| 改后 | 9 | 333 | 244–421（上限 380） |

## 三、每次提问先截当前工作区画面

流程（Windows/QEMU 实验环境）：

```
学生点"询问 AI 学习助手"
  └─ dojo_plugin/learning/screenshots.py::capture_workspace_screenshot()
       ├─ 判定运行时（runtime_profile.is_windows）+ 存在 /var/lib/windows-lab/qmp.sock
       ├─ 容器内 python3 /usr/local/lib/windows-lab/screenshot.py
       │    └─ QMP screendump → /tmp/aisecedu-tutor-screenshot.png（format=png，旧 QEMU 退回 PPM→PNG）
       ├─ docker get_archive 取回 PNG，存 /data/tutor-screenshots/<attempt_id>/<时间戳>.png（留档，最多 12 张）
       └─ 以 data:image/png;base64 附到模型请求（OpenAI 兼容 image_url 内容块）
  └─ 上下文里同时写入 workspaceScreenshot 说明，提示模型"先看图再回答"
```

- 实测：640×480 PNG ≈ 12 KB，抓取 + 取回耗时 **294–322 ms**，只增加约 200 个 prompt token（不拖慢回答）。
- **模型确实在用**：学生说"我已经打开了 OllyDbg"，截图显示桌面图标层 → 助手回答
  "截图仍是桌面，OllyDbg 没开……先双击 OllyDbg.exe 载入 method1.exe"，并能引用
  "截图仅见桌面图标，无 OllyDbg 窗口"作为观察证据。
- 前端在助手消息下方显示一行绿色小字"📷 已参考你的实时桌面截图"（`metadata.workspaceScreenshot.available`），
  学生/教师可据此确认截图确实生效。
- 降级：非 Windows 运行时（无 QMP 的 Linux 容器）返回 `available: false, reason: RUNTIME_UNSUPPORTED`，
  回答照常进行，只在 metadata 里记录原因；Linux 桌面的 X11 截图暂未实现。

## 四、顺带修掉的问题

- 截图脚本最初用 `test -x` 判定，而镜像里是 0644 → 一直判定为"不支持"；改为 `test -f`。
- `model_json()` 新增 `images=[...]` 参数（多模态内容块），文本调用行为不变。
- 每个环节耗时现在可从三处读到：assistant 消息 `metadata.timings`、API 响应 `timings`、ctfd 日志。

## 五、部署

- ctfd 已重启（`docker restart ctfd`），插件侧改动（intelligence/screenshots/learning.py + 前端）已生效。
- `aisecedu/windows2000-lab:1` 已重建（含 `/usr/local/lib/windows-lab/screenshot.py`，0644）。
  **已在运行、且不是用新镜像创建的环境需要点「重启」**才会带上截图脚本；在此之前助手会正常回答，
  只是 metadata 记录 `RUNTIME_UNSUPPORTED`。
- 可调参数：`DOJO_AI_SOLUTION_PREFETCH_WAIT_SECONDS`（默认 12）、`DOJO_TUTOR_SCREENSHOT_DIR`（默认 `/data/tutor-screenshots`）。

## 影响文件

- `dojo_plugin/learning/intelligence.py`（阶段埋点、`images` 支持、简洁化装配、参考预热/有界等待/缓存保护）
- `dojo_plugin/learning/screenshots.py`（新增：截图抓取、留档、降级）
- `dojo_plugin/api/v1/learning.py`（路由埋点、面板打开触发预热、返回 timings）
- `output/win2000/image/screenshot.py`（新增：容器内 QMP screendump → PNG）、`Dockerfile`
- `dojo_theme/static/js/dojo/learning-tutor.js`、`dojo_theme/static/css/custom.css`、
  `dojo_theme/templates/workspace.html`（"已参考截图"提示 + 版本号）
- 重建 `aisecedu/windows2000-lab:1`
