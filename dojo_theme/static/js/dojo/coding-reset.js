(() => {
  'use strict';
  if (window.XuanjiaCodingReset) return;
  window.XuanjiaCodingReset = true;
  async function api(method, body) {
    const response = await CTFd.fetch('/pwncollege_api/v1/workspace/environment', {
      method, headers: {'Content-Type': 'application/json', 'CSRF-Token': init.csrfNonce},
      ...(body ? {body: JSON.stringify(body)} : {})
    });
    const data = await response.json();
    if (!response.ok || !data.success || data.result?.success === false) throw new Error(data.error || data.result?.error || '重置操作未完成，请稍后重试。');
    return data;
  }
  function notice(button, message, failed) {
    const root = button.closest('.workspace-controls');
    const banner = root.querySelector('.workspace-notification-banner');
    banner.replaceChildren();
    banner.hidden = false;
    banner.style.display = 'block';
    banner.setAttribute('role', failed ? 'alert' : 'status');
    banner.append(document.createTextNode(message + ' '));
    const link = document.createElement('a');
    link.textContent = '查看恢复点'; link.href = '/workspace/environment'; link.target = '_blank'; link.rel = 'noopener';
    if (!failed) banner.append(link);
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-coding-reset]');
    if (!button || button.disabled) return;
    event.preventDefault(); button.disabled = true;
    try {
      const state = await api('GET');
      if (!state.supported || String(state.challengeId) !== button.dataset.challengeId) throw new Error('请先启动这道编码题。重置仅作用于当前账号正在运行的本题工程。');
      const guard = {challengeId: state.challengeId, taskId: state.manifest.taskId, templateVersion: state.manifest.templateVersion};
      const preview = (await api('POST', {operation: 'reset', ...guard})).result.result;
      const message = '先在 VS Code 保存所有文件，并关闭正在编辑的文件标签，避免未保存内容在重置后写回。\n\n系统会自动保存当前代码快照，然后将以下文件恢复为起始骨架：\n' + preview.files.join('\n') +
        (preview.archiveFiles?.length ? '\n\n以下旧题文件会移入备份：\n' + preview.archiveFiles.join('\n') : '') +
        '\n\n其他个人文件、其他题目和已提交成绩保留。恢复点可以在“工程与核验”中找回。';
      if (!window.AISecEduUI?.confirm) throw new Error('确认对话框未加载，请刷新页面后重试。');
      const confirmed = await window.AISecEduUI.confirm(message, {title: '重置本题代码', subtitle: '仅恢复本题起始文件 · 自动备份', confirmLabel: '备份并重置', confirmStyle: 'danger', kind: 'danger'});
      if (!confirmed) return;
      const result = (await api('POST', {operation: 'reset', apply: true, ...guard})).result.result;
      if (!result.applied || !result.backup?.id) throw new Error('未确认恢复点，操作结果请到工程与核验检查。');
      notice(button, '本题代码已重置。恢复点：' + result.backup.id + '。重新打开文件即可编写。', false);
      window.dispatchEvent(new CustomEvent('dojo:coding-reset', {detail: result}));
    } catch (error) { notice(button, error.message, true); }
    finally { button.disabled = false; }
  });
})();
