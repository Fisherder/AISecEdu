# 软件安全 · Windows 实践目录规范 v1.0.0

适用于课程 ID `3839952`、题型 `practice`、Windows 2000 实验 3–7。实验 1、2 的既有环境与路径保持不动；本规范从实验 3 起生效。

## 固定根路径

Windows 学生工作区固定为：

`C:\Courses\software-security\<labNN-topic>`

- `software-security` 是课程目录，`labNN-topic` 是稳定小写英文 slug，编号在课程内唯一、连续、按编号排序。
- 不得把实验放在 `C:\Lab` 根或 `C:\Lab\LabN` 等临时目录；`C:\Lab` 只保留实验 1/2 兼容环境和维护工具，不属于任何新实验的学生工作区。
- 不得用中文标题、显示名或随机名称作为目录名。

## 每道实验的固定结构

```text
labNN-topic\
  README.txt      操作说明、编辑对象、检查入口、恢复方式、不参与判定项
  lab.json        机器可读清单（schemaVersion、course、assignment、root、layoutVersion、editable、materials、graderRoot、submitEntry、reportRequired）
  check.cmd       唯一的学生检查入口；调用工作区外的正式检测器
  materials\      原始输入、参考源码、不可变程序；不放学生可变文件
  work\           学生实际修改的对象；没有可变文件时不创建
```

规则：

- 根目录至少包含 `README.txt`、`lab.json`、`check.cmd`；`materials` 与 `work` 按用途创建，空的、无用途目录不要生成。
- 安装包、检测器、隐藏测试、运行日志、旧版本、其他实验和教师答案不得进入学生工作区；正式检测器放在 `C:\Lab\Environment` 或既有维护目录，路径由 `check.cmd` 调用。
- `check.cmd` 必须显式同步 `work` 中被检测的文件到检测器读取位置，再调用正式检测器；不能只检查旧兼容副本。
- 清单、题面、桌面入口、检查器实际路径和 `workspaceLayout` 必须一致；不能只靠隐藏文件属性实现隔离。
- 迁移只初始化不存在的学生文件；已有 `work` 内容不得被启动脚本覆盖。旧兼容目录不能作为第二套可编辑路径。
- 新实验或重建实验必须按本规范创建并在真实客户机核对目录；仅通过静态清单不算环境验收。

## 编号与顺序

- `lab03-shellcode`、`lab04-fuzzing`、`lab05-seh-virtual`、`lab06-format-string`、`lab07-webgoat` 为当前标准 slug。
- 新增实验必须使用下一个未占用的 `labNN-topic`；不得复用已删除编号或把实验嵌入其他实验目录。
- 章节/界面显示名可以中文，但目录和 `lab.json.assignment` 始终使用 slug。
