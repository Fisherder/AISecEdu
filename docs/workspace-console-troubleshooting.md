# 工作区终端按键排查

本页用于区分浏览器焦点、VS Code 按键处理与托管扩展安装问题。实际操作在本人测试工作区进行；共享平台版本、构建和部署由维护者按[开发规则](development/standards.md)安排。

## 先记录实际条件

- 记录源码提交、工作区 profile、浏览器版本，以及页面是 HTTP 还是 HTTPS。相同 code-server 在 localhost 与普通 HTTP 来源下的表现可能不同。
- 等待编辑器加载完成，使用命令面板中的 `Terminal: Focus Terminal` 聚焦实际终端，再测试按键。
- 分别记录普通 Shell、Vim 插入模式及终端查找框中的 Esc 行为。普通终端应收到一个 ESC 字节；查找框应关闭，不向终端输入 ESC。
- 浏览器自动化的合成键盘事件不等于原生终端输入。截图中的 Vim `INSERT` 状态及最终文件内容，比“已经调用 send_keys”更能说明实际结果。

## 核对实际安装产物

代码工作区由[启动器](../workspace/services/code.nix)准备用户状态，托管扩展位于：

```text
~/.local/share/code-server/extensions/
```

`xuanjia.assignment-reader` 的安装目录通常带版本号及 `-aisecedu` 后缀。目录中必须有规范文件名 `package.json` 和 `extension.js`，`extensions.json` 中应包含该扩展的实际标识与版本。只有 Nix store 哈希基名的文件不能作为有效扩展 manifest。

可在本人已启动的测试工作区只读检查 manifest 和索引：

```sh
python3 - <<'PY'
import json
from pathlib import Path

root = Path.home() / '.local/share/code-server/extensions'
for manifest in sorted(root.glob('*/package.json')):
    try:
        package = json.loads(manifest.read_text())
    except (OSError, ValueError) as error:
        print(manifest.parent.name, type(error).__name__)
        continue
    if (package.get('publisher'), package.get('name')) == ('xuanjia', 'assignment-reader'):
        bindings = package.get('contributes', {}).get('keybindings', [])
        print(manifest.parent.name, package.get('version'), [
            (binding.get('key'), binding.get('command'))
            for binding in bindings
            if binding.get('key') == 'escape' or binding.get('command') == 'workbench.action.terminal.sendSequence'
        ])
index = root / 'extensions.json'
if index.exists():
    for entry in json.loads(index.read_text()):
        if entry.get('identifier', {}).get('id') == 'xuanjia.assignment-reader':
            print(entry['identifier']['id'], entry.get('version'), entry.get('relativeLocation'))
PY
```

该扩展的原生 Esc 声明使用 VS Code 内置 `workbench.action.terminal.sendSequence`，发送单个 ESC，并排除查找、文本选择、建议及辅助阅读等上下文。不要通过重新启用 DOM 合成 Esc 来掩盖扩展未加载的问题。

## 保留用户状态并确认修复

[托管同步器](../workspace/services/code-extensions.py)保留用户设置及用户自行安装的同 ID 扩展；自定义版本可能优先于托管版本。先核对其来源和实际按键声明，不直接删除整个扩展目录或用户状态。

源码中的 manifest 正确不代表运行工作区已更新。维护者更新 profile 后，在新测试工作区重复实际 Vim 插入、Esc、保存及文件内容核验，并测试查找框 Esc。仅重启 Web 服务不会更新已构建的托管扩展。

提交脱敏的版本、操作步骤、实际结果和证据位置。工作区签名 URL 是访问凭据，不应复制到公开 PR、日志或截图中。快速安装产物回归与完整浏览器 CI 的职责见[自动协作验证说明](development/ai-autopilot.md#验证)。
