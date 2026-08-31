# 本地手动验收课程

`manual-platform-check.yml` 定义了一个持久的人工验收场，包含“平台手动验收”
和“安全场景模拟”两个单元，覆盖 Terminal、Code、Desktop、SSH、home 持久化、
Workspace Web 反向代理，以及统一模拟引擎。九道题分别验证：

- 终端输入输出和动态答案提交；
- 日志检索以及 Terminal/Code 两种文件查看方式；
- home 文件跨工作区重启持久化与 Unix 权限；
- 挑战内 HTTP 服务、Workspace HTTPS 子域名和签名反向代理；
- 无线接入异常诊断；
- 移动终端权限滥用调查；
- 功耗侧信道泄漏评估；
- 工控 PLC 非授权写入处置；
- GNSS 欺骗信号识别与降级。

后五道题不启动容器、不提交 Flag，但仍与普通 CTF 题共用课程目录、题目入口、
作答记录、评分、Tutor、Guide 和完成状态。它们分别覆盖拓扑、频谱、证据表、
指标、时间线、条件动作、错误分支、状态回放和自动完成等引擎能力。

创建普通测试账号、验收课程并完成选课：

```bash
./ops/provision-manual-test.py
```

附加 `--verify-startup` 会逐题启动并停止工作区，验证 Kata 运行时、题目文件、Web
监听端口和签名代理，但不会读取或提交答案凭证，也不会执行题目步骤：

```bash
./ops/provision-manual-test.py --verify-startup
```

重复执行会复用已有账号和课程。只有确定可以删除该课程的现有进度时，才使用
`--replace-dojo` 从当前 YAML 重新创建它。运行凭据保存在被 Git 忽略的
`data/manual-test-account.txt`，权限为 `0600`。
