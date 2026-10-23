# 编码作业规范 v1.1.0

学生在平台 VS Code 中编写代码，由检查脚本执行核验。不得转成问答、上传报告或输入预设答案。

## 工程

Linux 编码作业使用 `/home/hacker/courses/<course-slug>/hwNN-<topic>/`。NN 是课程内稳定作业编号；不能由当前排序或批次位置临时推导。尚无明确编号时，先读取课程作业信息或询问教师，不能默认为 hw01。

VS Code 打开 `hwNN-<topic>.code-workspace`；显示标题含“第NN次作业”和主题。主要编辑文件直接放在工程根目录，新终端 cwd 同一目录。平台文件打包时将学生起始文件放在 `starter/`；初始化为学生拥有的真实工作目录。`/challenge` 只承载平台工具，不能当学生项目根目录。

必须有 README.md、主源码、公开测试、Makefile 和编辑器配置。保留学生已有文件；遇到新旧目录冲突时停下并说明。禁止靠每次复制覆盖源码恢复工程。

## 操作与核验

统一 `make check` 公开自测，`make submit` 正式核验。检测器自动保留源码哈希、题目标识、测试版本、运行状态及逐项结果；学生不手写报告。不要求新增长篇文字答案证明完成。

验收必须包含：起始未实现版本不通过、参考实现通过、边界条件、重复运行、环境重建后代码仍在。正式评分代码与学生代码权限分开。不可用“固定输出一个通过标记”代替真实编译执行。

## 结构化输出

实践题 spec 必须保留 `coding_workspace: {course, assignment, title, source}`，其中 source 是主源码文件名，assignment 形如 hw01-safe-copy。并提供 `codingGrading: {publicCommand: "make check", formalCommand: "make submit", submission: "code", reportRequired: false, testVersion: "..."}`。这些是校验元数据，不表示平台凭声明就会创建正确检测器；仍须通过已有实际环境验证和人工审核。

生成器如果无法构建满足本规范的运行包，应保留草稿并报告具体缺项，不能发布一个外观相似的问答题。其他操作系统需先有对应类型规范和经过验收的运行模板，不能照抄 Linux 路径。

## 编辑器体验

默认禁用 VS Code 的 Git/GitHub 源码管理扩展与装饰，避免把备份工具当作学生必须完成的流程。底层文件快照不依赖编辑器 Git 功能。提供 Markdown 排版预览用于阅读作业说明；保持预览脚本与代码执行关闭。重置代码必须具名、限于本题工作区、先备份并显示确认，不能把重启误作清空个人磁盘。
