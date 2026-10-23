# OllyDbg 题目切换到 Windows 2000 与客户机系统可选项

日期：2026-09-20。题目：`ollydbg-practice~003a97d0` / `reverse-debugging` / `ollydbg-auth`。
运行镜像：`aisecedu/windows2000-lab:1`（此前为 `aisecedu/windows-course-runtime:20260911-v2`）。

## 结论

1. **这道 OllyDbg 题已切换回讲义原本的 Windows 2000 Professional**，并端到端跑通：
   启动环境 → Windows 2000 客户机就绪 → 在客户机内按题意修改三个工作副本 → 运行检查工具
   取得动态 Flag → 平台提交完成。
2. **客户机操作系统版本成为可选项**，教师可以用自然语言指定（“用 Windows 2000 出一道
   OllyDbg 逆向题”“换成 win2000”），也可以在手工出题表单的下拉框里选择；课程 YAML 与
   课程包元数据使用同一个 `runtimeEnvironment` 标识。
3. **Windows 2000 客户机让 70 人并发真正可行**：单台客户机实测约 **0.28 GiB** 内存
   （Windows 11 为 3.8 GiB），70 学生并发验收 **70/70 全部完成**，峰值 16 台同时驻留时
   总内存仅 4.37 GiB，15.1 分钟跑完。
4. 课程与题面文案已同步为 Windows 2000，不再出现“用 Windows 11 替代 Windows 2000”。

## Windows 2000 客户机的构建

来源：运维提供的 VMware 虚拟机归档 `2000实验.rar`（内含 `Windows 2000 Professional.vmdk`，
5 GiB 虚拟盘、monolithicSparse，系统为 Windows 2000 Professional Build 2195，已装 OllyDbg 1.10）。

| 步骤 | 做法 |
| --- | --- |
| 解包 | `unrar-nonfree`（仓库已随附）解出 vmdk/vmx |
| 转换 | `qemu-img convert -O qcow2` → 5 GiB qcow2 |
| 离线挂载 | `qemu-nbd -o 32256` + `mount -t vfat`（客户机是 FAT32 单分区） |
| 驱动迁移 | 该 VM 原来跑在 VMware BusLogic SCSI 上，QEMU 没有 BusLogic。向 SYSTEM 注册表注入 IDE 支持：`IntelIde` 服务（boot 启动）+ `CriticalDeviceDatabase` 的 `pci#ven_8086&dev_7010` → `intelide`、`*pnp0600` → `atapi` |
| 关闭 VMware 残留 | `vmscsi` 服务置为 `Start=4`（QEMU 里没有对应控制器，会拖慢启动） |
| 实验文件 | 注入 `C:\Lab`：`demo-original.exe`、`crackme-original.exe`、`submit.exe`、`main.c`、`main.cpp`、`compile.bat`、`README.txt`，以及三个工作副本 |
| 客户机代理 | 交叉编译 `w2k-agent.exe`（Win32，仅依赖 KERNEL32/msvcrt），登录时自启，监听 COM2 |
| 桌面入口 | 在三个用户桌面与 `All Users` 桌面放置 `检查并获取Flag.bat`、`OllyDbg调试器.bat` |
| 注册表 | `HKLM\SOFTWARE\...\Run` 增加代理自启项 |

> 关键坑：`intelide` 与 `atapi` 都必须在 CriticalDeviceDatabase 中正确绑定；把通用 IDE 控制器
> `*pnp0600` 误绑到 `intelide` 会导致 `STOP 0xC0000221`。修正为 `atapi` 后即可正常启动。

运行配置（`/usr/local/lib/windows-lab/start.py`）：

```text
qemu-system-x86_64 -enable-kvm -machine pc -cpu pentium3 -m 256 -smp 1 \
  -drive file=student.qcow2,if=ide,index=0,media=disk \
  -vnc unix:vnc.sock  -qmp unix:qmp.sock \
  -chardev socket,id=check,path=serial.sock     -serial chardev:check    # COM1：课程检查
  -chardev socket,id=agent,path=environment.sock -serial chardev:agent   # COM2：就绪代理
  -net none -rtc base=localtime
```

不需要 UEFI、TPM、SMM——这些都是 Windows 11 才需要的，也因此显著降低了启动时间与内存占用。

## 客户机代理协议

Windows 2000 没有 PowerShell，原来的来宾代理（`guest-agent.ps1`）不可用。新代理是原生
Win32 程序，在 COM2 上使用行协议（参数为十六进制编码，避免转义与编码问题）：

| 请求 | 应答 | 用途 |
| --- | --- | --- |
| `PING` | `OK {"agent":"aisecedu-win2000",...}` | 存活探测 |
| `READY` | `OK {"ready":bool,"ollydbg":bool,"labFiles":bool,"labWritable":bool,"os":"Windows 5.0 build 2195"}` | 就绪判定 |
| `WRITE <hex path> <offset> <hex data>` | `OK {"written":true}` | 分块写入客户机文件 |
| `RUN <hex command>` | `OK {"exitCode":n}` | 在客户机内执行命令 |

代理还会在登录后关闭 Windows 2000 的“找到新的硬件向导”（IDE 控制器迁移后必然出现），
学生看到的是干净桌面。

串口没有硬件流控，**块大小必须足够小**：客户端使用 256 字节分块，并在丢字节时先发送换行
重新同步再重试同一块（写入是幂等的）。1024 字节分块会间歇性丢字节。

## 就绪判定

`environment-verifier.py` 直接与客户机代理对话，检查 Win2000 版本、OllyDbg 可执行文件、
`C:\Lab` 的三个必需文件与目录可写；结果写入 `/run/dojo/var/environment-check/status.sock`，
容器内 `environment-check` 命令读取它。不再要求 VS Code、Tiny C Compiler 或系统激活状态
（Windows 2000 没有这些）。

## 70 学生并发验收

```bash
python3 ops/verify-ollydbg-concurrency.py --students 70 --max-resident 16 \
  --solve-mode agent --output output/win2000-concurrency-70.json
```

| 阶段 | 成功/总数 | p50 | p95 |
| --- | --- | --- | --- |
| `workspace:start` | 70/70 | 2.5 s | 6.7 s |
| `workspace:ready` | 70/70 | 41.1 s | 41.2 s |
| `challenge:solve` | 70/70 | 127.1 s | 128.8 s |
| `challenge:submit` | 70/70 | 0.2 s | 0.2 s |
| 平台完成记录 | **70/70** | — | — |

- 峰值 16 台客户机同时驻留，客户机总 RSS **4.37 GiB**；
- 全程最低 MemAvailable **34.84 GiB**（空载约 40 GiB），最高负载 18.7（48 核）；
- 总耗时 907.8 s（**15.1 分钟**），`failures: []`，`cleanupErrors: []`。

对比此前的 Windows 11 客户机（同样 70 人、同时驻留上限 8 台）：单台 3.8 GiB、总耗时 35.1 分钟、
最低 MemAvailable 11.87 GiB。切换到 Windows 2000 后单台内存约为原来的 **1/13**，就绪时间从
133 s 降到 41 s。

## 客户机操作系统可选项

`dojo_plugin/runtime_profiles.py` 中的 `RUNTIME_PROFILES` 现在是客户机系统注册表：

| 标识 | 显示名 | 家族 | 解释器 | 命令桥 |
| --- | --- | --- | --- | --- |
| `linux` | Linux | linux | python3、node、bash | — |
| `windows` | Windows 11 远程桌面 | windows | powershell、cmd | `windows-exec` |
| `windows2000` | Windows 2000 远程桌面 | windows | cmd | 无 |

- **自然语言**：`infer_runtime_environment` 按“最具体优先”识别版本词，“用 Windows 2000 出题”
  “换成 win2000”“使用 W2K 客户机”都得到 `windows2000`；只写“Windows”仍是 `windows`；
  “比较 Windows 和 Linux”跨家族并列不猜。
- **全局教师智能体**：`platformFacts.runtimeEnvironments` 现在包含三个档案（含家族、可用解释器、
  编译器、检查入口与命令桥），提示词也要求明确指定旧版客户机时使用 `windows2000`。
- **手工出题表单**：运行环境下拉框由 `runtime_environment_choices()` 渲染，新增档案自动出现，
  并按所选档案的家族切换提示文案。
- **课程 YAML**：课程、单元、题目三层的 `runtime_environment` 都由 `RUNTIME_ENVIRONMENT`
  校验器归一化，接受任意已注册标识。
- **镜像缺失时**：启动返回明确的“运行环境镜像未安装：<镜像>”，而不是笼统的启动失败。

`windows2000` 目前没有命令桥（客户机里没有 PowerShell 服务代理），因此平台不代为学生启动
Windows 服务，题目的完成路径是桌面内的原生操作，与这道 OllyDbg 题完全一致。运行合约诊断会
据此拒绝依赖服务代理的题包。

## 复现与运维

```bash
# 重建客户机镜像（种子 + 运行时脚本，约 3 分钟）
docker exec pwncollege-dojo docker build -t aisecedu/windows2000-lab:1 \
  /opt/pwn.college/output/win2000/image

# 单学生端到端
python3 ops/verify-ollydbg-concurrency.py --students 1 --max-resident 1 --solve-mode agent

# 70 学生并发
python3 ops/verify-ollydbg-concurrency.py --students 70 --max-resident 16 --solve-mode agent
```

构建上下文在 `output/win2000/image/`（被 Git 忽略）：`Dockerfile`、`start.py`、
`environment-verifier.py`、私有 `verifier.py`（从已部署镜像按 root 复制，未读取内容）、
`lab-result.js`、`install-desktop.py`、`originals/`、`win2000-seed.qcow2`。
客户机源码 `output/win2000/{w2k-agent.c, patch.vbs, w2k-agent-client.py}` 与实验文件
`output/win2000/lab/` 同样被 Git 忽略。

## 边界

- Windows 2000 已停止支持，客户机不接网络、只用于离线实验；客户机内的 Python 2.7/Ruby/Perl
  等历史工具与课程无关，保留未动。
- 私有检查器（`verifier.py`）仍是唯一判题 authority，学生自报内容不参与判定。
- 本次验收用预置的已知有效补丁驱动完成链路，衡量的是平台与客户机的完成能力，不是学生逆向能力。
- `windows2000` 目前只覆盖原生桌面题；服务型运行合约需要先为该客户机补一个原生命令代理。
