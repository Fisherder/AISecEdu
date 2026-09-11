# VPN 网页访问与免安装证书入口

10.92.35.7 已按用户要求切换为 VPN 内 HTTP 入口：

- 系统：<http://10.92.35.7:8080/>
- 原课程：<http://10.92.35.7:8080/ollydbg-practice~003a97d0/reverse-debugging/ollydbg-auth>
- Workspace：`http://10.92.35.7:4443`，由课程页面自动取得授权地址。

HTTP 链路不涉及证书安装、信任例外或浏览器证书检查开关。HTTP 自身不提供加密，应在已有 VPN 内使用。网页 VS Code 的基础编辑已验证；浏览器的安全上下文限制仍会影响自动剪贴板、部分 Webview 和预览功能。

## 排查结论

SSH 直接终止于宿主机，网页流量进入 Docker 容器。容器的 `workspace_net` 使用 `10.0.0.0/8`，VPN 同时分配 `10.38.x.x` 地址。原配置只为 `10.38.96.58` 添加了单地址回程路由；另一个已连接 SSH 的地址 `10.38.100.134` 在容器中却被路由到 `workspace_net`。不能将后者身份直接认定为老师，但这证明其他 VPN 地址存在回程冲突。

部署证书包含 IP `10.92.35.7`，有效期到 2027-10-03；使用部署 CA 验证时，TLS 1.2/1.3 握手通过。老师电脑是否信任该内部 CA 尚未获得客户端证据。用户随后明确选择免安装证书访问，因此提供 HTTP 入口，不再依赖该信任条件。

9 月 11 日修复的 HTTP/HTTPS 错误跳转是真实问题，但那次验证不足以证明老师的 VPN 路径已恢复。本文的网络复现与 HTTP 验证补充并取代当时的访问结论。

## 实现与持久配置

`ops/configure-ingress-return-route.sh` 在外层容器中标记从默认网络接口进入 TCP 22、80、443、4443 的服务连接。只为响应数据恢复路由标记，经路由表 10443 返回外层网关。实验流量继续使用原路由。配置由已有 `pwn.college.service` 启动钩子调用，重复执行不会产生重复规则。

`DOJO_HTTP_ENABLED` 默认关闭。当前服务器 `/data/config.env` 使用：

```dotenv
DOJO_HTTP_ENABLED=true
AISECEDU_PUBLIC_ORIGIN=http://10.92.35.7:8080
GLOBAL_AGENT_RUNTIME_PUBLIC_ORIGIN=http://10.92.35.7:8080/agent-runtime
GLOBAL_AGENT_RUNTIME_FRAME_ANCESTORS=http://10.92.35.7:8080
```

宿主的 `ops/deployment.env` 同时保存 `DOJO_HTTP_ENABLED=true`。设置贯穿初始化、Compose、应用和 Nginx 模板。HTTP 会话使用独立的 `aisecedu-vpn-session` HttpOnly Cookie，平台 Cookie 在转发到 Workspace 前移除。全局智能体的启动地址、会话 Cookie 和 iframe 来源也使用 HTTP。

8080 直接提供应用；旧的普通 HTTP 8443 请求跳到新入口并保留路径和查询。Workspace 4443 兼容普通 HTTP 与现有 TLS，由只监听容器回环地址的 14443 处理普通 HTTP 的授权、转发和 WebSocket，不新增宿主发布端口。关闭 HTTP 模式时，原 HTTPS 跳转行为仍可用。

部署仅重建 `ctfd`、`agent-runtime`、`nginx`；其他 17 个既有 AISecEdu 服务容器 ID 未变。没有修改或删除既有课程、课程成员、账号、宿主 SSH 和其他应用的 80/443 服务。验收复用了既有验收账号，并停止了本次为该账号创建的临时运行环境。

## 验证

| 检查 | 结果 |
| --- | --- |
| 隔离网络复现 | 修复前 VPN 地址连接失败；修复后 3 个不同来源地址的 4 个服务端口通过 |
| 实验网络回归 | 内部双向 HTTP 通信和 `10.0.0.0/8` 路由保留 |
| 真实 VPN 路径 | 临时移除当前 VPN 地址的单地址例外后，HTTP 主页、登录、Workspace 仍返回 200 |
| Nginx 模式回归 | HTTP 开启与关闭两种配置均通过语法和跳转检查 |
| 真实浏览器 | 默认证书检查设置，原账号登录、原课程访问通过，无私有站点 HTTPS 请求 |
| Windows 桌面 | 启动完成，1280×800 桌面通过 `ws://10.92.35.7:4443` 连接 |
| VS Code | 工作台加载与未保存临时文本的实际键盘输入通过 |
| 教学智能体 | 启动票据交换、HTTP 会话和已认证课件 API 返回正常 |
| 运行环境状态 | 应用、数据库、智能体与监控健康；只清理本次创建的验收运行环境 |

全量 `ops/verify-local.sh` 在既有 `ops/verify-ai-routing.py:956` 的 AI 出题模拟断言处停止。将 `DOJO_HTTP_ENABLED=false` 后重复该自检，仍在同一断言失败；本次未更改出题逻辑，也未将全量检查报告为通过。上表访问专项与真实浏览器链路独立验证通过。仍待老师在自己的 VPN 电脑上返回复测结果。

网络回归可在 Linux 宿主运行：

```bash
sudo ./ops/verify-ingress-return-route.sh
```

该脚本只在隔离 network namespace 中构造网络，退出后清理自己创建的 namespace 和测试进程。

## 回滚

服务器备份：`/srv/aisecedu-dojo/cache/vpn-http-backup-20260911/`。回滚 HTTP 模式时，将两份配置中的 `DOJO_HTTP_ENABLED` 改回 `false`，将公共入口和智能体入口恢复为 `https://10.92.35.7:8443` 及其 `/agent-runtime` 路径，恢复对应 iframe 来源后，重新创建上述三个服务。VPN 回程修复可独立保留，无需回滚路由或课程数据。
