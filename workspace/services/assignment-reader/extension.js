const vscode = require('vscode');
const path = require('path');
exports.activate = function (context) {
  context.subscriptions.push(vscode.commands.registerCommand('xuanjia.readAssignment', async (uri) => {
    const source = uri || vscode.window.activeTextEditor?.document.uri;
    const name = source ? path.basename(source.fsPath) : '作业说明.md';
    if (!['作业说明.md', 'README.md'].includes(name)) return vscode.window.showInformationMessage('请打开本题的作业说明.md 或 README.md。');
    await vscode.env.openExternal(vscode.Uri.parse('http://10.92.35.7:8080/workspace/instructions?file=' + encodeURIComponent(name)));
  }));
};
