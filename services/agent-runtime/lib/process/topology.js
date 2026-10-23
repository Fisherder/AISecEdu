(function(){
  const ns='http://www.w3.org/2000/svg';
  globalThis.AISecProcessTopology=function(parent,view,values,{evaluate,running,activeIndex,marked,previousEdges}){
    const config=view.topology;
    if(!config||!Array.isArray(values)||values.length!==config.labels.length)throw Error('拓扑设备与状态数量不一致');
    const make=(tag,attrs,owner,text)=>{const item=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs||{}))item.setAttribute(key,String(value));if(text!==undefined)item.textContent=String(text);owner.append(item);return item;};
    const cols=values.length<=6?3:4,rows=Math.ceil(values.length/cols),width=960,height=rows*154+44;
    const shell=document.createElement('div');shell.className='topology-scroll';shell.tabIndex=0;shell.setAttribute('aria-label','设备拓扑，可横向滚动查看');parent.append(shell);
    const svg=make('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':view.title,class:'process-topology'},shell);
    make('title',{},svg,view.title+'：'+config.labels.map((label,i)=>label+' '+String(values[i])).join('；'));
    const defs=make('defs',{},svg),markerId='topology-arrow-'+view.id;
    const marker=make('marker',{id:markerId,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'},defs);
    make('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'context-stroke'},marker);
    const positions=config.labels.map((_,i)=>({x:(i%cols+.5)*width/cols,y:82+Math.floor(i/cols)*154}));
    const edgeStates=[];
    config.edges.forEach((edge,i)=>{
      const active=edge.activeWhen===undefined?false:evaluate(edge.activeWhen),blocked=edge.blockedWhen===undefined?false:evaluate(edge.blockedWhen);
      if(typeof active!=='boolean'||typeof blocked!=='boolean')throw Error('拓扑连接条件必须为布尔值');
      const from=positions[edge.from],to=positions[edge.to];if(!from||!to)throw Error('拓扑连接引用不存在的设备');
      const dx=to.x-from.x,dy=to.y-from.y,factor=1/Math.max(Math.abs(dx)/104,Math.abs(dy)/49);
      const x1=from.x+dx*factor,y1=from.y+dy*factor,x2=to.x-dx*factor,y2=to.y-dy*factor;
      const wasActive=previousEdges?.[i]?.active && !previousEdges[i].blocked;
      const isActive=active&&!blocked;
      const activated=previousEdges && !wasActive && isActive;
      const deactivated=previousEdges && wasActive && !isActive;
      const group=make('g',{'data-edge':i,'data-active':active,'data-blocked':blocked,class:'topology-edge'+(blocked?' blocked':active?' active':'')+(isActive&&(running||activated)?' flowing':'')+(deactivated?' reversing':'')},svg);
      // Optional author styling is metadata, never a substitute for an
      // executed activeWhen/blockedWhen condition.
      if(edge.tone)group.dataset.tone=edge.tone;
      make('path',{d:`M ${x1} ${y1} L ${x2} ${y2}`,'marker-end':`url(#${markerId})`},group);
      if((activated||deactivated)&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
        const token=make('g',{class:'topology-transit'},group);
        make('circle',{r:15},token);
        make('text',{'text-anchor':'middle',y:4},token,Array.from(config.labels[edge.from]).slice(0,3).join(''));
        make('animateMotion',{dur:'.85s',fill:'freeze',path:activated
          ?`M ${x1} ${y1} L ${x2} ${y2}`:`M ${x2} ${y2} L ${x1} ${y1}`},token);
      }
      if(blocked){const x=(x1+x2)/2,y=(y1+y2)/2;make('circle',{cx:x,cy:y,r:11},group);make('path',{d:`M ${x-6} ${y-6} L ${x+6} ${y+6} M ${x+6} ${y-6} L ${x-6} ${y+6}`,class:'topology-stop'},group);}
      make('title',{},group,config.labels[edge.from]+' → '+config.labels[edge.to]+(edge.label?'：'+edge.label:'')+(blocked?'（已阻断）':active?'（本步传递）':'（未传递）'));
      edgeStates.push({active,blocked});
    });
    config.labels.forEach((label,i)=>{
      const {x,y}=positions[i],tone=config.tones.find(item=>item.value===values[i])?.tone||'neutral';
      const group=make('g',{transform:`translate(${x-103} ${y-48})`,'data-node':i,'data-value':String(values[i]),class:'topology-node '+tone+(i===activeIndex?' focused':'')+(marked.has(i)?' marked':'')},svg);
      make('rect',{width:206,height:96,rx:14},group);make('circle',{cx:17,cy:18,r:4},group);
      const words=Array.from(label);[words.slice(0,12).join(''),words.slice(12,24).join(''),words.slice(24,35).join('')+(words.length>35?'…':'')].filter(Boolean).forEach((line,n)=>make('text',{x:29,y:24+n*16,class:'topology-label'},group,line));
      const state=String(values[i]??'');make('text',{x:14,y:79,class:'topology-status'},group,Array.from(state).slice(0,10).join('')+(Array.from(state).length>10?'…':''));
      make('title',{},group,label+'：'+state);
    });
    const key=document.createElement('p');key.className='topology-key';key.textContent='箭头表示方向 · 亮线表示本步传递 · × 表示当前条件已阻断';parent.append(key);
    const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='查看每条连接的状态';details.append(summary);
    const list=document.createElement('ul');edgeStates.forEach((state,i)=>{const edge=config.edges[i],li=document.createElement('li');li.textContent=config.labels[edge.from]+' → '+config.labels[edge.to]+(edge.label?' · '+edge.label:'')+'：'+(state.blocked?'已阻断':state.active?'本步传递':'未传递');list.append(li);});details.append(list);parent.append(details);
    return edgeStates;
  };
})();
