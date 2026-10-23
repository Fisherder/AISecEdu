(function () {
  'use strict';
  if (window.XuanjiaConsoleFrame) return;
  document.documentElement.dataset.consoleBridge='loaded';
  document.documentElement.dataset.consoleVersion='20261012-22';
  const CHANNEL='xuanjia:console-v1';
  const MAX=65536;
  const PLATFORM=window.XuanjiaConsoleParentOrigin||location.origin;
  let session=null, rfb=null, ui=null, kind='desktop', standalone=null, lastTarget=null, lastCopy='', stagedText=null;
  const down=new Map(), clipboardReads=new Map();
  let readSequence=0;
  let keyQueue=Promise.resolve();
  function valid(text) { if(typeof text!=='string'||text.includes('\0')||new TextEncoder().encode(text).length>MAX) throw Error('仅支持 64 KB 以内、不含空字符的文本。'); return text; }
  function emit(type,data={}) { if(standalone) standalone.receive({type,nonce:standalone.nonce,...data}); else if(session) parent.postMessage({channel:CHANNEL,type,nonce:session.nonce,...data},PLATFORM); }
  function inputTarget(node) { return node && (node.tagName==='TEXTAREA'||node.tagName==='INPUT'||node.isContentEditable); }
  function remoteTarget(node) { return node?.tagName==='CANVAS'||node?.id==='noVNC_keyboardinput'; }
  function focused() { return kind==='code'?lastTarget:document.querySelector('#noVNC_canvas')||document.querySelector('#noVNC_container canvas'); }
  function focus() { const node=focused(); if(kind==='desktop') rfb?.focus(); else node?.focus({preventScroll:true}); return node; }
  function release() { if(rfb) for(const [code,sym] of down) rfb.sendKey(sym,code,false); down.clear(); }
  const keys={control:0xffe3,shift:0xffe1,alt:0xffe9,delete:0xffff,tab:0xff09,escape:0xff1b,enter:0xff0d,left:0xff51,up:0xff52,right:0xff53,down:0xff54};
  async function chord(name) {
    if(!rfb||rfb.viewOnly) throw Error('当前画面不可操作。');
    const combinations={'select-all':['control',97],copy:['control',99],cut:['control',120],paste:['control',118],'copy-terminal':['control','shift',99],'paste-terminal':['control','shift',118],'ctrl-alt-del':['control','alt','delete'],'alt-tab':['alt','tab'],'task-manager':['control','shift','escape']};
    const sequence=combinations[name]||[name];
    const symbols=sequence.map(key=>typeof key==='number'?key:/^f\d+$/.test(key)?0xffbd+Number(key.slice(1)):keys[key]);
    if(symbols.some(key=>!key)) throw Error('不支持此按键。');
    release(); focus();
    const codes=sequence.map(key=>typeof key==='number'?'Key'+String.fromCharCode(key).toUpperCase():/^f\d+$/.test(key)?key.toUpperCase():({control:'ControlLeft',shift:'ShiftLeft',alt:'AltLeft',delete:'Delete',tab:'Tab',escape:'Escape',enter:'Enter',left:'ArrowLeft',up:'ArrowUp',right:'ArrowRight',down:'ArrowDown'})[key]);
    const pressed=[],target=rfb;
    try {
      for(let n=0;n<symbols.length;n++){
        target.sendKey(symbols[n],codes[n],true);pressed.push([symbols[n],codes[n]]);
        await new Promise(resolve=>setTimeout(resolve,n===symbols.length-1?65:35));
      }
    } finally {
      for(const [sym,code] of pressed.reverse()){target.sendKey(sym,code,false);await new Promise(resolve=>setTimeout(resolve,12));}
    }
    return {ok:true};
  }
  function codePaste(text) {
    valid(text); const target=focus(); if(!target||!inputTarget(target)) throw Error('请先点击编辑器或终端中的输入位置，再粘贴。');
    stagedText=text;
    const data=new DataTransfer(); data.setData('text/plain',text);
    const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});
    target.dispatchEvent(event);
    if(!event.defaultPrevented) {
      stagedText=null;
      throw Error('编辑器尚未接收粘贴，请直接使用 Ctrl/Cmd+V。');
    }
    stagedText=null; return {ok:true};
  }
  function codeCopy() {
    const target=focus();
    if(!target) throw Error('请先选中编辑器或终端中的文字。');
    const selection=window.getSelection()?.toString();
    if(selection) return {available:true,text:valid(selection)};
    if(inputTarget(target)&&target.selectionStart!==target.selectionEnd) return {available:true,text:valid(target.value.slice(target.selectionStart,target.selectionEnd))};
    lastCopy='';
    const data=new DataTransfer();
    target.dispatchEvent(new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true}));
    return {available:true,text:valid(data.getData('text/plain')||lastCopy)};
  }
  async function command(action,payload={}) {
    if(session?.readonly&&['chord','paste','copy'].includes(action)) throw Error('当前为只读观察模式。');
    if(action==='clipboard-read-reply') {
      const job=clipboardReads.get(payload.request); if(!job)return {ok:false};
      clearTimeout(job.timer);clipboardReads.delete(payload.request);
      payload.error?job.reject(Error(payload.error)):job.resolve(valid(payload.text));return {ok:true};
    }
    if(kind==='code') {
      if(action==='paste') return codePaste(payload.text);
      if(action==='copy') return codeCopy();
      throw Error('当前编辑器不支持此桌面工具。');
    }
    if(!rfb)throw Error('画面仍在连接，请稍后重试。');
    if(action==='chord'){const operation=keyQueue.catch(()=>{}).then(()=>chord(payload.name));keyQueue=operation;return operation;}
    if(action==='release'){release();return {ok:true};}
    if(action==='display'){rfb.scaleViewport=payload.mode!=='original';rfb.clipViewport=payload.mode==='original';focus();return {ok:true};}
    if(action==='quality'){const values={balanced:[6,2],clear:[9,1],fast:[3,6]};const v=values[payload.mode];if(!v)throw Error('无效的显示设置');rfb.qualityLevel=v[0];rfb.compressionLevel=v[1];return {ok:true};}
    if(action==='screenshot'){if(typeof rfb.toDataURL!=='function')throw Error('当前阅读器不能导出截图。');return {dataUrl:rfb.toDataURL('image/png')};}
    if(action==='reconnect'){ui?.disconnect();setTimeout(()=>ui?.connect(),250);return {ok:true};}
    throw Error('不支持此操作。');
  }
  function requestClipboard() {
    if(stagedText!==null)return Promise.resolve(stagedText);
    const request='read-'+(++readSequence);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{clipboardReads.delete(request);reject(Error('未粘贴文字，操作已取消。'));},60000);
      clipboardReads.set(request,{resolve,reject,timer});emit('code-read-request',{request});
    });
  }
  function copyLocal(text) {
    lastCopy=valid(text);emit('code-copy',{text:lastCopy});return Promise.resolve();
  }
  if(window.XuanjiaConsoleKind==='code') {
    kind='code';
    if(!navigator.clipboard) Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:requestClipboard,writeText:copyLocal}});
  }
  document.addEventListener('focusin',event=>{if(kind==='code'&&inputTarget(event.target))lastTarget=event.target;});
  document.addEventListener('copy',event=>{if(kind!=='code')return;setTimeout(()=>{const text=event.clipboardData?.getData('text/plain');if(text)lastCopy=text;},0);});
  window.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='v')document.documentElement.dataset.consoleShortcut=event.isTrusted?'native':'synthetic';
    if(!event.isTrusted)return;
    const mod=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
    if(kind==='code') {
      if(mod&&key==='v'&&inputTarget(document.activeElement))event.stopImmediatePropagation();
      return;
    }
    if((!session&&!standalone)||!rfb||rfb.viewOnly||!remoteTarget(document.activeElement))return;
    if(event.key==='Control'||event.key==='Meta'){event.preventDefault();event.stopImmediatePropagation();return;}
    if(mod&&['c','x','v'].includes(key)) {
      event.stopImmediatePropagation();
      if(key==='v'){
        document.getElementById('noVNC_keyboardinput')?.focus({preventScroll:true});
        if(window.isSecureContext&&navigator.clipboard?.readText){event.preventDefault();navigator.clipboard.readText().then(text=>emit('gesture',{action:'paste',text:valid(text)})).catch(()=>emit('clipboard-request'));}
      }
      if(key!=='v'){event.preventDefault();emit('gesture',{action:key==='x'?'cut':'copy',shift:event.shiftKey,meta:event.metaKey});}
      return;
    }
    const util=window.AISecEduNoVNC?.util;if(!util)return;
    const code=util.getKeycode(event),sym=util.getKeysym(event);if(!sym)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(mod){rfb.sendKey(keys.control,'ControlLeft',true);down.set('ControlLeft',keys.control);}
    rfb.sendKey(sym,code,true);down.set(code,sym);
  },true);
  window.addEventListener('keyup',event=>{
    if(kind!=='desktop'||!rfb)return;
    const util=window.AISecEduNoVNC?.util,code=util?.getKeycode(event);
    if(event.key==='Control'||event.key==='Meta'){event.preventDefault();event.stopImmediatePropagation();if(down.has('ControlLeft')){rfb.sendKey(keys.control,'ControlLeft',false);down.delete('ControlLeft');}return;}
    if(down.has(code)){event.preventDefault();event.stopImmediatePropagation();rfb.sendKey(down.get(code),code,false);down.delete(code);}
  },true);
  document.addEventListener('paste',event=>{
    if((!session&&!standalone)||kind!=='desktop'||!rfb||rfb.viewOnly||!remoteTarget(document.activeElement)||!event.isTrusted)return;
    document.documentElement.dataset.consolePaste='native';
    const text=event.clipboardData?.getData('text/plain');if(typeof text!=='string')return;
    event.preventDefault();event.stopImmediatePropagation();
    try{emit('gesture',{action:'paste',text:valid(text)});}catch(error){emit('error',{message:error.message});}
  },true);
  window.addEventListener('blur',release);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
  window.addEventListener('message',async event=>{
    if(event.source!==parent||event.origin!==PLATFORM||event.data?.channel!==CHANNEL||parent===window)return;
    const data=event.data;
    if(data.type==='init'&&/^[a-f0-9]{32}$/.test(data.nonce||'')) {
      if(session?.nonce!==data.nonce){release();lastCopy='';for(const job of clipboardReads.values()){clearTimeout(job.timer);job.reject(Error('环境已变化'));}clipboardReads.clear();}
      session={nonce:data.nonce,readonly:Boolean(data.readonly)};kind=data.kind;document.documentElement.dataset.consoleBridge='initialized';ready();return;
    }
    if(data.nonce!==session?.nonce||data.type!=='command')return;
    try{emit('reply',{request:data.request,result:await command(data.action,data.payload)});}catch(error){emit('reply',{request:data.request,error:error.message});}
  });
  function ready(){if(!session&&!standalone)return;if(kind==='desktop'&&!rfb)return;document.documentElement.dataset.consoleBridge='ready';emit('ready',{connected:kind==='code'||rfb?._rfbConnectionState==='connected',readonly:Boolean(session?.readonly||rfb?.viewOnly)});if(kind==='desktop')document.documentElement.classList.add('xuanjia-console-ready');}
  const style=document.createElement('style');style.textContent='.xuanjia-console-ready #noVNC_control_bar_anchor,.xuanjia-console-ready #noVNC_control_bar{display:none!important}.xuanjia-console-ready #noVNC_container{overflow:auto!important;border-radius:0!important}';document.head.append(style);
  async function desktop(){
    if(kind==='code')return;
    if(!window.AISecEduNoVNC){
      try{const [u,k]=await Promise.all([import(new URL('app/ui.js',location.href)),import(new URL('core/input/util.js',location.href))]);window.AISecEduNoVNC={UI:u.default,util:k};}catch(error){document.documentElement.dataset.consoleBridge='module-unavailable';return;}
    }
    ui=window.AISecEduNoVNC.UI;
    if(!ui.rfb)document.documentElement.dataset.consoleBridge='waiting-for-screen';
    if(ui.rfb&&ui.rfb!==rfb){
      release();rfb=ui.rfb;
      rfb.addEventListener('connect',()=>emit('connection',{connected:true}));rfb.addEventListener('disconnect',()=>{release();emit('connection',{connected:false});});ready();
    }
  }
  window.XuanjiaConsoleFrame={command};
  if(parent!==window)parent.postMessage({channel:CHANNEL,type:'hello'},PLATFORM);
  else {
    async function startStandalone(){
      if(kind!=='desktop')return;
      try{
        await desktop();if(!rfb)return;
        const response=await fetch(PLATFORM+'/pwncollege_api/v1/workspace',{credentials:'same-origin'}),data=await response.json();if(!data.workspace_id)return;
        const script=document.createElement('script');script.src=PLATFORM+'/themes/dojo_theme/static/js/dojo/remote-console.js?v=console-20261012-2';script.onload=()=>{standalone=window.AISecEduRemoteConsole.standalone(document.body,{workspaceId:data.workspace_id,csrfNonce:data.csrf_nonce,readonly:rfb.viewOnly,command});ready();};document.head.append(script);
      }catch(error){}
    }
    document.readyState==='loading'?document.addEventListener('DOMContentLoaded',startStandalone,{once:true}):startStandalone();
  }
  setInterval(desktop,500);desktop();
})();
