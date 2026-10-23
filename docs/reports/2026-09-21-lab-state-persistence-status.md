# 虚拟机状态持久化：现状与下一步（2026-09-21）

## 已完成

1. **按账号的持久卷**：`dojo-lab-state-<user_id>` → 容器内 `/var/lib/windows-lab`。
   实测 `docker inspect user_7208` 显示卷已挂载，卷内 `student.qcow2` 在多次启停间**持续增长**
   （196 KB → 75 MB → 90 MB），说明客户机磁盘确实是同一块、被反复复用，而不是每次重建。
2. **启动时续用旧磁盘**：`start.py` 存在 `student.qcow2` 就直接续用；只有「重置」才清空
   （`ResetDocker → start_challenge_session(reset=True) → remove_lab_state_volume`）。
3. **跨容器陈旧状态清理**：`clear_stale_runtime_state()` 在早退分支之前清掉上一代容器的
   `started` 标记与各类 socket。
4. **停止时先优雅停机**：`remove_container()` 先 `container.stop(timeout=25)`（给客户机
   关机时间）再强制删除；`start.py` 收到 SIGTERM 时通过 QMP 发 `system_powerdown`。
5. **界面提示与运行时一致**：启停接口新增 `statePreserved`，工作区横幅按运行时显示——
   Windows 客户机显示"虚拟机磁盘状态已保留：客户机里改过的文件、装过的东西都在"，
   Linux 环境仍显示"/home/hacker 文件已保留"。不再对 Windows 环境误报 home 保留。

## 还没通过的一步（如实记录）

回归脚本：客户机内写入 `C:\Lab\state-check.txt`（写后立刻读回成功）→ 点停止 → 启动 →
再读该文件 **exit 1（文件不在）**。

**判断**：磁盘在复用（见上），所以丢的不是"整块盘"，而是**最后一次写入没有落盘**——
停止时容器是被强制删除的，QEMU 相当于被硬断电；这一代 Windows 2000 客户机对
ACPI `system_powerdown` 没有响应（没有自动关机），NTFS 的延迟写因此丢失。

## 下一步（明确方案）

在停止流程里**先让客户机自己刷盘**，再删容器：

1. 客户机侧加一个刷盘脚本（ctypes：`CreateFileW(r"\\.\C:", GENERIC_WRITE)` +
   `FlushFileBuffers`），放在 `C:\Lab\Environment\flush-disk.py`；
2. 平台 DELETE 停止接口在 `remove_container()` **之前**，通过既有客户机代理通道
   （`/var/lib/windows-lab/environment.sock`）执行一次刷盘，成功后再停容器；
3. 重跑同一回归：写标记 → 停止 → 启动 → 读标记应返回 0 且内容一致。
