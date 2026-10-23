# 模拟学生账号的做题情况已重置（2026-09-21）

## 重置对象

| 账号 | uid | 说明 |
| --- | --- | --- |
| 2022211575 | 7208 | 此前用它完成过本题（SOLVED） |
| 2022210194 | 7064 | 改题复测用的第二个学生账号 |

## 做了什么

1. **删除本道题（challenge_id=1459 / ollydbg-auth）的作答记录**：
   - `learning_attempts`：107 条（含 1 条 SOLVED、ACTIVE/INTERRUPTED/STOPPED 若干）——已全部删除；
   - 关联数据一并清理：`learning_evidence_events` 385 条、`learning_assessments` 2 条、
     `learning_tutor_messages` 26 条（按 attempt_id 级联删除）。
2. **删除客户机磁盘卷** `dojo-lab-state-7208`、`dojo-lab-state-7064`：
   下次启动环境时客户机磁盘会从初始种子重建，`C:\Lab` 里的补丁副本回到原始状态。
3. 停止并清理了两账号的运行环境（当前无 `user_*` 容器）。

## 没有改动

- 账号本身、课程成员关系、密码；
- 学生 home 目录（`/data/homes/7208`、`/data/homes/7064`，里面的 shell 历史与笔记保留）；
- 其他学生与教师的任何数据；CTFd `solves` 表本来就是 0 条，未受影响。

## 复核结果

```
learning_attempts（两账号，本题）：0 条
solves 表：0 条
题目页（两账号）：不再出现「已完成 / 已解决」等完成类字样
```

## 如何重新演示

用上面任一账号登录 → 进入题目 → 启动题目 → 打开桌面：客户机是全新的
（`method1.exe` / `method2.exe` 未改动、无 `flag.txt`），可按新题面重新做一遍两种方法。
