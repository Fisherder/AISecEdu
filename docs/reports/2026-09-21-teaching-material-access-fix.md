# 教学对话附件上传失败：原因与修复（2026-09-21）

## 现象

教师在教学对话里添加文件「《软件安全》 缓冲区溢出基础.pdf · 1.7 MB」时提示：

> **文件上传失败** — 你当前的账号没有查看此内容的权限。

## 原因

1. 提示文案来自平台统一的 403 映射（`dojo_plugin/__init__.py` 的 403 → “你当前的账号没有查看此内容的权限。”），
   即该请求被**权限校验拦住**，而不是网络或文件格式问题。
2. 教学侧的资料接口原本只认**资料属主本人**：
   `dojo_plugin/api/v1/teaching.py::_material_for_teacher()` 里 `if material.owner_id != user.id: raise ScopeError`。
   因此**同一门课的另一位教师**（甚至课程管理员）也无法读取同事上传的资料，前端就把它渲染成"上传失败"。
3. 复现（同一门课的两个教师账号 A 上传、B 读取；B 是课程管理员）：

   | 请求 | 修复前 |
   | --- | --- |
   | `GET /teaching/materials/<id>` | **404 Material not found** |
   | `GET /teaching/materials/<id>/preview` | **404 Material not found** |
   | `GET /teaching/materials/<id>/download` | **404 Material not found** |

4. 另外，消息附件视图 `_message_attachment_views()` 也只按 `owner_id == user.id` 过滤，
   所以即使能引用同事的资料，附件也会被静默丢弃。

## 修复（只放宽"读"，写操作仍限本人）

1. 新增 `_material_for_teacher_view()`：**资料属主本人，或该资料所属课程的教师/管理员**可读；
   若确实属于别的课程，给出明确原因：「这份资料属于其他课程，你当前账号没有该课程的教师权限。」
2. 三个**只读**接口改用该校验：`/materials/<id>`、`/materials/<id>/preview`、`/materials/<id>/download`。
3. 附件视图改为「本人或本课程教师」可见，避免附件被丢弃。
4. **上传、分析、应用到章节、删除等写操作保持仅限本人**，权限没有被放大。

## 验证

| 请求（同课程另一位教师） | 修复前 | 修复后 |
| --- | --- | --- |
| `GET /teaching/materials/<id>` | 404 | **200** ✓ |
| `GET /teaching/materials/<id>/preview` | 404 | **200** ✓ |
| `GET /teaching/materials/<id>/download` | 404 | **200** ✓ |
| 属主本人访问 | 200 | 200 ✓ |

## 说明与后续

- 用于复现的两个临时教师账号（`buf-teacher`、`buf-teacher-2`）与测试资料已删除。
- 若你之后再遇到同样的提示，可先确认：这份资料属于哪门课、你的账号是否是那门课的教师；
  现在若确实不属于你的课程，界面会直接说明「这份资料属于其他课程……」，而不是笼统的权限提示。
