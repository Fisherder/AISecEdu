# 实验环境状态持久化（2026-09-21）

## 需求

断开连接、停止再启动之后，之前的改动不能丢。

## 改动

1. **每个账号一块持久磁盘**：`dojo_plugin/api/v1/docker.py` 为原生客户机（Windows 系）运行环境
   新增按用户命名的 docker 卷 `dojo-lab-state-<user_id>`，挂到 `/var/lib/windows-lab`。
   容器被删除（点「停止」）时卷保留，因此再次「启动」时客户机磁盘还在。
2. **启动时续用旧磁盘**（`output/win2000/image/start.py`）：
   - 已存在 `student.qcow2` 就直接续用（原来是直接报错要求重启重置）；
   - 启动前用 `qemu-img check` 体检，损坏时先尝试 `-r all` 修复，修不好才退回干净磁盘，
     避免硬杀进程导致的镜像不一致把环境卡死；
   - 系统盘改为 `cache=writethrough`，客户机写入尽快落盘。
3. **停止时优雅关机**：SIGTERM/SIGINT 与 supervisor 退出路径都会通过 QMP 发 `system_powerdown`，
   等客户机自己关完（最多 30 秒）再结束进程，保证 NTFS 与 qcow2 一致。
4. **「重置」= 干净环境**：`ResetDocker` 走 `start_challenge_session(..., reset=True)`，
   先删除 `dojo-lab-state-<user_id>` 卷再启动，于是重置后回到初始磁盘；
   普通「停止 / 启动」则保留。

## 当前验证状态

| 项目 | 结果 |
| --- | --- |
| 持久卷创建与挂载 | 已验证：`docker inspect user_7208` 显示 `dojo-lab-state-7208 -> /var/lib/windows-lab` |
| 启动流程（续用/新建磁盘、体检、优雅关机代码路径） | 已部署，镜像 `aisecedu/windows2000-lab:1` 已重建 |
| 「停止 → 启动 后客户机文件仍在」整链回归 | **尚未跑通**：本轮验证脚本多次卡在客户机代理调用超时（同时在反复创建/销毁环境），需要一次干净的回归 |
| 题面/数据库描述同步 | 已更新为"改动会保留，需要干净环境用重置" |

## 待办

1. 一次干净的端到端回归：启动 → 改 `C:\Lab\demo.exe` → 停止 → 启动 → 确认字节仍是改后的值；
   再点「重置」→ 确认字节回到初始值。
2. 回归通过后同步 PDF 手册中关于"停止会重置磁盘"的表述。
