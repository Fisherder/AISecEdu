# AI 共创工作台 v3

独立 React / TypeScript 教师创作应用。Jinja 页面只负责登录身份、CSRF 和平台主题；新应用不加载原 `teaching-agent.js` 控制器。源码和样式位于 `src/`，CSS 在 Shadow DOM 内隔离，主题变量从平台继承。

## 开发与验证

```sh
npm ci
npm run typecheck
npm test
npm run build
```

构建输出到 `dojo_theme/static/js/dojo/workbench-v3/`。平台会把脚本地址改写为 `.min.js` 或 `.dev.js`，因此三个入口必须同步发布。第三方许可证输出到 `app.js.LEGAL.txt`。

浏览器回归从仓库根目录运行：

```sh
node ops/test-workbench-v3-browser.cjs
```

这个测试使用本地 API fixture 和实际模板、构建产物，覆盖队列、断线后的幂等提交、事件顺序、模式、成品预览、版本与主题。`ops/test-workbench-v3-backend.py`、`ops/test-workbench-v3-live-browser.cjs` 用于独立数据库和独立运行服务上的真实 API / 模型验收。不能把测试配置指向生产数据库。

## 主要边界

- `core/controller.ts`：持久草稿、提交身份、会话订阅、后台任务、成品操作。
- `core/events.ts`：按运行与事件序号归并真实执行记录；没有完成事件的记录不会被报告为成功。
- `components/`：导航、消息、计划确认、生成方案、输入与队列、任务中心。
- `panels/`：成品预览/源码/历史，工具与命令记录，课程/资料/技能上下文。
- 问答和规划同时受后端持久输入、结果投影和工具执行边界约束；不是只改变输入框提示。
- 成品修改与恢复携带当前版本号；冲突由服务端拒绝，恢复形成新版本。
- 已发出的任务在服务器继续运行；重新连接只读取事件，不能自动重复提交任务。

研究、设计和功能映射见 `docs/ai-cocreation-workbench-v3.md`。生产发布须使用精确文件清单，先核对源文件与运行镜像，保留同期生产更新和回滚备份。

## 对话文件预览

点击对话中的文件卡可打开右侧预览。桌面端可拖动分隔线调整宽度，继续使用对话，并在文件间切换、缩放或下载原文件。手机端可通过关闭按钮返回对话。刷新会话会恢复链接中指向的同会话文件。原有教学成品卡继续打开课件、仿真等交互工作区。

| 请求 | 返回 |
| --- | --- |
| `GET /teaching/jobs/{jobId}/files/{fileId}` | 下载原文件 |
| 相同路径加 `?view=preview` | 返回预览类型和内容。Word 返回页数与页面尺寸。 |
| 相同路径加 `?view=page&page=1` | 返回 Word 第 1 页的 JPEG |
| 相同路径加 `?view=html` | 在独立浏览器沙箱中显示 HTML |

路径相对于 `/pwncollege_api/v1`。预览和下载都要求当前用户拥有对应任务。文件不存在或用户无权访问时返回 `404`。在线预览超出范围时返回 `422`，排版工具暂不可用时返回 `503`，原文件仍可下载。Word 在应用服务内使用 LibreOffice Writer 和 Poppler 排版，受本地字体影响。预览转换的 PDF 按文件摘要缓存于私有生成文件目录。HTML 预览禁用脚本和外部资源。
