# 小容量云主机部署

本部署保留原有的 Linux 与原生 Windows 运行环境，在没有 `/dev/kvm` 的主机上使用 QEMU TCG。数据库从空库初始化；运行镜像、工具包与只读系统模板属于运行组件，不包含源站课程、用户和学习记录。

## 运行组件

- Windows 加速方式默认自动检测；镜像可设置 `DOJO_WINDOWS_ACCELERATOR=tcg` 或 `kvm`。明确要求 KVM 但设备不可用时启动失败，不会静默更改选择。
- TCG 使用 2 个虚拟 CPU、4 GiB 来宾内存。Windows 来宾没有网卡；QEMU、TPM 和桌面代理以 UID 60000 运行。课程容器继续使用原有非特权运行配置。
- `DOJO_WINDOWS_SEED_PATH=/data/windows/course-seed.qcow2` 指向共享系统模板。平台把它作为单个只读文件挂载到 Windows 容器；每个会话创建自己的 QCOW2 写入层。未配置这个变量时，继续使用镜像内的模板。
- `DOJO_WINDOWS_BOOT_TIMEOUT_SECONDS=900` 给软件虚拟化留出启动时间。平台、命令桥和自动执行器使用同一设置；允许范围为 60–1800 秒。
- 自动执行器为 Windows 命令保留 120 秒的外层等待时间，使原生命令桥的 90 秒执行上限能完整生效。Linux 命令仍使用 25 秒上限。
- 完整 Nix 工具树保存在只读 SquashFS 中。启动校验仍检查固定 profile、全部 2366 个依赖和既有 SUID 位。更新工具树时需要生成并校验新的镜像，不能直接写入挂载点。
- 各 CTFd worker 复用同一应用镜像，避免在有限磁盘上导入相同镜像的多个构建副本。

## 2026-09-11 部署参数

目标为 `62.234.153.107`，项目目录 `/srv/aisecedu-dojo`。原有主机的 80/443 端口与应用保留；AISecEdu 主站使用 8443，Workspace 使用 4443。宿主 nginx 分别转发到仅监听回环地址的 9443 和 9444。

`ops/deployment.env` 的非敏感配置：

```dotenv
DOJO_LISTEN_ADDRESS=127.0.0.1
DOJO_HTTP_PORT=9080
DOJO_HTTPS_PORT=9443
DOJO_SSH_PORT=2223
WORKSPACE_HTTPS_PORT=4443
DOJO_WORKSPACE_PUBLISH_PORT=9444
DOJO_HOST=62.234.153.107
WORKSPACE_HOST=62.234.153.107
DOJO_IP_MODE=true
DOJO_SHM_SIZE=4g
DOJO_IMAGE=pwncollege/dojo:compact-transfer-20260911
DOJO_TLS_IPS=62.234.153.107
```

`data/config.env` 使用 `NAME=value` 格式，值按 shell 规则引用，不加 `export` 前缀。它由 `dojo-init` 保留并规范化。该主机配置 2 个 CTFd worker、64 个 PostgreSQL 连接上限、12 个 PgBouncer 默认连接池、2 个 Code 启动并发和 1 个 Desktop 启动并发。主机另有 2 GiB swap。该规格按单个 Windows 会话验收，TCG 启动和交互速度低于 KVM；增加并发前需扩容并重新测量。

模型角色使用 `deepseek-flash`，全局智能体默认路由为 `deepseek:deepseek-flash`。API 密钥、数据库口令、会话签名密钥和管理员密码只保存在服务器的私有配置，不写入此文档或 Git。

## 只读文件与校验值

| 文件 | SHA-256 |
| --- | --- |
| `/srv/aisecedu-dojo/data/workspace-full.squashfs` | `a7a1f29d47a248f58bda7a9c15160c95b8ce76e459fb7493b29a002f1e2b60ac` |
| `/srv/aisecedu-dojo/data/windows/course-seed.qcow2` | `2b62c7e26bc94f7a1632ca952c0811c5ac28ee471b6eb3b47bc50085fb84677a` |

Windows 镜像为 `aisecedu/windows-runtime:compact-tcg-20260911-v2`，镜像 ID 为 `sha256:883aecc5283c5db2e3f63baeb963e1f11db4f33aeec067d7a6edfc724be980ae`。它包含 QEMU、TPM、noVNC、命令桥及原生串口检查客户端，依赖上述外部系统模板。原生客户端避免每次检查重复启动 PowerShell，课程校验与 Flag 绑定规则保持一致。模板在独立维护副本中关闭休眠、完成 BitLocker 解密和 CompactOS 压缩，再清零空闲空间并转换成压缩 QCOW2；转换后已通过 `qemu-img compare`。原课程会话未参与模板维护。

低容量主机的镜像增量构建上下文保存在 `cache/windows-compact-v2/`，包含上述版本的运行脚本、CMD 包装器和通过 `x86_64-w64-mingw32-gcc -Os -s -Wall -Wextra -Werror ... -lshell32` 编译的原生客户端。运行脚本必须保留 0755 权限；仓库中的标准 Windows Dockerfile 会在独立构建阶段自动编译该客户端。

外层镜像 `pwncollege/dojo:compact-transfer-20260911` 保持原镜像 Config 和全部 RootFS diffID，只把传输层重新封装为压缩 OCI，减少 Docker 29 同时保存压缩层与展开层的开销。

宿主 `/etc/fstab` 持久挂载：

```fstab
/srv/aisecedu-dojo/data/workspace-full.squashfs /srv/aisecedu-dojo/data/workspace/nix squashfs loop,ro 0 0
/swapfile-aisecedu none swap sw 0 0
```

## 维护与验收

```bash
sudo docker exec pwncollege-dojo dojo compose ps
sudo docker exec pwncollege-dojo docker logs --tail 60 ctfd
sudo docker exec pwncollege-dojo docker exec nginx nginx -t
findmnt /srv/aisecedu-dojo/data/workspace/nix
df -h /
free -h
```

源码通过目录挂载进入应用。nginx 配置单文件绑定挂载：替换文件 inode 后应重新创建 nginx 容器，使它读到新文件；一般配置内容修改可先 `nginx -t` 再 reload。内层 nginx 使用 Docker DNS 动态解析 CTFd 与 agent-runtime，避免服务重建换 IP 后持续 502。

模型与运行验收记录保存在 `data/agent-runtime/deployment-62234-20260911/`。交付前删除本次临时验收课程和账号，保留管理员及非敏感报告。管理员密码位于 `data/admin-password.txt`，权限为 0600。

入口 TLS 沿用目标主机已有的 IP 自签名证书。客户端首次使用需要信任该证书；两个公开端口使用相同证书。宿主代理到平台使用独立本地 CA，并开启上游证书验证。
