# 事故修复：OllyDbg 环境变成 Linux 桌面（2026-09-21）

## 现象

学生打开工作区看到的是容器自带的 **Linux Xfce 桌面**，不是 Windows 2000。

## 根因（两层，都是我本轮重建镜像引入的）

1. **运行时启动器丢失**：平台在容器创建后按运行时配置执行初始化命令
   （`dojo_plugin/api/v1/docker.py`：`if profile.initializer and container.labels["dojo.runtime.bootstrap"] == profile.initializer: exec_run([profile.initializer])`）。
   Windows 2000 的初始化命令是 `/usr/local/bin/windows-runtime-start`，但我重建
   `aisecedu/windows2000-lab:base` / `:1` 时，镜像里既没有这个脚本，也没有
   `org.aisecedu.runtime.bootstrap` 标签 → 平台从不执行初始化 → QEMU 不启动。
   于是平台请求 `desktop` 服务（容器 6080 端口）时，落到容器自带的 Linux 桌面
   （Xvnc + xfce4-session + websockify）。
2. **陈旧运行状态拦住重启**：卷里残留上一代容器的 `started` 标记（记录的是已经不存在的
   PID），`start.py` 的 `main()` 在清理之前就先 `if (STATE/"started").exists(): return`，
   即使初始化被调用也会立刻返回、什么都不做。

## 修复

1. 新增 `output/win2000/image/windows-runtime-start`：
   ```sh
   #!/bin/sh
   set -eu
   exec /usr/bin/python3 /usr/local/lib/windows-lab/start.py
   ```
   在 `Dockerfile` 中 `COPY` 并 `chmod 0555`，同时补上镜像标签
   `org.aisecedu.runtime.bootstrap="/usr/local/bin/windows-runtime-start"`
   （`Dockerfile` 与 `Dockerfile.incremental` 都加了，`:1` 继承 `:base` 也存在）。
2. `start.py` 新增 `clear_stale_runtime_state()`：`started` 里记录的 PID 不存在时，
   清掉 `started`、`qmp.sock`、`serial.sock`、`vnc.sock`、`environment.sock`、
   `guest-progress.json`，并把这一步放在 `main()` 的早退判断**之前**。

## 验收

| 项目 | 结果 |
| --- | --- |
| QEMU 进程 | 运行中（`ps -eo comm | grep qemu-system` = 1） |
| 6080 端口 | 由 Windows 运行时的 websockify 监听 |
| 客户机自检 | `environment-check`：Windows、OllyDbg、VS Code 与 C 编译器就绪 |
| 桌面画面 | screendump 显示 Windows 2000 桌面（中文图标、OllyDbg 快捷方式、右下角 EN），不再是 Xfce |
| 镜像标签 | `org.aisecedu.runtime.bootstrap=/usr/local/bin/windows-runtime-start` |

## 教训

- 交付镜像前必须核对 **平台启动容器所依赖的两样东西**：镜像里的初始化脚本
  `/usr/local/bin/windows-runtime-start` 与标签 `org.aisecedu.runtime.bootstrap`；
  重建后要 `docker inspect <image> --format '{{json .Config.Labels}}'` 复核。
- 状态持久化把"上一代容器的运行标记"也一起留下来了，跨容器复用卷时必须先判断
  标记里的进程是否还活着，且要在任何早退分支之前清理。
