# 已移除的重复课程系统

玄甲只保留原生 `Dojo → DojoModule → DojoChallenge` 课程主干。曾用于重复 LMS 原型的以下表会在插件首次启动时按依赖顺序清理：

- `course_activity_responses`
- `course_resources`
- `course_activities`
- `course_profiles`

清理前会逐表记录结构和数量，并把全部行导出为权限 `0600` 的 gzip JSONL 快照；只有快照原子落盘并计算 SHA-256 后才会删除表。默认快照目录为 `/data/course-system-removal`，可用 `COURSE_SYSTEM_REMOVAL_SNAPSHOT_ROOT` 调整。删除逻辑只匹配上述固定白名单，不匹配通配符，也不会删除 Dojo、Challenge、Submission、Solve 或 Learning 域数据。
