(function(){
  'use strict';
  const roots = Array.from(document.querySelectorAll('[data-workspace-ssh]'));
  if (!roots.length) return;
  async function refresh(root){
    const status=root.querySelector('[data-ssh-status]');
    const refreshButton=root.querySelector('[data-ssh-refresh]');
    refreshButton.disabled=true;
    status.textContent='正在确认你的密钥与当前题目环境…';
    try{
      const response=await CTFd.fetch('/pwncollege_api/v1/workspace/ssh',{credentials:'same-origin'});
      const data=await response.json();
      if(!response.ok||!data.success)throw Error(data.error||'无法读取 SSH 连接信息，请重新登录或重试。');
      root.querySelector('[data-ssh-command]').value=data.command;
      root.querySelector('[data-ssh-config]').value=data.config;
      root.querySelector('[data-ssh-fingerprint]').textContent=data.host_fingerprint||'尚未配置指纹，请向教师核对后连接';
      root.querySelector('[data-ssh-sftp]').textContent=data.sftp_command;
      root.querySelector('[data-ssh-copy-command]').disabled=false;
      root.querySelector('[data-ssh-copy-config]').disabled=false;
      const guest=root.querySelector('[data-ssh-guest-note]');
      guest.hidden=!(data.guest_type&&/windows/.test(data.guest_type));
      guest.textContent='本题的 SSH 连接外层 Linux 工作区；Windows 客户机操作请使用远程桌面。';
      status.textContent=!data.key_count?'还未绑定 SSH 公钥。请先到账号设置添加自己的公钥。':!data.active?'公钥已绑定，当前没有运行中的题目。请先启动环境。':!data.ready?'公钥已绑定，题目环境仍在准备；就绪后即可连接。':'公钥已绑定，可连接自己的当前题目：'+(data.current_challenge?.challenge_id||'工作区')+'。';
    }catch(error){status.textContent=error.message;}
    finally{refreshButton.disabled=false;}
  }
  async function copy(root, selector){
    const field=root.querySelector(selector),result=root.querySelector('[data-ssh-result]');
    try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(field.value);result.textContent='已复制。';return;}}catch(_){}
    field.focus();field.select();
    try{if(document.execCommand('copy')){result.textContent='已复制。';return;}}catch(_){}
    result.textContent='文本已选中，请按 Ctrl+C（Mac 按 ⌘C）复制。';
  }
  for(const root of roots){
    if(root.dataset.sshInitialized)continue;
    root.dataset.sshInitialized='true';
    root.querySelector('[data-ssh-refresh]').addEventListener('click',()=>refresh(root));
    root.querySelector('[data-ssh-copy-command]').addEventListener('click',()=>copy(root,'[data-ssh-command]'));
    root.querySelector('[data-ssh-copy-config]').addEventListener('click',()=>copy(root,'[data-ssh-config]'));
    refresh(root);
  }
  window.addEventListener('dojo:ssh-opened',()=>roots.forEach(refresh));
  window.addEventListener('dojo:attempt-changed',()=>roots.forEach(refresh));
  window.addEventListener('dojo:workspace-stopped',()=>roots.forEach(refresh));
})();
