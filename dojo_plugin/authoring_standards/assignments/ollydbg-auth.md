# 第一次 OllyDbg 实践目录规范 v1.0.0

适用课程 ID `3839952`、题型 practice、题目标识 `ollydbg-auth`，运行环境 Windows 2000。学生目录固定为 `C:\Courses\software-security\lab01-auth-analysis`，保留原题标识、原始检测器和动态 Flag 协议。

- 根目录为 `README.txt`、`lab.json`、`check.cmd`、参考源码 `main.cpp`、`materials/` 和 `work/`。
- `materials/crackme-original.exe` 为原始题目材料；课堂补充通过明确标注不参与判定的入口访问。
- `work/method1.exe`、`work/method2.exe` 是实际工作对象。不要同时引导学生编辑旧路径。
- 桌面的题目目录、OllyDbg 工作目录、编辑器和检查入口都指向新工作区。
- 旧 `C:\Lab` 只用于兼容原检测器及保存环境辅助文件。初始化只复制不存在的文件，不覆盖已有新工作区内容；显式执行 `check.cmd` 才同步工作副本，并在环境维护目录备份旧文件。
- 不修改既有认证检查逻辑，不要求报告，不声称新增了独立自测或新的正式证据格式。
- 重新启动核对目录与入口；历史整理回执不能替代核对。目录迁移对未知学生文件保持原样。
