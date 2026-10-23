(function () {
  'use strict';
  const BASE='/themes/dojo_theme/static/';
  const CHANNEL='xuanjia:console-v1';
  const instances=new WeakMap();
  const consoles=new Set();
  let nextId=0;
  function nonce(){const value=new Uint8Array(16);crypto.getRandomValues(value);return Array.from(value,byte=>byte.toString(16).padStart(2,'0')).join('');}
  const icons={collapse:'<path d="m14 6-6 6 6 6"/>',expand:'<path d="m10 6 6 6-6 6"/>',clipboard:'<rect x="7" y="4" width="10" height="4" rx="2"/><path d="M7 6H5v15h14V6h-2M8 12h8M8 16h6"/>',keyboard:'<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h1m3 0h1m3 0h1m3 0h1M6 13h1m3 0h1m3 0h1m3 0h1M7 16h10"/>',display:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',connection:'<path d="M6 3v4m6-4v4M3 7h12v3a6 6 0 0 1-6 6v5m0-5a6 6 0 0 1-6-6V7m14 8 4-4m0 0v5m0-5h-5"/>',fullscreen:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>'};
  function svg(name){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[name]+'</svg>';}
  function button(label,action,css='rc-button'){const node=document.createElement('button');node.type='button';node.className=css;node.textContent=label;node.addEventListener('click',action);return node;}
  function bytes(text){return new TextEncoder().encode(text).length;}
  function validate(text){if(typeof text!=='string'||text.includes('\0'))throw Error('剪贴板只支持不含空字符的文本。');if(bytes(text)>65536)throw Error('文本超过 64 KB，请分段粘贴。');return text;}
  function stylesheet(doc){if(doc.querySelector('[data-remote-console-style]'))return;const link=doc.createElement('link');link.rel='stylesheet';link.href=BASE+'css/remote-console.css?v=console-fixed-toggle-20261023-1';link.dataset.remoteConsoleStyle='1';doc.head.append(link);}
  function save(blob,name){const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  class Console {
    constructor(surface,frame,adapter=null){
      this.surface=surface;this.frame=frame;this.adapter=adapter;this.pending=new Map();this.sequence=0;this.group=null;this.connected=false;this.ready=false;this.readonly=false;this.copyText='';this.draftText='';this.id='rc-'+(++nextId);this.nonce=nonce();
      stylesheet(document);this.host=document.createElement('div');this.host.className='rc-host';this.host.dataset.consoleId=this.id;
      this.rail=document.createElement('nav');this.rail.className='rc-rail';this.rail.setAttribute('aria-label','环境工具');
      this.railTools=document.createElement('div');this.railTools.className='rc-rail-tools';this.railTools.id=this.id+'-tools';
      this.toolbarToggle=button('',()=>this.toggleToolbar(),'rc-tool rc-rail-toggle');this.toolbarToggle.setAttribute('aria-controls',this.railTools.id);this.rail.append(this.toolbarToggle,this.railTools);
      try{this.toolbarCollapsed=localStorage.getItem('xuanjia-console-toolbar-collapsed')==='true';}catch(_){this.toolbarCollapsed=false;}
      this.panel=document.createElement('section');this.panel.className='rc-panel';this.panel.hidden=true;this.panel.id=this.id+'-panel';this.panel.setAttribute('aria-label','环境工具面板');
      this.status=document.createElement('div');this.status.className='rc-status';this.status.setAttribute('role','status');this.status.setAttribute('aria-live','polite');this.status.hidden=true;
      this.buttons={};
      for(const [key,label] of Object.entries({clipboard:'剪贴板',keyboard:'按键',display:'显示',connection:'连接'})){
        const b=button('',()=>this.open(key,true),'rc-tool');b.innerHTML=svg(key)+'<span>'+label+'</span>';b.title=label;b.setAttribute('aria-controls',this.panel.id);b.setAttribute('aria-expanded','false');this.railTools.append(b);this.buttons[key]=b;
      }
      const full=button('',()=>this.fullscreen(),'rc-tool rc-fullscreen');full.innerHTML=svg('fullscreen')+'<span>全屏</span>';full.title='进入或退出全屏';this.railTools.append(full);this.renderToolbar();
      if(frame){
        const parent=frame.parentElement;parent.insertBefore(this.host,frame);this.host.append(this.rail,frame,this.panel,this.status);frame.classList.add('rc-frame');frame.addEventListener('load',()=>this.bindFrame());
        new MutationObserver(()=>this.update()).observe(frame,{attributes:true,attributeFilter:['data-workspace-service','data-workspace-id','data-workspace-view-only','src']});
        this.update();if(frame.src&&frame.src!=='about:blank')this.bindFrame();
      }else{surface.classList.add('rc-standalone-surface');surface.append(this.host);this.host.classList.add('rc-standalone');this.host.append(this.rail,this.panel,this.status);this.update();}
      document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!this.panel.hidden&&this.panel.contains(document.activeElement)){event.preventDefault();this.close();}});
      consoles.add(this);
    }
    renderToolbar(){
      const collapsed=Boolean(this.toolbarCollapsed);
      this.host.classList.toggle('is-toolbar-collapsed',collapsed);
      this.rail.inert=false;
      this.rail.setAttribute('aria-hidden','false');
      this.railTools.hidden=collapsed;
      this.surface.classList.toggle('is-console-toolbar-collapsed',collapsed);
      this.toolbarToggle.innerHTML=svg(collapsed?'expand':'collapse');
      const label=collapsed?'展开工具栏':'收起工具栏';
      this.toolbarToggle.title=label;
      this.toolbarToggle.setAttribute('aria-label',label);
      this.toolbarToggle.setAttribute('aria-expanded',String(!collapsed));
    }
    toggleToolbar(){
      this.toolbarCollapsed=!this.toolbarCollapsed;
      if(this.toolbarCollapsed)this.close(false);
      this.renderToolbar();
      try{localStorage.setItem('xuanjia-console-toolbar-collapsed',String(this.toolbarCollapsed));}catch(_){}
      this.toolbarToggle.focus({preventScroll:true});
    }
    update(){
      this.service=this.adapter?'desktop':String(this.frame.dataset.workspaceService||'').split(':')[0].trim();
      this.workspaceId=this.adapter?this.adapter.workspaceId:this.frame.dataset.workspaceId||new URL(this.frame.src||'about:blank',location.href).pathname.match(/\/(?:workspace|w)\/([a-f0-9]{12})\//)?.[1];
      this.readonly=this.adapter?Boolean(this.adapter.readonly):this.frame.dataset.workspaceViewOnly==='true'||new URL(this.frame.src||'about:blank',location.href).searchParams.get('view_only')==='1';
      const supported=['desktop','desktop-windows','code'].includes(this.service);this.host.hidden=!this.service;this.host.classList.toggle("is-unsupported",!supported);this.rail.hidden=!supported;this.supported=supported;this.renderToolbar();if(!supported)this.close(false);
      if(this.frame)this.frame.closest('.challenge-workspace')?.classList.toggle('rc-enhanced',supported);
      this.buttons.keyboard.hidden=this.service==='code';this.buttons.display.hidden=this.service==='code';
      this.buttons.clipboard.disabled=this.readonly||!this.ready;for(const key of ['keyboard','display','connection'])this.buttons[key].disabled=!this.ready;
      if(this.currentWorkspaceId!==this.workspaceId){this.currentWorkspaceId=this.workspaceId;this.close(false);this.copyText='';this.draftText='';this.ready=false;this.connected=false;this.nonce=nonce();for(const job of this.pending.values()){clearTimeout(job.timer);job.reject(Error('实验环境已变化，请重新操作。'));}this.pending.clear();}
    }
    bindFrame(){
      this.update();
      if(this.frame.dataset.workspaceService?.split(':')[0].trim()==='code')this.kind='code';else this.kind='desktop';
      try{
        const doc=this.frame.contentDocument;if(!doc||!doc.body){this.initializeFrame();return;}
        const script=doc.createElement('script');script.src=BASE+'js/dojo/remote-console-frame.js?v=console-fixed-toggle-20261023-1';script.dataset.consoleFrame='1';
        if(!doc.querySelector('[data-console-frame]'))doc.head.append(script);
        this.initializeFrame();
      }catch(error){this.initializeFrame();}
    }
    initializeFrame(){
      if(!this.frame?.contentWindow)return;
      this.frame.contentWindow.postMessage({channel:CHANNEL,type:'init',nonce:this.nonce,kind:this.kind,workspaceId:this.workspaceId,readonly:this.readonly},this.frameOrigin());
    }
    frameOrigin(){return new URL(this.frame.src,location.href).origin;}
    command(action,payload={}){
      if(this.adapter)return this.adapter.command(action,payload);
      if(!this.ready)return Promise.reject(Error('环境工具仍在连接，请稍后重试。'));
      const request=this.id+'-'+(++this.sequence);
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{this.pending.delete(request);reject(Error('操作未完成，请重试或重新连接画面。'));},15000);
        this.pending.set(request,{resolve,reject,timer});this.frame.contentWindow.postMessage({channel:CHANNEL,type:'command',nonce:this.nonce,request,action,payload},this.frameOrigin());
      });
    }
    receive(message){
      if(message.type==='hello'){this.initializeFrame();return;}
      if(message.nonce!==this.nonce)return;
      if(message.type==='ready'){this.ready=true;this.connected=message.connected;this.readonly=this.readonly||Boolean(message.readonly);this.buttons.clipboard.disabled=this.readonly||!this.ready;for(const key of ['keyboard','display','connection'])this.buttons[key].disabled=!this.ready;return;}
      if(message.type==='connection'){this.connected=Boolean(message.connected);if(this.group==='connection')this.render();return;}
      if(message.type==='reply'){
        const job=this.pending.get(message.request);if(!job)return;clearTimeout(job.timer);this.pending.delete(message.request);message.error?job.reject(Error(message.error)):job.resolve(message.result);return;
      }
      if(message.type==='clipboard-request'){this.open('clipboard');this.localArea?.focus();this.note('请在文字框中按 Ctrl/Cmd+V，再粘贴到环境。','info');}
      if(message.type==='gesture')this.gesture(message).catch(error=>this.note(error.message,'error'));
      if(message.type==='code-copy'){this.copyText=String(message.text||'');this.copyLocal(this.copyText).catch(error=>this.note(error.message,'error'));}
      if(message.type==='code-read-request')this.readLocalForCode(message.request);
    }
    async api(method='GET',body=null,capabilities=false){
      if(this.readonly)throw Error('当前为只读观察模式。');
      if(!this.workspaceId)throw Error('实验环境尚未连接。');
      const query=new URLSearchParams({workspaceId:this.workspaceId});if(capabilities)query.set('capabilities','1');
      const init={method,credentials:'same-origin',headers:{'Accept':'application/json','Content-Type':'application/json'}};
      if(body)init.body=JSON.stringify({...body,workspaceId:this.workspaceId});
      if(!window.CTFd&&this.adapter?.csrfNonce)init.headers['CSRF-Token']=this.adapter.csrfNonce;
      const response=await (window.CTFd?CTFd.fetch:fetch)('/pwncollege_api/v1/workspace/clipboard?'+query,init);
      const data=await response.json();if(!response.ok||data.success===false)throw Error(data.error?.message||data.errors?.[0]?.message||data.message||(typeof data.error==='string'?data.error:null)||'剪贴板操作失败，请重新连接后重试。');
      const state=data.data||data;if(state.workspaceId&&state.workspaceId!==this.workspaceId)throw Error('实验环境已变化，请重新操作。');return state;
    }
    async gesture(message){
      if(this.readonly)return;
      if(message.action==='paste'){this.note('正在粘贴…','info');validate(message.text);const state=await this.api('POST',{text:message.text});await this.command('chord',{name:message.shift?'paste-terminal':state.pasteChord||'paste'});this.note('已粘贴到当前窗口。');}
      else if(['copy','cut'].includes(message.action)){
        const state=await this.api('GET',null,true);if(state.backend==='x11'&&state.copyChord==='copy-terminal'&&!message.shift&&!message.meta){await this.command('chord',{name:message.action==='cut'?'cut':'copy'});return;}await this.command('chord',{name:message.action==='cut'?'cut':message.shift?'copy-terminal':state.copyChord||'copy'});
        await new Promise(resolve=>setTimeout(resolve,120));await this.copyRemote();
      }
    }
    note(text,kind='success'){this.status.textContent=text;this.status.dataset.kind=kind;this.status.hidden=false;clearTimeout(this.statusTimer);if(kind==='success')this.statusTimer=setTimeout(()=>{this.status.hidden=true;},5000);}
    async copyLocal(text){
      this.copyText=validate(text);
      let ok=false;
      if(window.AISecEduClipboard)ok=(await window.AISecEduClipboard.writeText(text)).ok;
      else{
        try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);ok=true;}}catch(error){}
        if(!ok){const area=document.createElement('textarea');area.value=text;area.style.cssText='position:fixed;left:-10000px';document.body.append(area);area.select();try{ok=document.execCommand('copy');}catch(error){}area.remove();}
      }
      if(ok){this.note('已复制到本机。');return true;}
      this.open('clipboard');this.remoteArea.value=text;this.remoteArea.focus();this.remoteArea.select();this.note('文字已选中，请按 Ctrl/Cmd+C 复制。','info');return false;
    }
    async copyRemote(){
      try{
        this.note('正在读取环境中的文字…','info');
        const state=this.service==='code'?await this.command('copy'):await this.api();
        if(!state||state.available===false)throw Error('剪贴板暂时不可读取，请先在环境中复制文字后重试。');
        const text=String(state.text??'');this.copyText=text;if(this.remoteArea)this.remoteArea.value=text;
        if(!text){this.note('环境剪贴板为空。','info');return;}await this.copyLocal(text);
      }catch(error){this.note(error.message,'error');}
    }
    async paste(text){
      if(text===''){this.localArea?.focus();this.note('请先在文字框中粘贴内容。','info');return;}
      try{
        validate(text);this.note('正在粘贴…','info');
        if(this.service==='code')await this.command('paste',{text});
        else{const state=await this.api('POST',{text});await this.command('chord',{name:state.pasteChord||'paste'});}
        this.note('已粘贴到当前窗口。');
      }catch(error){this.note(error.message,'error');}
    }
    readLocalForCode(request){
      this.open('clipboard');this.localArea.focus();this.localArea.value='';this.codeReadRequest=request;this.note('请在此按 Ctrl/Cmd+V，文字会粘贴到编辑器。','info');
    }
    open(group,toggle=false){
      if(toggle&&this.group===group&&!this.panel.hidden){this.close();return;}
      this.group=group;this.render();this.panel.hidden=false;
      for(const [key,b] of Object.entries(this.buttons)){b.classList.toggle('is-active',key===group);b.setAttribute('aria-expanded',String(key===group));}
    }
    close(restore=true){if(this.group==='clipboard'&&this.localArea)this.draftText=this.localArea.value;if(this.codeReadRequest){this.command('clipboard-read-reply',{request:this.codeReadRequest,error:'已取消粘贴'}).catch(()=>{});this.codeReadRequest=null;}this.panel.hidden=true;const previous=this.group;this.group=null;for(const b of Object.values(this.buttons)){b.classList.remove('is-active');b.setAttribute('aria-expanded','false');}if(restore&&previous)this.buttons[previous]?.focus();if(this.localArea)this.localArea.value='';if(this.remoteArea)this.remoteArea.value='';}
    row(label,node){const wrap=document.createElement('label');wrap.className='rc-field';const text=document.createElement('span');text.textContent=label;wrap.append(text,node);this.panel.append(wrap);}
    render(){
      this.panel.replaceChildren();const head=document.createElement('header');const title=document.createElement('h2');title.textContent=({clipboard:'剪贴板',keyboard:'特殊按键',display:'显示设置',connection:'连接工具'})[this.group];const close=button('',()=>this.close(),'rc-close');close.innerHTML=svg('close');close.setAttribute('aria-label','关闭工具面板');head.append(title,close);this.panel.append(head);
      const help=document.createElement('p');help.className='rc-help';this.panel.append(help);
      if(this.group==='clipboard'){
        help.textContent=this.service==='code'?'复制粘贴保留原有换行和缩进。也可使用 Ctrl/Cmd+C 与 Ctrl/Cmd+V。':'使用 Ctrl/Cmd+C 与 Ctrl/Cmd+V，或在这里粘贴文字。只交换文本，不额外发送回车。';
        this.localArea=document.createElement('textarea');this.localArea.rows=6;this.localArea.placeholder='在这里粘贴本机文字';this.localArea.spellcheck=false;this.localArea.setAttribute('aria-label','本机待粘贴文本');this.localArea.value=this.draftText;this.localArea.addEventListener('input',()=>{this.draftText=this.localArea.value;});
        this.localArea.addEventListener('paste',event=>{
          if(!this.codeReadRequest)return;const text=event.clipboardData?.getData('text/plain');if(typeof text!=='string')return;event.preventDefault();const request=this.codeReadRequest;this.codeReadRequest=null;this.command('clipboard-read-reply',{request,text}).catch(error=>this.note(error.message,'error'));
        });
        this.row('本机文字',this.localArea);this.panel.append(button('粘贴到当前窗口',()=>this.paste(this.localArea.value),'rc-button rc-primary'));
        this.remoteArea=document.createElement('textarea');this.remoteArea.rows=5;this.remoteArea.readOnly=true;this.remoteArea.spellcheck=false;this.remoteArea.value=this.copyText;this.remoteArea.setAttribute('aria-label','环境中可复制的文本');this.row(this.service==='code'?'编辑器文字':'环境剪贴板',this.remoteArea);
        this.panel.append(button(this.service==='code'?'复制选中文字到本机':'读取并复制到本机',()=>this.copyRemote()));
        const tools=document.createElement('div');tools.className='rc-inline';
        const input=document.createElement('input');input.type='file';input.accept='text/*,.c,.cpp,.h,.py,.js,.ts,.json,.md,.yaml,.yml';input.hidden=true;
        input.addEventListener('change',async()=>{const file=input.files?.[0];if(!file)return;try{if(file.size>65536)throw Error('文本文件超过 64 KB，请分段传输。');const text=validate(await file.text());this.localArea.value=text;this.draftText=text;this.note('文本已载入，点击粘贴即可。');}catch(error){this.note(error.message,'error');}input.value='';});
        tools.append(button('导入文本',()=>input.click(),'rc-link'),button('导出文字',()=>save(new Blob([this.remoteArea.value||this.localArea.value],{type:'text/plain;charset=utf-8'}),'剪贴板.txt'),'rc-link'),input);this.panel.append(tools);
        for(const node of this.panel.querySelectorAll('button:not(.rc-close),textarea'))node.disabled=this.readonly;
      }else if(this.group==='keyboard'){
        help.textContent='这些按键直接发送给远程桌面，浏览器不会截获。';const grid=document.createElement('div');grid.className='rc-keygrid';
        for(const [label,name] of [['Ctrl+Alt+Del','ctrl-alt-del'],['Alt+Tab','alt-tab'],['Ctrl+Shift+Esc','task-manager'],['全选 Ctrl+A','select-all'],['复制 Ctrl+C','copy'],['粘贴 Ctrl+V','paste'],['Esc','escape'],['Tab','tab'],['Enter','enter'],['←','left'],['↑','up'],['↓','down'],['→','right']])grid.append(button(label,()=>this.command('chord',{name}).then(()=>this.note('按键已发送。')).catch(error=>this.note(error.message,'error')),'rc-key'));
        for(let n=1;n<=12;n++)grid.append(button('F'+n,()=>this.command('chord',{name:'f'+n}).catch(error=>this.note(error.message,'error')),'rc-key'));
        this.panel.append(grid,button('释放所有按键',()=>this.command('release').then(()=>this.note('按键已释放。')).catch(error=>this.note(error.message,'error'))));
        for(const b of grid.querySelectorAll('button'))b.disabled=this.readonly;
      }else if(this.group==='display'){
        help.textContent='缩放只改变显示比例，保留客户机的分辨率。';const modes=document.createElement('div');modes.className='rc-inline';for(const [label,mode] of [['适应窗口','fit'],['原始比例','original']])modes.append(button(label,()=>{this.command('display',{mode}).catch(error=>this.note(error.message,'error'));try{localStorage.setItem('xuanjia-console-display',mode);}catch(error){}}));this.panel.append(modes);
        const quality=document.createElement('select');quality.setAttribute('aria-label','画面质量');for(const [label,value] of [['均衡','balanced'],['文字清晰','clear'],['优先流畅','fast']]){const option=document.createElement('option');option.value=value;option.textContent=label;quality.append(option);}quality.addEventListener('change',()=>this.command('quality',{mode:quality.value}).catch(error=>this.note(error.message,'error')));this.row('画面质量',quality);this.panel.append(button('进入或退出全屏',()=>this.fullscreen()));
      }else{
        help.textContent=this.connected?'画面已连接。重新连接画面不会重建客户机或清空文件。':'画面尚未连接。可重新连接，原来的文件与改动会保留。';
        if(this.service==='code'){help.textContent='编辑器已连接。保存文件后可刷新编辑器；刷新会结束当前网页会话。';this.panel.append(button('刷新编辑器',()=>{if(confirm('先保存文件，再刷新编辑器。确认刷新？'))this.reconnect();}));return;}
        this.panel.append(button('重新连接画面',()=>this.reconnect()),button('下载屏幕截图',()=>this.command('screenshot').then(result=>{if(result?.dataUrl?.startsWith('data:image/png'))fetch(result.dataUrl).then(r=>r.blob()).then(blob=>save(blob,'实验环境.png'));else throw Error('当前环境不能导出画面截图。');}).catch(error=>this.note(error.message,'error'))));
        const hint=document.createElement('p');hint.className='rc-help';hint.textContent='停止或重启环境仍使用原来的环境控制。';this.panel.append(hint);
      }
    }
    async fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await (this.frame?.closest('.workspace-shell')||this.surface).requestFullscreen();}catch(error){this.note('浏览器暂不支持全屏，请使用独立窗口。','info');}}
    reconnect(){if(this.frame){this.ready=false;this.frame.src=this.frame.src;}else this.command('reconnect').catch(error=>this.note(error.message,'error'));this.note('正在重新连接画面…','info');}
  }
  window.addEventListener('message',event=>{
    if(event.data?.channel!==CHANNEL)return;
    for(const console of consoles)if(console.frame?.contentWindow===event.source&&event.origin===console.frameOrigin()){console.receive(event.data);break;}
  });
  function attach(){for(const item of consoles){if(item.frame&&!document.contains(item.frame)){clearTimeout(item.statusTimer);item.close(false);item.copyText='';for(const job of item.pending.values()){clearTimeout(job.timer);job.reject(Error('环境面板已关闭。'));}item.pending.clear();consoles.delete(item);}}for(const frame of document.querySelectorAll('#workspace-iframe')){if(instances.has(frame))continue;const surface=frame.closest('.challenge-workspace-surface');if(!surface||frame.closest('.unit-detail-page,[data-workspace-presentation="launcher"]')||frame.closest('.challenge-workspace')?.querySelector('.workspace-controls')?.dataset.popout==='true')continue;const instance=new Console(surface,frame);instances.set(frame,instance);}}
  window.AISecEduRemoteConsole={attach,forElement:element=>{const workspace=element?.closest?.('.challenge-workspace');return workspace?instances.get(workspace.querySelector('#workspace-iframe')):null;},standalone:(surface,adapter)=>new Console(surface,null,adapter),channel:CHANNEL};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});else attach();
  new MutationObserver(attach).observe(document.documentElement,{childList:true,subtree:true});
})();
