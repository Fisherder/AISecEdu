# 全系统体验发布、灰度与回滚 Runbook

版本：2026-08-28  
适用范围：公共端、学生端、教师端、平台管理端及共享产品契约。

## 发布原则

- 数据库变更只做新增表、可空列、索引和约束修正；不在发布过程中删除学习记录、草稿、批次、题目、提交或成果。
- 同一写操作只有一个权威服务。兼容路由只能重定向或读取 canonical presenter，禁止双写状态。
- 学生体验使用稳定用户分桶。一次会话及同一用户的关联页面必须保持同一 variant。
- 公共、教师和平台管理端以可回退应用版本发布；学生主旅程另有运行时 feature flag，可先于应用回滚关闭。
- 发布判断依据是状态、错误、性能与关键旅程护栏，不以页面访问量或点击量替代正确性。

## 开关

| 变量 | 值 | 行为 |
| --- | --- | --- |
| `STUDENT_UX_V2_MODE` | `enabled` | 全量使用新的学生读取与页面路径。 |
| `STUDENT_UX_V2_MODE` | `cohort` | 按稳定用户分桶灰度。 |
| `STUDENT_UX_V2_MODE` | `disabled` | 恢复 legacy 学生只读路径；新提交、草稿、批次和成果仍保留。 |
| `STUDENT_UX_V2_PERCENT` | `0..100` | `cohort` 模式的稳定比例。 |
| `AISECEDU_ENABLE_TEST_ROUTES` | 默认关闭 | 仅隔离测试环境可启用故障注入；生产必须关闭。 |

`student_ux_rollout()` 只决定读取与呈现 variant，不改变任何业务写入目标。因此关闭开关不会回滚、覆盖或删除已经写入的新数据。

## 发布前门禁

1. 备份数据库并记录应用镜像/提交 SHA、环境变量摘要和数据库 schema 指纹。
2. 运行统一验收：

   ```bash
   DOJO_URL=https://<host> DOJO_TLS_VERIFY=false \
     python3 ops/verify-system-ux.py \
       --base-url https://<host> \
       --provision-fixtures \
       --screenshots output/system-ux/screenshots \
       --suite-level full \
       --allow-external-model-suites \
       --output output/system-ux/report.json \
       --junit output/system-ux/junit.xml
   ```

   `--allow-external-model-suites` 是显式数据出境确认：两个真实模型生命周期套件会把隔离生成的合成课程与作答发送给当前配置的模型服务。执行前必须核对目的服务、数据内容和组织授权；不允许包含真实用户数据、凭据、答案、Flag、Token 或密钥。未获授权时不传该参数，其余完整本地套件仍会执行，而两个外部模型证据明确记为 missing，不能误报为完整发布门禁通过。

3. 要求 `complete=true`、90 项 acceptance 均为 passed、无 missing；性能、axe、键盘、路由和安全套件不能跳过。
4. 运行 `ops/verify-system-performance.py` 与浏览器性能验收；页面/API P95、缓存、压缩、集合规模及可交互状态都必须在预算内。
5. 检查隐私遥测只包含白名单事件。禁止字段：password、token、flag、answer、submission body、chat text、full prompt、student free text、raw IP。
6. 核对生产环境中 `/pwncollege_api/v1/test_error`、`/test_page_error` 和 `/metrics/teaching` 对未授权请求均不可达。

## 灰度步骤

1. 内部管理员与验收课程：新应用版本，学生开关 `cohort`、比例 `1`。
2. 教师小组：确认课程切换、五页签、五题独立任务、发布 gate、学情与高风险操作。
3. 学生 10% → 25% → 50% → 100%。每阶段至少覆盖一个完整峰值时窗，不在观测窗口中改变阈值。
4. 匿名公共端最后切换，确认目录、课程预览、登录回跳、法律页和错误恢复。
5. 每阶段记录开始/结束时间、版本、分桶比例、负责人、验收报告路径和是否继续的决策。

## 监控与停止条件

重点查看聚合指标，不使用用户 ID、课程名或学生自由文本作为指标标签：

- HTTP 4xx/5xx、前端未处理错误、unknown status、resolver miss。
- `created != requested`、工作区组合状态矛盾、发布 gate 失败。
- 首次有效学习行动、教师意图到可审核产物、异常发现到恢复的延迟。
- 页面 LCP/INP/CLS、接口 P95、静态资源命中、AI/runtime 队列深度。
- 恢复动作成功率、重复写/幂等冲突、权限拒绝异常增长。

立即停止扩量并回滚的条件：出现越权数据、答案/Flag/Token 泄露、草稿或提交丢失、批次数量串联、不可恢复 5xx 激增、关键页 serious/critical 无障碍回归，或性能预算连续两个窗口超标。

## 回滚步骤

1. 停止扩量，记录事件时间和当前版本；不要删除数据库表或新记录。
2. 学生端先设置 `STUDENT_UX_V2_MODE=disabled` 并滚动重启 Web。确认响应头 `X-AISecEdu-Student-UX-Variant: legacy`。
3. 公共/教师/管理端将应用流量切回上一已验证镜像；数据库保持当前版本。新增表列对旧代码为可忽略、可空的 additive schema。
4. 保持后台任务 worker 版本与其持久 job contract 兼容。运行中的五题批次不得取消或重建；旧 UI 通过任务/成果兼容读取器查看。
5. 回滚后对比以下业务指纹：用户数、课程/章节/题目数、学习草稿、作业提交、教学批次与 item 数、成果与审计事件数。任何减少都视为回滚失败。
6. 复跑公共登录、学生 Today/作业、教师五题批次恢复、管理员运行环境四条最小旅程。
7. 只在根因修复且全量验收重新通过后再次灰度。

## 数据迁移与可重放性

- 插件启动通过事务级 advisory lock 串行执行 `create_all` 与 additive schema reconciliation，避免多个 Web/worker 同时建表。
- 历史状态由 presenter 映射，不进行一次性破坏性枚举改写；unknown 状态保持可见并进入遥测，绝不默认映射为成功。
- 生成批次、item、草稿、提交和成果使用稳定 ID 与幂等键；重放只补缺失结果，不复制已完成对象。
- 迁移失败时回滚当前数据库事务并停止启动；禁止捕获异常后继续提供部分 schema。

## 发布后清理

使用 [system-ux-deprecation-removal.md](./system-ux-deprecation-removal.md) 跟踪兼容入口。只有在 canonical 路径验收通过、旧调用聚合量连续一个发布周期为零、支持文档更新后才可删除。删除必须单独提交，不能与新功能发布捆绑。
