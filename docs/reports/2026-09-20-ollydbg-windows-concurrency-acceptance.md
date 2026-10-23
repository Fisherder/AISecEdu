# OllyDbg Windows 环境 70 学生并发验收

日期：2026-09-20。站点：<http://10.92.35.7:8080/>。验收对象是
`ollydbg-practice~003a97d0` / `reverse-debugging` / `ollydbg-auth`
（CTFd challenge 1459，运行镜像 `aisecedu/windows-course-runtime:20260911-v2`）。

## 结论

1. **70 名学生可以全部正常解题完成。** 70 个独立账号各自登录、加入课程、同时发起
   "启动环境"、等待 Windows 就绪、在 Windows 内完成实验、取得本题动态 Flag 并通过平台
   提交：启动 70/70、就绪 70/70、解题 70/70、提交 70/70，完成记录 70 条，无失败、无清理残留。
2. **但 70 台 Windows 客户机无法同时驻留在这台主机上。** 每台客户机实测约占 3.5–3.9 GiB
   内存和 4 个 vCPU；70 台需要约 250 GiB，主机只有 125.8 GiB。上面的 70 人验收是在
   **同时驻留上限 8 台**、其余排队的条件下完成的（总耗时 35.1 分钟）。
3. **平台目前只有"冷启动"准入，没有"驻留"准入。** `DOJO_WORKSPACE_START_CONCURRENCY`
   （默认 16）的租约在容器创建后即释放，因此 70 人同时点击启动会把 70 台客户机全部拉起。
   本次 20 台并发探测在 MemAvailable 降到 4.36 GiB 时触发验收脚本的保护并停止全部环境，
   0/20 台达到就绪。**不建议在未加驻留准入前做 70 台同时驻留的压测**：它会把主机内存耗尽，
   并可能波及宿主机上的其他业务容器。
4. **课程文案中的"Windows 2000"与设备上的实际客户机不一致。** 实际运行的是
   **Windows 11 Enterprise LTSC 评估版**（10.0.26100，OllyDbg 1.10、原生 VS Code 1.137.0、
   Tiny C Compiler）。Win11 的内存下限远高于 Win2000，这是并发能力受限的直接原因。

## 主机与平台容量

| 项目 | 实测值 |
| --- | --- |
| CPU | 48 核 |
| 内存 | 125.76 GiB（MemTotal） |
| ZFS ARC | `c_max` 62.9 GiB，`c_min` 3.9 GiB；实测常驻 57–60 GiB |
| 可用内存（空载） | MemAvailable 43.8–44.3 GiB |
| 每台客户机 | 4 vCPU（`-smp 4`）、4 GiB 客户机内存（`-m 4096`）、容器上限 6 GiB |
| 工作区冷启动准入 | `DOJO_WORKSPACE_START_CONCURRENCY` 未设置 → 采用默认 **16**（仅限启动，不限驻留） |
| 服务冷启动准入 | `DOJO_CODE_START_CONCURRENCY=64`、`DOJO_DESKTOP_START_CONCURRENCY=64` |

关键点：ZFS ARC 在整轮压测中稳定在 57–60 GiB，**没有随客户机内存压力释放**。
MemAvailable 与客户机 RSS 近似 1:1 下降，因此当前可用预算约为
`44 - 安全余量`，而不是 `44 + ARC 可回收量`。

## 单环境成本

| 指标 | 实测 |
| --- | --- |
| 工作区容器内存（`docker stats`） | 3.883 GiB / 6 GiB |
| QEMU RSS | 3.73–3.81 GiB |
| 8 台并发峰值客户机 RSS | 28.65 GiB（约 3.58 GiB/台） |
| 冷启动到就绪 | p50 133.5 s，p95 154.0 s |
| 启动 API 返回 | p50 2.5 s，p95 4.0 s |
| 客户机内解题（含检查工具） | p50 45.5 s，p95 257.6 s |
| Flag 提交 | p50 0.2 s，p95 0.3 s |
| 8 台启动期负载 | load average 最高 32.07（48 核） |

## 并发驻留容量

| 同时驻留 | 结果 | 峰值客户机 RSS | 最低 MemAvailable | 最高负载 |
| --- | --- | --- | --- | --- |
| 2 | 通过 | 7.02 GiB | 36.04 GiB | 19.2 |
| 4 | 通过 | 13.19 GiB | 26.93 GiB | 14.6 |
| 8 | 通过 | 28.65 GiB | 12.18 GiB | 29.3 |
| 20 | **触发内存下限保护，全部停止** | 40.96 GiB（仍在启动中） | **4.36 GiB** | 21.6 |

按实测斜率反推，若要求保留 8 GiB 安全余量，本机可同时驻留的已启动 Windows 客户机约为
**9 台**；若把 ZFS ARC 上限下调（例如 `zfs_arc_max=16G`）可释放约 45 GiB，上限可提到约
**22 台**——仍远低于 70 台。要让 70 台真正同时驻留，需要约 250 GiB 内存，或把单台客户机成本
降到约 1.5 GiB 以内（例如改用讲义原本的轻量 Windows 2000/XP/2003 客户机）。

20 台并发探测的监控曲线（节选）：

```text
guests= 0  rss= 0.00  memAvail=43.79  arc=58.18
guests=13  rss= 0.98  memAvail=41.87  arc=58.32
guests=20  rss= 8.92  memAvail=33.97  arc=58.36
guests=20  rss=21.88  memAvail=21.05  arc=58.34
guests=20  rss=40.96  memAvail= 4.36  arc=55.84   <- 触发 8 GiB 下限保护
guests= 0  rss= 0.00  memAvail=47.82  arc=53.76
```

## 70 学生验收结果

```bash
python3 ops/verify-ollydbg-concurrency.py \
  --students 70 --max-resident 8 --memory-floor-gib 8 \
  --output output/ollydbg-concurrency-70.json --run-id olly70-<run>
```

| 阶段 | 成功/总数 | 成功率 | p50 | p95 |
| --- | --- | --- | --- | --- |
| `workspace:start` | 70/70 | 100% | 2.5 s | 4.0 s |
| `workspace:ready` | 70/70 | 100% | 133.5 s | 154.0 s |
| `challenge:solve` | 70/70 | 100% | 45.5 s | 257.6 s |
| `challenge:submit` | 70/70 | 100% | 0.2 s | 0.3 s |
| 平台完成记录 | 70/70 | 100% | — | — |

- 峰值同时驻留 8 台，峰值客户机 RSS 28.65 GiB；
- 全程最低 MemAvailable 11.87 GiB，从未触及 8 GiB 下限；
- 最高负载 32.07（48 核）；
- 总耗时 2108.5 s（35.1 分钟），`failures: []`，`cleanupErrors: []`。

## 验收脚本

`ops/verify-ollydbg-concurrency.py` 使用每名学生各自的真实会话：

1. 通过 `/pwncollege_api/v1/auth/register` 注册学生，并由运维侧把这批账号加入这门
   `type: hidden` 课程的成员关系（隐藏课程不支持课程码自助加入）；
2. 70 个会话在屏障处同时释放，调用 `POST /pwncollege_api/v1/docker` 启动真实题目环境；
3. 轮询容器内 `/usr/local/bin/environment-check`，等待 Windows、OllyDbg、VS Code 与
   C 编译器全部就绪；
4. 通过 QEMU QMP `input-send-event` 在客户机内应用一组**已知有效**的修改，并运行课程自带
   的检查工具取得动态 Flag；修改脚本来自被 Git 忽略的 `output/ollydbg-solve.ps1`（`0600`），
   不进入版本库；
5. 用学生本人会话向 `/api/v1/challenges/attempt` 提交 Flag，并在数据库中核对该题
   `type='correct'` 的提交记录数；
6. 采集宿主 MemAvailable、ZFS ARC、QEMU 进程 RSS、负载与驻留数量，最后停止环境、
   删除 Home、卷与账号。

说明：脚本验证的是"环境可用且完成链路可跑通"，修改步骤使用预置的已知有效解，
因此本次结果衡量的是**平台并发与完成能力**，不是学生逆向能力。

安全保护：脚本默认带 `--memory-floor-gib 8`，一旦 MemAvailable 低于该值即触发
`emergency_stop`，停止全部驻留环境并拒绝后续启动，避免把宿主机拖入 OOM。

## 复现

```bash
# 容量与驻留上限（不解题）
python3 ops/verify-ollydbg-concurrency.py --students 8  --max-resident 8  --skip-solve --hold-seconds 120 \
  --output output/ollydbg-cap8.json
python3 ops/verify-ollydbg-concurrency.py --students 20 --max-resident 20 --skip-solve --ready-timeout 150 \
  --output output/ollydbg-capacity20.json

# 70 学生完整解题
python3 ops/verify-ollydbg-concurrency.py --students 70 --max-resident 8 \
  --output output/ollydbg-concurrency-70.json
```

证据文件：`output/ollydbg-concurrency-70.json`、`output/ollydbg-cap8.json`、
`output/ollydbg-capacity20.json`、`output/ollydbg-regression2.json`（均被 Git 忽略）。

## 建议

1. **补上驻留准入控制。** Windows 运行环境的租约应保持到工作区停止，或按节点维护
   "可驻留客户机预算"；超出的学生在队列中等待。这是让 70 人在当前硬件上稳定完成实验的
   最小改动，也是避免 70 台同时启动打爆主机内存的必要条件。
2. **调整 ZFS ARC。** 本机 ARC 上限 62.9 GiB 且实测不随客户机压力释放。把
   `zfs_arc_max` 下调到 16–24 GiB 可释放约 40–47 GiB，把并发驻留上限从约 9 台提到约 22 台。
3. **若确实要求 70 台同时驻留**，需要降低单台成本或扩容：改用讲义原始设定的轻量
   Windows 客户机（Win2000/XP/2003 级别，单台可控制在 0.3–0.8 GiB），或增加计算节点/
   主机内存到 250 GiB 以上。仅调低 `-m 4096` 对 Windows 11 不可行。
4. **统一环境描述。** 课程文案、教师说明和运维记录中应明确当前客户机是 Windows 11 LTSC
   评估版，避免"Windows 2000 环境"的预期与实际不一致。

## 边界与未验证项

- 未执行"70 台同时驻留"的破坏性压测；该规模的内存需求（约 250 GiB）已由实测单台成本
  明确超出本机 125.8 GiB，强行执行会耗尽主机内存并影响同机其他业务。
- 结论是单节点结论，未覆盖多节点调度。
- 客户机内修改使用预置有效解，未评估 70 名学生同时进行 OllyDbg 图形操作时的交互延迟。
- Windows 11 评估版激活有效期至 2026-12-10，到期后需更新镜像，否则 `environment-check`
  的激活校验会阻止就绪。
