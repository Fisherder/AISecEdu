# 改题后复测：真实浏览器完整走通（2026-09-21）

## 改动摘要（题目只留思考题）

| 位置 | 内容 |
| --- | --- |
| 题面（DB `dojo_challenges.description` + `data/dojos/003a97d0/dojo.yml` + `challenge-description.md`） | 标题改为「用两种方法破解注册验证」；只保留「思考题：用两种方法破解 crackme.exe」+ 文件说明 + 操作提示；删除「你会学到什么 / 先认识要破解的程序 / 一、修改分支判断 / 三、生成工程」 |
| 章节导引（`dojo_resources` + YAML） | 判定表只留「读懂验证程序 / 思考题 / 溢出演示（不参与判定）」 |
| 章节描述（`dojo_modules.description`） | 改为"复制两个副本，用两种不同方法让错误密码也能注册成功" |
| **判分**（镜像内 `verifier.py`） | 不再校验 `demo.exe`；只校验 `method1.exe` / `method2.exe` 命中两种不同候选；提示改为 "Two different crackme patches verified." |
| 客户机 `C:\Lab\README.txt` | 删除「实验一：修改分支判断」整段（已重新注入 seed、重建镜像） |

## 复测（另一名学生账号 2022210194）

流程与结果：

1. 浏览器登录 ✓（跳转 `/student`）
2. 题目页题面核对：含「思考题」✓、不含「修改分支判断 / 生成工程 / 主实验」✓
3. 启动环境 → 客户机就绪 ✓（约 70 秒）
4. 独立工作区打开桌面：noVNC 加载 ✓
5. 客户机内**只做两处补丁**（不做 demo.exe）：
   - `method1.exe` 0x161E ← `90 90`（remove-condition）
   - `method2.exe` 0x1618 ← `33 C0`（force-comparison）
6. 运行检查工具 → 弹窗：
   ```
   OK
   pwn.college{041I4JENT7QPIllp4iEdvsofBE3.0VO1QTMsQjNwczW}
   Two different crackme patches verified. The flag was copied and saved to C:\Lab\flag.txt.
   ```
7. 题目页提交 flag → 横幅：**🎉 你已经完成了 OllyDbg 条件分支修改与双方法认证绕过！🎉 查看评分**

截图：`r2-challenge.png`（题面）、`r2-desktop.png`（独立工作区桌面）、`r2-checker.png`（检查工具 OK）、`r2-submitted.png`（提交成功）

## 结论

改题后，学生**不再需要做 demo.exe 的 JE→JNE**，按新题面走完两种方法即可通过并完成；真实浏览器全流程可稳定复现。
