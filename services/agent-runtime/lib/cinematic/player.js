(function(){
  'use strict';
  const sceneData=JSON.parse(document.getElementById('cinematic-scene').textContent);
  const presentation=JSON.parse(document.getElementById('cinematic-presentation').textContent);
  const T=globalThis.THREE, root=document.getElementById('cinema'),canvas=document.getElementById('cinematic-canvas'),fallback=document.getElementById('cinematic-fallback'),viewport=document.getElementById('viewport');
  const elements=Object.fromEntries(['chapter-title','chapter-caption','chapter-number','chapter-question','chapters','chapter-timeline','camera-mode','explode-mode','quality','playback-rate','node-labels','detail-box','detail-title','detail-copy','interaction-hint','learner-controls','learner-control-list','learner-feedback'].map(id=>[id,document.getElementById(id)]));
  const watchTransport=globalThis.CinematicTransport(sceneData.duration),experimentTransport=globalThis.CinematicTransport(sceneData.duration);
  let transport=watchTransport;
  let interactionMode=sceneData.lab?'experiment':'process';
  const hasDomainMotion=Boolean(sceneData.lab?.bindings.some(binding=>binding.property==='rotationSpeedY'));
  const movieTime=()=>interactionMode==='experiment'?0:transport.state.time;
  const state={get time(){return transport.state.time;},get playing(){return transport.state.playing;},get rate(){return transport.state.rate;},get ended(){return transport.state.ended;},get scrubbing(){return transport.state.scrubbing;},get interactionMode(){return interactionMode;},get canPlay(){return interactionMode==='process'||hasDomainMotion;},exploded:false,explore:false,yaw:0,pitch:0,zoom:1,chapter:-1,quality:'high',frames:0,selectedDetail:null,labelsVisible:true,controlValues:{}};
  const nodes=new Map(),labels=new Map(),links=[],baseMaterials=new Map(),pointers=new Map();
  const qualityProfiles={low:{name:'流畅',ratio:.75,samples:0,shadow:0,bloom:false,pixels:1000000,limit:.5},auto:{name:'标准',ratio:1,samples:2,shadow:1024,bloom:true,pixels:2250000,limit:.75},high:{name:'精细',ratio:1.5,samples:4,shadow:2048,bloom:true,pixels:5000000,limit:1}};
  let renderer,world,camera,composer,bloom,ctx,environmentGround,environmentTarget,compositionTarget,observer,frameId,actions,capabilities,qualityConfig,gpuMetrics,exploration,cameraTarget,controls,mode='webgl',width=1,height=1,lastDpr=1,pinchDistance=0,disposed=false,dirty=true,suspended=false,metricsDirty=true,targetGeneration=0;
  const learnerInputs=new Map();
  let domainLab=null,experimentView=null;
  const listeners=new AbortController(),listen=(target,event,callback,options={})=>target.addEventListener(event,callback,{...options,signal:listeners.signal});
  const vector=v=>new T.Vector3(...v),clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const mix=(a,b,t)=>Array.isArray(a)?a.map((v,i)=>v+(b[i]-v)*t):a+(b-a)*t;
  const smooth=t=>t*t*(3-2*t);
  const sample=(keys,t,easing='smooth')=>{
    if(t<=keys[0].at)return keys[0].value;
    for(let i=1;i<keys.length;i++)if(t<keys[i].at){let u=(t-keys[i-1].at)/(keys[i].at-keys[i-1].at);if(easing==='smooth')u=smooth(u);return mix(keys[i-1].value,keys[i].value,u);}
    return keys[keys.length-1].value;
  };
  function proceduralSurface(spec){
    const p=spec.surface,size=256,image=document.createElement('canvas');image.width=image.height=size;
    const context=image.getContext('2d');if(!context)throw new Error('Procedural material canvas unavailable');
    const pixels=context.createImageData(size,size),color=value=>[1,3,5].map(at=>parseInt(value.slice(at,at+2),16)),a=color(spec.color||'#93adbf'),b=color(p.secondary);
    const hash=(x,y)=>{const value=Math.sin(x*127.1+y*311.7+p.seed*74.7)*43758.5453;return value-Math.floor(value);};
    const noise=(x,y)=>{const ix=Math.floor(x),iy=Math.floor(y),fx=smooth(x-ix),fy=smooth(y-iy);return mix(mix(hash(ix,iy),hash(ix+1,iy),fx),mix(hash(ix,iy+1),hash(ix+1,iy+1),fx),fy);};
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const u=x/size,v=y/size,grain=hash(x,y),large=noise(u*p.scale,v*p.scale),fine=noise(u*p.scale*4,v*p.scale*4);
      let value;
      if(p.pattern==='strata')value=.5+.4*Math.sin(v*p.scale*6.283+large*3)+grain*.1;
      else if(p.pattern==='brushed')value=.35+.35*noise(u*2,v*p.scale*55)+grain*.15;
      else if(p.pattern==='cellular')value=smooth(clamp((large-.3)*2.5,0,1))*.85+fine*.15;
      else if(p.pattern==='bands')value=.5+.4*Math.sin(v*p.scale*6.283+Math.sin(u*6.283)*.35)+fine*.1;
      else value=large*.3+fine*.35+grain*.35;
      const f=clamp(.5+(value-.5)*p.contrast*2,0,1),i=(y*size+x)*4;
      for(let channel=0;channel<3;channel++)pixels.data[i+channel]=Math.round(mix(a[channel],b[channel],f));
      pixels.data[i+3]=255;
    }
    context.putImageData(pixels,0,0);const texture=new T.CanvasTexture(image);texture.encoding=T.sRGBEncoding;texture.wrapS=texture.wrapT=T.RepeatWrapping;return texture;
  }
  function material(spec={}){
    const result=new T.MeshStandardMaterial({color:spec.color||'#93adbf',metalness:spec.metalness??.5,roughness:spec.roughness??.3,emissive:spec.color||'#93adbf',emissiveIntensity:spec.surfaceText?0:spec.emissive||0});
    if(spec.surface){const texture=proceduralSurface(spec);result.color.set('#ffffff');result.map=texture;result.bumpMap=texture;result.bumpScale=spec.surface.bump;}
    return result;
  }
  function surfaceTextMaterial(spec,initialTitle=''){
    const p=spec.params||{},aspect=(p.width||(spec.kind==='plane'?6:1))/(p.height||(spec.kind==='plane'?6:1));
    const image=document.createElement('canvas');image.width=Math.max(1,Math.floor(Math.min(1024,Math.sqrt(262144*aspect))));image.height=Math.max(1,Math.floor(Math.min(1024,262144/image.width,image.width/aspect)));
    const context=image.getContext('2d');if(!context)throw new Error('Static sign text canvas unavailable');
    const margin=Math.min(image.width,image.height)*.1;
    const font=size=>size+'px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
    function paint(title){
      const lines=[...spec.surfaceText.lines,...(spec.surfaceText.chapterTitle?[title]:[])];
      context.fillStyle=spec.color;context.fillRect(0,0,image.width,image.height);
      context.font=font(64);const widest=Math.max(1,...lines.map(line=>context.measureText(line).width));
      const size=Math.min((image.height-2*margin)/(lines.length*1.35),64*(image.width-2*margin)/widest);
      context.strokeStyle=spec.surfaceText.color;context.globalAlpha=.3;context.lineWidth=2;context.strokeRect(margin*.4,margin*.4,image.width-margin*.8,image.height-margin*.8);context.globalAlpha=1;
      context.font=font(size);context.textAlign='center';context.textBaseline='middle';context.fillStyle=spec.surfaceText.color;
      lines.forEach((line,index)=>context.fillText(line,image.width/2,image.height/2+(index-(lines.length-1)/2)*size*1.35));
    }
    paint(initialTitle);let lastTitle=initialTitle;
    const texture=new T.CanvasTexture(image);texture.encoding=T.sRGBEncoding;
    // Teaching text must retain its contrast under cinematic lights and inherited glow tracks.
    const result=new T.MeshBasicMaterial({color:'#ffffff',map:texture,toneMapped:false,fog:false});
    result.color.setScalar(.5);
    result.userData.updateSurfaceText=title=>{if(spec.surfaceText.chapterTitle&&title!==lastTitle){lastTitle=title;paint(title);texture.needsUpdate=true;}};
    return result;
  }
  function buildNode(spec){
    let object;const copy=presentation.nodes[spec.id];
    // Keep annotation anchors and their transforms, without drawing duplicate boards.
    if(spec.kind==='group'||copy.geometry==='anchor')object=new T.Group();
    else if(spec.kind==='model')object=globalThis.CinematicModels.create(T,{model:spec.model,params:spec.params,color:spec.color,accent:sceneData.theme.accent});
    else{
      const p=spec.params||{};let geometry;
      if(spec.kind==='box')geometry=new T.BoxGeometry(p.width||1,p.height||1,p.depth||1);
      else if(spec.kind==='sphere')geometry=new T.SphereGeometry(p.radius||1,48,32,p.phiStart??0,p.phiLength??Math.PI*2,p.thetaStart??0,p.thetaLength??Math.PI);
      else if(spec.kind==='cylinder')geometry=new T.CylinderGeometry(p.top??.5,p.bottom??.5,p.height||2,48,1,p.openEnded??false,p.thetaStart??0,p.thetaLength??Math.PI*2);
      else if(spec.kind==='torus')geometry=new T.TorusGeometry(p.radius||1,p.tube||.08,16,96,p.arc??Math.PI*2);
      else if(spec.kind==='plane')geometry=new T.PlaneGeometry(p.width||6,p.height||6,1,1);
      else if(spec.kind==='tube')geometry=new T.TubeGeometry(new T.CatmullRomCurve3(spec.points.map(vector)),80,p.radius||.04,8,false);
      else{
        const data=spec.points?.length?spec.points.flat():[];const count=clamp(p.count||220,1,1000),spread=p.spread||5;
        if(!spec.points?.length)for(let i=0;i<count;i++){const n=i+1;data.push(Math.sin(n*127.1)*spread,Math.cos(n*311.7)*spread,Math.sin(n*74.7)*spread);}
        geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(data,3));
        object=new T.Points(geometry,new T.PointsMaterial({color:spec.color,size:p.size||.035,transparent:true,opacity:1,blending:T.AdditiveBlending,depthWrite:false}));
      }
      if(!object)object=new T.Mesh(geometry,material(spec));
    }
    if(copy.geometry==='keep'&&spec.surfaceText&&(copy.surfaceLines.length||spec.surfaceText.chapterTitle)){const text=surfaceTextMaterial({...spec,surfaceText:{...spec.surfaceText,lines:copy.surfaceLines}},presentation.chapters[0].title);object.userData.updateSurfaceText=text.userData.updateSurfaceText;if(spec.kind==='box')object.material=[object.material,object.material,object.material,object.material,text,text];else{object.material.dispose();object.material=text;}}
    object.position.fromArray(spec.position);object.rotation.fromArray(spec.rotation);object.scale.fromArray(spec.scale);object.userData.spec=spec;
    object.traverse(child=>{child.userData.nodeId=spec.id;if(child.isMesh&&spec.kind!=='model'){child.castShadow=!child.material.transparent;child.receiveShadow=true;}for(const mat of (Array.isArray(child.material)?child.material:[child.material]).filter(Boolean))if(!baseMaterials.has(mat))baseMaterials.set(mat,{color:mat.color?.clone(),opacity:mat.opacity,emissive:mat.emissiveIntensity||0,transparent:mat.transparent,depthWrite:mat.depthWrite,visible:mat.visible});});
    nodes.set(spec.id,object);
    if(copy.label){const label=document.createElement('button');label.type='button';label.className='node-label';label.dataset.nodeId=spec.id;label.textContent=copy.label;label.setAttribute('aria-label',copy.label+'：查看说明');listen(label,'click',()=>showDetail(spec.id,true));elements['node-labels'].append(label);labels.set(spec.id,label);}
  }
  function buildWorld(){
    world=new T.Scene();world.background=new T.Color(sceneData.theme.background);world.fog=new T.FogExp2(sceneData.theme.background,sceneData.theme.environment==='space'?.005:.012);
    camera=new T.PerspectiveCamera(42,1,.1,300);
    world.add(new T.HemisphereLight('#b9dfff','#16202e',.45));
    const key=new T.DirectionalLight('#e5f2ff',2.2);key.position.set(5,11,7);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-16;key.shadow.camera.right=16;key.shadow.camera.top=16;key.shadow.camera.bottom=-16;key.shadow.bias=-.0002;key.shadow.normalBias=.025;world.add(key);
    const rim=new T.DirectionalLight(sceneData.theme.accent,1.5);rim.position.set(-7,4,-8);world.add(rim);
    const warm=new T.PointLight(sceneData.theme.secondary,4,24,2);warm.position.set(8,8,-5);world.add(warm);
    const pmrem=new T.PMREMGenerator(renderer),room=new T.RoomEnvironment();try{environmentTarget=pmrem.fromScene(room,.06);world.environment=environmentTarget.texture;}finally{pmrem.dispose();room.dispose();}
    if(sceneData.theme.environment!=='space'){
      environmentGround=new T.Group();environmentGround.position.y=-2.1;world.add(environmentGround);
      const floor=new T.Mesh(new T.PlaneGeometry(500,500),new T.MeshStandardMaterial({color:'#08121d',metalness:.2,roughness:.76,envMapIntensity:.12}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;environmentGround.add(floor);
      const grid=new T.GridHelper(64,64,sceneData.theme.accent,'#1b344d');grid.position.y=.015;grid.material.opacity=.16;grid.material.transparent=true;environmentGround.add(grid);
      for(const r of [5,9,15]){const ring=new T.Mesh(new T.TorusGeometry(r,.012,6,128),new T.MeshBasicMaterial({color:sceneData.theme.accent,transparent:true,opacity:.16}));ring.rotation.x=-Math.PI/2;ring.position.y=.03;environmentGround.add(ring);}
    }
    const specks=[];for(let i=1;i<650;i++)specks.push(Math.sin(i*127.1)*45,Math.cos(i*19.2)*22+8,Math.sin(i*77.4)*45);
    const stars=new T.BufferGeometry();stars.setAttribute('position',new T.Float32BufferAttribute(specks,3));world.add(new T.Points(stars,new T.PointsMaterial({color:'#7ab3d5',size:.025,transparent:true,opacity:.55,depthWrite:false})));
    sceneData.nodes.forEach(buildNode);for(const spec of sceneData.nodes)(spec.parent?nodes.get(spec.parent):world).add(nodes.get(spec.id));world.updateMatrixWorld(true);
    for(const data of sceneData.connections){
      const from=nodes.get(data.from).getWorldPosition(new T.Vector3()),to=nodes.get(data.to).getWorldPosition(new T.Vector3());
      const middle=from.clone().lerp(to,.5);middle.y+=Math.max(.8,from.distanceTo(to)*.15);
      const path=new T.CatmullRomCurve3([from,...(data.via.length?data.via.map(vector):[middle]),to]);
      const tube=new T.Mesh(new T.TubeGeometry(path,64,data.radius,6,false),new T.MeshBasicMaterial({color:data.color,transparent:true,opacity:.35}));world.add(tube);
      tube.geometry.attributes.position.setUsage(T.DynamicDrawUsage);tube.geometry.attributes.normal.setUsage(T.DynamicDrawUsage);
      const particles=new T.InstancedMesh(new T.SphereGeometry(data.radius*3,8,6),new T.MeshBasicMaterial({color:data.color}),data.particles);particles.frustumCulled=false;particles.instanceMatrix.setUsage(T.DynamicDrawUsage);world.add(particles);links.push({data,path,tube,particles,from:from.clone(),to:to.clone(),matrix:new T.Matrix4(),point:new T.Vector3(),normal:new T.Vector3(),start:new T.Vector3(),end:new T.Vector3()});
    }
    compositionTarget=new T.WebGLRenderTarget(1,1,{type:capabilities.targetType,samples:0});
    composer=new T.EffectComposer(renderer,compositionTarget);composer.addPass(new T.RenderPass(world,camera));bloom=new T.UnrealBloomPass(new T.Vector2(2,2),.38,.55,.72);configureBloomPrecision();composer.addPass(bloom);composer.addPass(new T.ShaderPass(T.GammaCorrectionShader));
  }
  function configureBloomPrecision(){
    // r150 creates unsigned-byte bloom intermediates even when the composer is
    // HDR. Quantizing each blur level produced large rings in dark gradients.
    // Choose only the renderable type verified for this device, before first use.
    for(const target of [bloom.renderTargetBright,...bloom.renderTargetsHorizontal,...bloom.renderTargetsVertical])target.texture.type=capabilities.targetType;
  }
  function selectChapter(){
    let index=0;sceneData.chapters.forEach((chapter,i)=>{if(movieTime()>=chapter.at)index=i;});
    if(index!==state.chapter){
      state.chapter=index;const chapter=presentation.chapters[index];
      elements['chapter-title'].textContent=chapter.title;elements['chapter-caption'].textContent=chapter.caption;elements['chapter-number'].textContent=String(index+1).padStart(2,'0');elements['chapter-question'].textContent=chapter.question||'';elements['chapter-question'].hidden=!chapter.question;
      for(const [i,button]of [...elements.chapters.children].entries()){button.classList.toggle('active',i===index);button.setAttribute('aria-current',i===index?'step':'false');}
      if(!state.scrubbing){
        const scroller=elements['chapter-timeline'],row=scroller.getBoundingClientRect(),item=elements.chapters.children[index].getBoundingClientRect();
        const right=Math.min(item.right,item.left+Math.max(0,row.right-row.left-24));
        if(right>row.right-12)scroller.scrollLeft+=right-row.right+12;else if(item.left<row.left+12)scroller.scrollLeft+=item.left-row.left-12;
      }
      if(state.selectedDetail)showDetail(state.selectedDetail);
    }
    if(interactionMode==='experiment'&&domainLab){const current=domainLab.stage();if(current){elements['chapter-title'].textContent=current.title;elements['chapter-caption'].textContent=current.explanation;elements['chapter-number'].textContent='实验';elements['chapter-question'].hidden=true;}}
    root.dataset.animationState='chapter-'+(index+1);root.dataset.time=state.time.toFixed(3);
  }
  function visibleBounds(object,includePoints=false,includeFaded=false,ownNodeOnly=false){
    const bounds=new T.Box3();
    if(!includeFaded&&!isSceneVisible(object))return bounds;
    object.traverse(child=>{
      // A SceneIR parent is a transform relationship, not an implicit camera
      // selection. Model-internal meshes share the owner id; separately authored
      // child entities must be selected explicitly (groups are expanded upstream).
      if(ownNodeOnly&&child.userData.nodeId!==object.userData.spec.id)return;
      if(!(child.isMesh||(includePoints&&child.isPoints))||(!includeFaded&&!isSceneVisible(child))||child.visible===false)return;
      const materials=(Array.isArray(child.material)?child.material:[child.material]).filter(Boolean);
      if(!materials.some(mat=>{const source=includeFaded?(baseMaterials.get(mat)||mat):mat;return source.visible!==false&&(source.opacity??1)>.03;}))return;
      if(!child.geometry.boundingBox)child.geometry.computeBoundingBox();
      if(child.isInstancedMesh&&child.geometry.boundingBox){
        const instance=new T.Matrix4(),transform=new T.Matrix4(),box=new T.Box3();
        for(let i=0;i<child.count;i++){child.getMatrixAt(i,instance);transform.multiplyMatrices(child.matrixWorld,instance);bounds.union(box.copy(child.geometry.boundingBox).applyMatrix4(transform));}
        return;
      }
      if(child.geometry.boundingBox)bounds.union(child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld));
    });
    return bounds;
  }
  function mayAppearLater(object){
    let hasOpacityTrack=false;
    for(let current=object;current?.userData.spec;current=current.parent){
      if(current.visible===false)return false;
      const spec=current.userData.spec,track=sceneData.tracks.find(track=>track.target===spec.id&&track.property==='opacity');
      if(current!==object&&spec.kind!=='group')continue;
      if(track){hasOpacityTrack=true;if(!track.keyframes.some(key=>key.value>.03))return false;}
      else if((spec.opacity??current.userData.sceneOpacity??1)<=.03)return false;
    }
    return hasOpacityTrack;
  }
  function positionEnvironmentGround(){
    if(!environmentGround||environmentGround.userData.positioned)return;
    let height=-2.1;
    for(const object of nodes.values()){
      const spec=object.userData.spec;
      if(spec.kind==='group'||spec.kind==='points'||spec.role==='decoration'||spec.role==='logic')continue;
      // Future fade-in parts must fit above the fixed ground too; the ground
      // must not jump when these parts appear during playback.
      const bounds=visibleBounds(object,false,mayAppearLater(object));
      if(!bounds.isEmpty()&&Number.isFinite(bounds.min.y)){
        // Include the complete authored travel before fixing the floor.
        // An initially visible gate must not move underneath an opaque
        // environment plane later in its closing chapter.
        let travel=0;
        for(let ancestor=object;ancestor?.userData.spec;ancestor=ancestor.parent){
          const track=sceneData.tracks.find(track=>track.target===ancestor.userData.spec.id&&track.property==='position');
          if(!track)continue;
          const transform=new T.Matrix3().setFromMatrix4(ancestor.parent?.matrixWorld||new T.Matrix4());
          travel+=Math.max(0,...track.keyframes.map(key=>new T.Vector3().fromArray(key.value).sub(ancestor.position).applyMatrix3(transform).length()));
        }
        height=Math.min(height,bounds.min.y-travel-.04);
      }
    }
    environmentGround.position.y=height;environmentGround.userData.positioned=true;
  }
  function boundCorners(bounds){
    const points=[];
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])points.push(new T.Vector3(x,y,z));
    return points;
  }
  function activeFrame(){
    let index=0;
    while(index+1<sceneData.shots.length&&sceneData.shots[index+1].at<=movieTime())index++;
    const shot=sceneData.shots[index],next=sceneData.shots[Math.min(index+1,sceneData.shots.length-1)];
    if(!shot.frame||!next.frame||!(shot.frame.region||next.frame.region)||JSON.stringify(shot.frame.nodes)!==JSON.stringify(next.frame.nodes))return shot.frame;
    let f=shot===next?0:(movieTime()-shot.at)/(next.at-shot.at);f*=f*(3-2*f);
    const initial=shot.frame.region||{center:[0,0,0],size:[1,1,1]},final=next.frame.region||{center:[0,0,0],size:[1,1,1]},mix=(a,b)=>a.map((v,i)=>v+(b[i]-v)*f);
    return {...shot.frame,region:{center:mix(initial.center,final.center),size:mix(initial.size,final.size)}};
  }
  function frameBounds(frame){
    const bounds=new T.Box3();
    for(const id of frame.nodes){const object=nodes.get(id);if(object)bounds.union(visibleBounds(object,false,false,object.userData.spec.kind!=='group'));}
    if(bounds.isEmpty())return bounds;
    if(frame.region){
      const extent=bounds.getSize(new T.Vector3()),midpoint=bounds.getCenter(new T.Vector3()),region=frame.region;
      for(const [axis,name]of ['x','y','z'].entries()){
        bounds.min[name]=midpoint[name]+extent[name]*(region.center[axis]-region.size[axis]/2);
        bounds.max[name]=midpoint[name]+extent[name]*(region.center[axis]+region.size[axis]/2);
      }
    }
    return bounds;
  }
  function fitFrame(position,target,fov,frame){
    const bounds=frameBounds(frame);
    if(bounds.isEmpty())return false;
    const direction=position.clone().sub(target).normalize();
    if(!direction.lengthSq())direction.set(0,.5,1).normalize();
    const right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),direction).normalize();
    if(!right.lengthSq())right.set(1,0,0);
    const up=new T.Vector3().crossVectors(direction,right).normalize(),center=bounds.getCenter(new T.Vector3());
    const tangent=Math.tan(fov*Math.PI/360),padding=frame.padding||1.2;
    let distance=3;
    // Fit geometry and instance transforms in camera space, including depth; model names alone cannot determine framing.
    for(const corner of boundCorners(bounds)){
      const delta=corner.sub(center),depth=delta.dot(direction);
      distance=Math.max(distance,depth+Math.abs(delta.dot(right))*padding/(tangent*camera.aspect),depth+Math.abs(delta.dot(up))*padding/tangent,depth+camera.near*2);
    }
    target.copy(center);position.copy(center).addScaledVector(direction,distance);
    return true;
  }
  function applyCamera(){
    const positions=sceneData.shots.map(shot=>({at:shot.at,value:shot.position})),targets=sceneData.shots.map(shot=>({at:shot.at,value:shot.target}));
    const fit=Math.max(1,(16/9)/camera.aspect),position=state.explore?exploration.position.clone():vector(sample(positions,movieTime())),target=state.explore?exploration.target.clone():vector(sample(targets,movieTime()));
    const fov=state.explore?exploration.fov:sample(sceneData.shots.map(shot=>({at:shot.at,value:shot.fov})),movieTime()),framing=!state.explore&&activeFrame();
    if(interactionMode==='experiment'&&experimentView&&!state.explore){target.copy(experimentView.target);position.copy(experimentView.position).sub(target).multiplyScalar(fit/experimentView.fit).add(target);}
    else if(!framing||!fitFrame(position,target,fov,framing))position.sub(target).multiplyScalar(state.explore?fit/exploration.fit:fit).add(target);
    if(state.explore){const offset=position.sub(target),spherical=new T.Spherical().setFromVector3(offset);spherical.theta+=state.yaw;spherical.phi=clamp(spherical.phi+state.pitch,.15,Math.PI-.15);spherical.radius*=state.zoom;position.setFromSpherical(spherical).add(target);}
    cameraTarget=target;camera.position.copy(position);camera.lookAt(target);camera.fov=fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  }
  function sampleVisibility(object,ndc,occluders,occluderBounds){
    // Diagnostic-only probes use actual transformed meshes and material sides.
    // A projected box cannot prove that an opaque shell does not hide its subject.
    // These are geometric samples, not pixel contrast or an aesthetic score.
    const spec=object.userData.spec;
    if(spec.kind==='group'||spec.kind==='points')return {method:'mesh-rays-v1',status:'unsupported'};
    const left=Math.max(-1,ndc.left),right=Math.min(1,ndc.right),bottom=Math.max(-1,ndc.bottom),top=Math.min(1,ndc.top);
    const ray=new T.Raycaster(),own=new Set();object.traverse(child=>{if(child.isMesh&&child.userData.nodeId===spec.id)own.add(child);});
    const ownMeshes=[...own];
    const materialOf=hit=>Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex??0]:hit.object.material;
    const usable=hit=>{const mat=materialOf(hit);return hit.object.isMesh&&isSceneVisible(hit.object)&&mat?.visible!==false&&(mat?.opacity??1)>.03;};
    let samples=0,visible=0;const blockers=new Map();
    if(right>left&&top>bottom)for(let x=0;x<7;x++)for(let y=0;y<7;y++){
      ray.far=Infinity;
      ray.setFromCamera(new T.Vector2(left+(right-left)*(x+.5)/7,bottom+(top-bottom)*(y+.5)/7),camera);
      const target=ray.intersectObjects(ownMeshes,false).find(usable);if(!target)continue;
      samples++;let transmission=1;const seen=new Set();
      // A mesh can block this exact sample only if its conservative world
      // box intersects the segment before the target. Keep all inside-origin
      // boxes. The actual triangle/material test below stays authoritative.
      const segmentPoint=new T.Vector3();
      const candidates=occluders.filter(mesh=>{
        if(own.has(mesh))return false;
        const box=occluderBounds.get(mesh);
        return !box||box.containsPoint(ray.ray.origin)||
          ray.ray.intersectBox(box,segmentPoint)!==null&&segmentPoint.distanceTo(ray.ray.origin)<=target.distance+1e-5;
      });
      ray.far=target.distance+1e-5;
      if(materialOf(target)?.depthTest!==false)for(const hit of ray.intersectObjects(candidates,false)){
        if(hit.distance>=target.distance-1e-5)break;
        if(own.has(hit.object)||seen.has(hit.object)||!usable(hit))continue;
        seen.add(hit.object);const mat=materialOf(hit);transmission*=1-(mat.transparent?Math.min(1,mat.opacity):1);
        if(transmission<=.08){const id=hit.object.userData.nodeId||'environment';blockers.set(id,(blockers.get(id)||0)+1);break;}
      }
      if(transmission>.08)visible++;
    }
    return {method:'mesh-rays-v1',status:samples>=3?'sampled':'insufficient-samples',samples,visibleSamples:visible,
      visibleFraction:samples?visible/samples:null,blockers:[...blockers].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([id,samples])=>({id,samples}))};
  }
  function getFrameDiagnostics(){
    if(mode!=='webgl'||disposed)return {available:false,renderer:mode};
    world.updateMatrixWorld(true);
    const framing=activeFrame(),projected=[],occluders=[];
    world.traverse(child=>{if(child.isMesh&&isSceneVisible(child))occluders.push(child);});
    const occluderBounds=new Map();
    for(const mesh of occluders){
      const geometry=mesh.geometry,position=geometry?.attributes?.position;
      if(!geometry||!position||mesh.isSkinnedMesh||mesh.isInstancedMesh||geometry.morphAttributes?.position?.length)continue;
      const version=position.version??position.data?.version;
      if(!geometry.boundingBox||version===undefined||geometry.userData.diagnosticPositionVersion!==version){
        geometry.computeBoundingBox();geometry.userData.diagnosticPositionVersion=version;
      }
      if(geometry.boundingBox)occluderBounds.set(mesh,new T.Box3().copy(geometry.boundingBox).applyMatrix4(mesh.matrixWorld).expandByScalar(1e-6));
    }
    for(const [id,object]of nodes){
      const bounds=visibleBounds(object,object.userData.spec.kind==='points',false,object.userData.spec.kind!=='group');if(bounds.isEmpty())continue;
      const corners=boundCorners(bounds).map(point=>point.project(camera)),xs=corners.map(p=>p.x),ys=corners.map(p=>p.y);
      const left=Math.min(...xs),right=Math.max(...xs),top=Math.max(...ys),bottom=Math.min(...ys);
      const ndc={left,right,top,bottom};
      projected.push({id,kind:object.userData.spec.kind,model:object.userData.spec.model,role:object.userData.spec.role,localRotation:object.rotation.toArray().slice(0,3),worldQuaternion:object.getWorldQuaternion(new T.Quaternion()).toArray(),framed:Boolean(framing?.nodes.includes(id)),ndc,inside:corners.every(p=>Math.abs(p.x)<=1.001&&Math.abs(p.y)<=1.001&&Math.abs(p.z)<=1.001),coverage:Math.max(0,Math.min(1,right)-Math.max(-1,left))*Math.max(0,Math.min(1,top)-Math.max(-1,bottom))/4,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},visibility:sampleVisibility(object,ndc,occluders,occluderBounds),materialColors:[...new Set((()=>{const colors=[];object.traverse(child=>{if(child.userData.nodeId!==id)return;for(const mat of (Array.isArray(child.material)?child.material:[child.material]).filter(Boolean))if(mat.color)colors.push(mat.color.getHexString());});return colors;})())]});
    }
    const shown=[...labels.entries()].filter(([,label])=>!label.hidden).map(([id,label])=>({id,box:label.getBoundingClientRect()})),overlaps=[];
    for(let i=0;i<shown.length;i++)for(let j=i+1;j<shown.length;j++){const a=shown[i].box,b=shown[j].box;if(Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top))overlaps.push([shown[i].id,shown[j].id]);}
    let frameRegion;
    if(framing?.region&&!state.explore){
      const bounds=frameBounds(framing);
      frameRegion=bounds.isEmpty()?{available:false}:{available:true,method:'world-region-projection-v1',nodes:framing.nodes,region:framing.region,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},projectedCorners:boundCorners(bounds).map(point=>point.project(camera).toArray())};
    }
    return {available:true,time:state.time,viewport:[width,height],frame:framing||null,frameRegion,explore:state.explore,camera:{position:camera.position.toArray(),target:cameraTarget.toArray(),fov:camera.fov,distance:camera.position.distanceTo(cameraTarget)},environmentGroundY:environmentGround?.position.y??null,nodes:projected,labelOverlaps:overlaps};
  }
  function animateWorld(){
    const values=new Map();for(const track of sceneData.tracks){if(!values.has(track.target))values.set(track.target,{});values.get(track.target)[track.property]=sample(track.keyframes,movieTime(),track.easing);}
    const bindings=interactionMode==='experiment'?domainLab?.values()||[]:[];
    for(const binding of bindings){if(binding.property==='rotationSpeedY')continue;if(!values.has(binding.node))values.set(binding.node,{});const tracks=values.get(binding.node);const spec=nodes.get(binding.node).userData.spec;if(['opacity','emissive','colorMix'].includes(binding.property))tracks[binding.property]=binding.value;else if(binding.property==='scale')tracks.scale=spec.scale.map((value,index)=>value*(Array.isArray(binding.value)?binding.value[index]:binding.value));else{const key=binding.property==='rotationY'?'rotation':'position',vector=[...(tracks[key]||spec[key])];vector[1]=binding.value;tracks[key]=vector;}}
    for(const binding of bindings.filter(binding=>binding.property==='rotationSpeedY')){if(!values.has(binding.node))values.set(binding.node,{});const tracks=values.get(binding.node),spec=nodes.get(binding.node).userData.spec,rotation=[...(tracks.rotation||spec.rotation)];rotation[1]=globalThis.AISecCinematicDomainRotation(rotation[1],binding.value,state.time);tracks.rotation=rotation;}
    for(const [mat,base]of baseMaterials){if('emissiveIntensity'in mat)mat.emissiveIntensity=base.emissive;if(base.color&&mat.color)mat.color.copy(base.color);}
    for(const object of nodes.values()){
      const spec=object.userData.spec,tracks=values.get(spec.id)||{};
      object.userData.updateSurfaceText?.(interactionMode==='experiment'&&domainLab?domainLab.stage()?.title||presentation.chapters[state.chapter].title:presentation.chapters[state.chapter].title);
      for(const property of ['position','rotation','scale'])object[property].fromArray(tracks[property]??spec[property]);
      const explode=state.exploded?1:clamp(tracks.explode??0,0,1);
      if(object.userData.update)object.userData.update(movieTime(),explode);else if(object.userData.setExplode)object.userData.setExplode(explode);
    }
    for(const object of nodes.values()){
      const spec=object.userData.spec;let opacity=1,emissive=values.get(spec.id)?.emissive,ancestor=object;
      // In experiments, a bound object's glow belongs to its own meshes.
      // A housing's risk indicator must not wash out its independent rotor.
      // Only explicit groups inherit opacity. Transform parenting a gate to
      // a translucent shell does not share the shell's material alpha.
      while(ancestor?.userData.spec){const current=ancestor.userData.spec,tracks=values.get(current.id)||{};if(ancestor===object||current.kind==='group')opacity*=clamp(tracks.opacity??current.opacity??1,0,1);if(interactionMode!=='experiment'&&emissive===undefined&&tracks.emissive!==undefined)emissive=tracks.emissive;ancestor=current.parent?nodes.get(current.parent):null;}
      object.userData.sceneOpacity=opacity;
      const visited=new Set();object.traverse(child=>{if(child.userData.nodeId!==spec.id)return;for(const mat of (Array.isArray(child.material)?child.material:[child.material]).filter(Boolean)){
        if(visited.has(mat))continue;visited.add(mat);const base=baseMaterials.get(mat),alpha=base.opacity*opacity,transparent=base.transparent||alpha<1;
        if(mat.transparent!==transparent){mat.transparent=transparent;mat.needsUpdate=true;}
        mat.opacity=alpha;mat.depthWrite=base.depthWrite&&alpha>=1;mat.visible=base.visible&&alpha>0;
        if(mat.uniforms?.uOpacity)mat.uniforms.uOpacity.value=alpha;
        if(emissive!==undefined&&'emissiveIntensity'in mat&&!spec.surfaceText)mat.emissiveIntensity=emissive;
        const colorMix=values.get(spec.id)?.colorMix;if(colorMix!==undefined&&base.color&&mat.color&&!spec.surfaceText)mat.color.copy(base.color).lerp(new T.Color(sceneData.theme.secondary),colorMix);
      }});
    }
    world.updateMatrixWorld(true);
    for(const link of links){
      const focus=sceneData.chapters[state.chapter].focus,related=id=>{for(let object=nodes.get(id);object?.userData.spec;object=object.parent)if(focus.includes(object.userData.spec.id))return true;return false;};
      const startNode=nodes.get(link.data.from),endNode=nodes.get(link.data.to),opacity=isSceneVisible(startNode)&&isSceneVisible(endNode)&&(focus.length===0||related(link.data.from)||related(link.data.to))?startNode.userData.sceneOpacity*endNode.userData.sceneOpacity:0;
      for(const [mat,base]of [[link.tube.material,.35],[link.particles.material,1]]){const alpha=base*opacity,transparent=base<1||alpha<1;if(mat.transparent!==transparent){mat.transparent=transparent;mat.needsUpdate=true;}mat.opacity=alpha;mat.visible=alpha>0;mat.depthWrite=alpha>=1;}
      const from=nodes.get(link.data.from).getWorldPosition(link.start),to=nodes.get(link.data.to).getWorldPosition(link.end);
      if(!from.equals(link.from)||!to.equals(link.to)){
        link.from.copy(from);link.to.copy(to);link.path.points[0].copy(from);link.path.points[link.path.points.length-1].copy(to);
        if(!link.data.via.length){link.path.points[1].copy(from).lerp(to,.5);link.path.points[1].y+=Math.max(.8,from.distanceTo(to)*.15);}
        link.path.updateArcLengths();const frames=link.path.computeFrenetFrames(64,false),positions=link.tube.geometry.attributes.position,normals=link.tube.geometry.attributes.normal;
        for(let segment=0;segment<=64;segment++){link.path.getPointAt(segment/64,link.point);for(let side=0;side<=6;side++){const angle=side/6*Math.PI*2,index=segment*7+side;link.normal.copy(frames.normals[segment]).multiplyScalar(-Math.cos(angle)).addScaledVector(frames.binormals[segment],Math.sin(angle)).normalize();normals.setXYZ(index,link.normal.x,link.normal.y,link.normal.z);positions.setXYZ(index,link.point.x+link.data.radius*link.normal.x,link.point.y+link.data.radius*link.normal.y,link.point.z+link.data.radius*link.normal.z);}}
        positions.needsUpdate=true;normals.needsUpdate=true;link.tube.geometry.computeBoundingBox();link.tube.geometry.computeBoundingSphere();
      }
      for(let i=0;i<link.data.particles;i++){const at=(movieTime()*link.data.speed+i/Math.max(1,link.data.particles))%1;link.path.getPointAt(at,link.point);link.matrix.makeTranslation(link.point.x,link.point.y,link.point.z);link.particles.setMatrixAt(i,link.matrix);}link.particles.instanceMatrix.needsUpdate=true;
    }
    positionEnvironmentGround();applyCamera();
    const focus=sceneData.chapters[state.chapter].focus,occupied=[];
    for(const [id,label]of labels){
      const object=nodes.get(id),position=object.getWorldPosition(new T.Vector3());
      let top;
      if(presentation.nodes[id].geometry!=='anchor'){
        // Position labels from the rendered object's own bounds, including
        // parent transforms. A fixed 1.35-world-unit offset detached labels
        // from small components and pushed them out of close-up shots.
        const bounds=visibleBounds(object,false,false,object.userData.spec.kind!=='group');
        if(!bounds.isEmpty()){
          bounds.getCenter(position);
          const projected=boundCorners(bounds).map(point=>point.project(camera));
          if(projected.every(point=>point.z>=-1&&point.z<=1))top=Math.min(...projected.map(point=>(-point.y*.5+.5)*height));
        }
      }
      position.project(camera);const x=(position.x*.5+.5)*width,y=top??(-position.y*.5+.5)*height;
      let shown=state.labelsVisible&&isSceneVisible(object)&&(focus.length===0||focus.includes(id)||focus.some(target=>presentation.nodes[target]?.aliasOf===id))&&position.z<1&&x>65&&x<width-65&&y>55&&y<height-65;
      label.hidden=!shown;label.style.left=shown?x+'px':'';label.style.top=shown?y+'px':'';
      if(shown){const box=label.getBoundingClientRect(),boundary=viewport.getBoundingClientRect();shown=box.left>=boundary.left+8&&box.right<=boundary.right-8&&!occupied.some(other=>Math.min(box.right,other.right)-Math.max(box.left,other.left)>-8&&Math.min(box.bottom,other.bottom)-Math.max(box.top,other.top)>-6);label.hidden=!shown;if(shown)occupied.push(box);}
    }
  }
  function drawFallback(){
    const g=ctx;g.clearRect(0,0,width,height);const gradient=g.createRadialGradient(width*.5,height*.4,0,width*.5,height*.5,width*.65);gradient.addColorStop(0,'#172d45');gradient.addColorStop(1,sceneData.theme.background);g.fillStyle=gradient;g.fillRect(0,0,width,height);
    const scale=Math.min(width/24,height/14),project=p=>[width/2+(p[0]-p[2]*.45)*scale,height*.55-(p[1]+p[2]*.3)*scale];
    const positions=new Map(sceneData.nodes.map(node=>[node.id,node.position]));for(const track of sceneData.tracks)if(track.property==='position')positions.set(track.target,sample(track.keyframes,state.time,track.easing));
    g.lineWidth=1.2;
    for(const link of sceneData.connections){const a=project(positions.get(link.from)),b=project(positions.get(link.to));g.strokeStyle=link.color+'70';g.beginPath();g.moveTo(...a);g.lineTo(...b);g.stroke();for(let i=0;i<7;i++){const t=(state.time*link.speed+i/7)%1;g.fillStyle=link.color;g.beginPath();g.arc(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,2,0,Math.PI*2);g.fill();}}
    for(const node of sceneData.nodes.filter(item=>item.kind!=='group'&&item.kind!=='points'&&(presentation.nodes[item.id].geometry==='keep'||presentation.nodes[item.id].label))){const p=project(positions.get(node.id)),r=clamp(16*node.scale[0],8,48);g.save();g.translate(...p);g.strokeStyle=node.color;g.fillStyle=node.color+'28';g.shadowBlur=15;g.shadowColor=node.color;g.lineWidth=1.5;g.beginPath();g.ellipse(0,0,r,r*.55,0,0,Math.PI*2);g.fill();g.stroke();g.shadowBlur=0;for(let i=0;i<8;i++){const angle=state.time*.4+i*Math.PI/4;g.beginPath();g.moveTo(0,0);g.lineTo(Math.cos(angle)*r,Math.sin(angle)*r*.55);g.stroke();}g.fillStyle='#dceafa';g.font='11px system-ui';g.textAlign='center';g.fillText(presentation.nodes[node.id].label||presentation.nodes[node.id].surfaceLines?.[0]||node.model||'',0,-r-10);g.restore();}
  }
  function readCapabilities(){
    const gl=renderer.getContext(),webgl2=renderer.capabilities.isWebGL2,targetType=webgl2&&renderer.extensions.has('EXT_color_buffer_float')?T.HalfFloatType:T.UnsignedByteType;
    const viewportLimits=Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS)),maxTextureSize=renderer.capabilities.maxTextureSize,maxRenderbufferSize=gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
    let samples=[];
    if(webgl2){const color=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,targetType===T.HalfFloatType?gl.RGBA16F:gl.RGBA8,gl.SAMPLES)),depth=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,gl.SAMPLES));samples=color.filter(value=>value>0&&depth.includes(value)).sort((a,b)=>b-a);}
    return {webgl2,targetType,samples,maxTextureSize,maxRenderbufferSize,maxWidth:Math.min(maxTextureSize,maxRenderbufferSize,viewportLimits[0]),maxHeight:Math.min(maxTextureSize,maxRenderbufferSize,viewportLimits[1])};
  }
  function configureQuality(){
    const profile=qualityProfiles[state.quality],requestedRatio=state.quality==='high'?Math.max(1.5,Math.min(lastDpr,2)):profile.ratio;
    const ratio=Math.min(requestedRatio,Math.sqrt(profile.pixels/(width*height)),capabilities.maxWidth*profile.limit/width,capabilities.maxHeight*profile.limit/height),w=Math.max(1,Math.floor(width*ratio)),h=Math.max(1,Math.floor(height*ratio));
    const samples=capabilities.samples.find(value=>value<=profile.samples)||0,shadow=Math.min(profile.shadow,capabilities.maxTextureSize,capabilities.maxRenderbufferSize);
    const next={width:w,height:h,ratio,requestedRatio,samples,shadow,bloom:profile.bloom,pixelBudget:profile.pixels,requestedSamples:profile.samples};
    const resized=!qualityConfig||qualityConfig.width!==w||qualityConfig.height!==h,rebuild=!qualityConfig||qualityConfig.samples!==samples;
    const size=renderer.getSize(new T.Vector2());if(size.x!==width||size.y!==height||renderer.getPixelRatio()!==ratio)renderer.setDrawingBufferSize(width,height,ratio);
    if(rebuild){
      // r150 otherwise allocates a 16-bit depth buffer for postprocessing.
      // Close layered surfaces then z-fight in wide shots even with shadows off.
      const depthTexture=capabilities.webgl2?new T.DepthTexture(w,h,T.UnsignedIntType):undefined;
      compositionTarget=new T.WebGLRenderTarget(w,h,{type:capabilities.targetType,samples,...(depthTexture?{depthTexture}:{})});composer.reset(compositionTarget);targetGeneration++;
    }
    if(resized||rebuild)composer.setSize(w,h);
    if(bloom.enabled&&!profile.bloom)for(const target of [bloom.renderTargetBright,...bloom.renderTargetsHorizontal,...bloom.renderTargetsVertical])target.dispose();
    bloom.enabled=profile.bloom;
    const shadowChanged=renderer.shadowMap.enabled!==(shadow>0);renderer.shadowMap.enabled=shadow>0;
    const changedMaterials=new Set();world.traverse(object=>{
      if(object.isLight&&object.castShadow){const current=object.shadow;if(current.mapSize.x!==shadow||current.mapSize.y!==shadow||!shadow){current.map?.dispose();current.map=null;current.mapPass?.dispose();current.mapPass=null;current.mapSize.set(Math.max(1,shadow),Math.max(1,shadow));current.needsUpdate=true;}}
      if(shadowChanged)for(const mat of (Array.isArray(object.material)?object.material:[object.material]).filter(Boolean))changedMaterials.add(mat);
    });
    for(const mat of changedMaterials)mat.needsUpdate=true;
    if(shadow>0)renderer.shadowMap.needsUpdate=true;
    qualityConfig=next;metricsDirty=true;
  }
  function refreshGpuMetrics(){
    const gl=renderer.getContext(),previous=renderer.getRenderTarget();
    const targets=[composer.renderTarget1,composer.renderTarget2].map(target=>{
      renderer.setRenderTarget(target);
      return {width:target.width,height:target.height,samples:gl.getParameter(gl.SAMPLES),depthBits:gl.getParameter(gl.DEPTH_BITS),complete:gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE};
    });
    renderer.setRenderTarget(previous);
    const shadow=world.children.find(object=>object.isLight&&object.castShadow)?.shadow;
    const limited=qualityConfig.ratio<qualityConfig.requestedRatio-.000001||qualityConfig.samples<qualityConfig.requestedSamples||qualityConfig.shadow<qualityProfiles[state.quality].shadow;
    gpuMetrics={webglVersion:capabilities.webgl2?2:1,devicePixelRatio:lastDpr,requestedPixelRatio:qualityConfig.requestedRatio,pixelRatio:renderer.getPixelRatio(),drawingBuffer:{width:gl.drawingBufferWidth,height:gl.drawingBufferHeight},composer:{targets,type:capabilities.targetType===T.HalfFloatType?'half-float':'unsigned-byte',generation:targetGeneration},requestedSamples:qualityConfig.requestedSamples,samples:targets[0].samples,bloom:{enabled:bloom.enabled,bright:[bloom.renderTargetBright.width,bloom.renderTargetBright.height],mips:bloom.renderTargetsHorizontal.map(target=>[target.width,target.height])},shadow:{enabled:renderer.shadowMap.enabled,mapSize:shadow?.map?[shadow.map.width,shadow.map.height]:[0,0],type:'PCFSoft'},gamma:composer.passes[2].enabled,pixelBudget:qualityConfig.pixelBudget,limits:{width:capabilities.maxWidth,height:capabilities.maxHeight,samples:capabilities.samples.slice()},limited};
    gpuMetrics.bloom.type=bloom.renderTargetBright.texture.type===T.HalfFloatType?'half-float':'unsigned-byte';
    metricsDirty=false;
  }
  function render(){if(disposed||suspended)return;selectChapter();syncLearnerControls();controls?.update();if(mode==='webgl'){animateWorld();renderer.info.reset();composer.render();if(metricsDirty)refreshGpuMetrics();}else drawFallback();dirty=false;state.frames++;root.dataset.frames=String(state.frames);}
  function resize(){
    const w=Math.max(1,viewport.clientWidth),h=Math.max(1,viewport.clientHeight),dpr=globalThis.devicePixelRatio||1,changed=w!==width||h!==height||dpr!==lastDpr;
    width=w;height=h;lastDpr=dpr;
    if(renderer){if(changed||metricsDirty||!qualityConfig)configureQuality();camera.aspect=width/height;camera.updateProjectionMatrix();}else if(changed||!state.frames){fallback.width=width;fallback.height=height;}
    if(changed||dirty||metricsDirty)render();
  }
  function setInteractionMode(value){
    if(!sceneData.lab||!['process','experiment'].includes(value))return;
    transport.pause();clearPointers();setExplore(false);
    if(value==='experiment'&&mode==='webgl'){
      // Use the same unmodified first movie frame for every strategy. Fitting
      // a moving/changed object's bounds per frame would move the camera too.
      interactionMode='process';transport=watchTransport;transport.reset();state.chapter=-1;if(!qualityConfig)resize();else render();
      experimentView={position:camera.position.clone(),target:cameraTarget.clone(),fit:Math.max(1,(16/9)/camera.aspect)};
    }
    interactionMode=value;transport=value==='experiment'?experimentTransport:watchTransport;transport.reset();state.chapter=-1;
    root.dataset.interactionMode=value;root.dataset.domainMotion=String(hasDomainMotion);document.getElementById('cinematic-domain-lab').hidden=value!=='experiment';
    for(const name of ['process','experiment'])document.getElementById('cinema-mode-'+name).setAttribute('aria-pressed',String(name===value));
    invalidate();
  }
  function seek(time){clearPointers();setExplore(false);transport.pause();transport.seek(time);render();}
  function invalidate(){dirty=true;if(!disposed&&!suspended&&frameId==null)frameId=requestAnimationFrame(frame);}
  function setExplore(value){
    if(mode!=='webgl')return;
    // Capture only the view: world animation and its clock remain owned by transport controls.
    if(value&&!state.explore){exploration={position:camera.position.clone(),target:cameraTarget.clone(),fov:camera.fov,fit:Math.max(1,(16/9)/camera.aspect)};state.yaw=0;state.pitch=0;state.zoom=1;}
    if(!value){exploration=null;state.yaw=0;state.pitch=0;state.zoom=1;}
    state.explore=value;invalidate();controls?.update();
    const hint=value?'自由探索 · 拖动旋转 · 滚轮 / 双指缩放 · 可边播放边观察':'拖动旋转 · 滚轮 / 双指缩放 · 点击部件查看说明';
    if(elements['interaction-hint']&&elements['interaction-hint'].textContent!==hint)elements['interaction-hint'].textContent=hint;
  }
  function clearPointers(){const ids=[...pointers.keys()];pointers.clear();pinchDistance=0;for(const id of ids)if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}
  function pointerDistance(){const points=[...pointers.values()];return points.length<2?0:Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);}
  function pickModel(event){
    const rect=canvas.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
    const hit=ray.intersectObjects([...nodes.values()].filter(isSceneVisible),true).find(item=>{const mat=Array.isArray(item.object.material)?item.object.material[item.face?.materialIndex??0]:item.object.material;return isSceneVisible(nodes.get(item.object.userData.nodeId))&&isSceneVisible(item.object)&&mat?.visible!==false&&(mat?.opacity??1)>.03;});if(hit){const id=hit.object.userData.nodeId;if(!domainLab?.pick(id))showDetail(id,true);}
  }
  function isSceneVisible(object){if(!object||(object.userData.sceneOpacity??1)<=.03)return false;for(let current=object;current;current=current.parent)if(!current.visible)return false;return true;}
  function showDetail(id,reveal=false){const node=sceneData.nodes.find(item=>item.id===id),copy=presentation.nodes[id];if(!node||!copy)return;const lines=[...(copy.surfaceLines||[]).filter(line=>line!==copy.label),...(node.surfaceText?.chapterTitle?[presentation.chapters[state.chapter].title]:[]),copy.detail].filter(Boolean);state.selectedDetail=id;elements['detail-title'].textContent=copy.label||copy.surfaceLines?.[0]||'';elements['detail-copy'].textContent=[...new Set(lines)].join('\n');elements['detail-box'].hidden=!lines.length&&!copy.label;if(reveal)controls?.revealNotes();}
  function learnerValue(control,time=state.time){const fraction=clamp((time-control.timeRange[0])/(control.timeRange[1]-control.timeRange[0]),0,1);return control.min+(control.max-control.min)*fraction;}
  function learnerTime(control,value){const fraction=clamp((value-control.min)/(control.max-control.min),0,1);return control.timeRange[0]+(control.timeRange[1]-control.timeRange[0])*fraction;}
  function learnerFeedback(control,value){const item=control.feedback.find(item=>value>=item.min&&value<=item.max)||control.feedback.reduce((best,item)=>Math.abs(value-(item.min+item.max)/2)<Math.abs(value-(best.min+best.max)/2)?item:best);elements['learner-feedback'].dataset.tone=item.tone;elements['learner-feedback'].textContent=item.label+'\n'+item.detail;}
  function setLearnerControl(control,value,seek=true){value=clamp(Number(value),control.min,control.max);if(!Number.isFinite(value))return;state.controlValues[control.id]=value;const entry=learnerInputs.get(control.id);if(entry){entry.input.value=String(value);entry.output.value=String(value)+(control.unit||'');}learnerFeedback(control,value);if(seek)actions.seek(learnerTime(control,value));}
  function syncLearnerControls(){if(interactionMode==='experiment')return;for(const control of sceneData.learnerControls||[]){if(control.type!=='range')continue;const value=learnerValue(control);state.controlValues[control.id]=value;const entry=learnerInputs.get(control.id);if(entry){entry.input.value=String(value);entry.output.value=String(Math.round(value/control.step)*control.step)+(control.unit||'');}}}
  function buildLearnerControls(){const list=sceneData.learnerControls||[];if(!list.length)return;elements['learner-controls'].hidden=false;for(const control of list){const element=document.getElementById('learner-'+control.id);if(control.type==='range'){const output=element?.parentElement?.querySelector('output');if(!element||!output)continue;learnerInputs.set(control.id,{input:element,output});listen(element,'input',()=>setLearnerControl(control,element.value));setLearnerControl(control,control.defaultValue,false);}else if(element)listen(element,'click',()=>{if(control.action==='play')actions.play();else if(control.action==='pause')actions.pause();else if(control.action==='reset')actions.reset();else if(control.action==='seek')actions.seek(control.at);else{actions.seek(control.at);actions.play();}});}}
  function widgetTarget(selector){if(typeof selector!=='string'||!selector)return null;try{return document.querySelector(selector);}catch{return null;}}
  function handleWidgetMessage(event){if(event.source!==window.parent||!event.data)return;const data=event.data,stateData=data.state&&typeof data.state==='object'?data.state:{};if(data.type==='SET_WIDGET_STATE'){if(domainLab&&stateData.domainInputs&&typeof stateData.domainInputs==='object')for(const input of sceneData.lab.model.scene.inputs)if(Object.hasOwn(stateData.domainInputs,input.id))domainLab.setInput(input.id,stateData.domainInputs[input.id]);if(stateData.controlValues&&typeof stateData.controlValues==='object')for(const control of sceneData.learnerControls||[])if(control.type==='range'&&Object.hasOwn(stateData.controlValues,control.id))setLearnerControl(control,stateData.controlValues[control.id]);if(Number.isFinite(stateData.time))actions.seek(stateData.time);if(Number.isFinite(stateData.rate))actions.rate(stateData.rate);if(typeof stateData.exploded==='boolean'&&state.exploded!==stateData.exploded)actions.explode();if(typeof stateData.labelsVisible==='boolean')actions.labels(stateData.labelsVisible);if(stateData.playing===true)actions.play();else if(stateData.playing===false)actions.pause();if(data.content){elements['learner-feedback'].dataset.tone='info';elements['learner-feedback'].textContent=String(data.content);elements['learner-controls'].hidden=false;}}else if(['HIGHLIGHT_ELEMENT','ANNOTATE_ELEMENT','REVEAL_ELEMENT'].includes(data.type)){const target=widgetTarget(data.target);if(target&&data.type==='HIGHLIGHT_ELEMENT'){target.classList.add('maic-highlight');setTimeout(()=>target.classList.remove('maic-highlight'),2600);}if(target&&data.type==='REVEAL_ELEMENT')target.hidden=false;if(data.content&&data.type==='ANNOTATE_ELEMENT'){elements['learner-feedback'].dataset.tone='info';elements['learner-feedback'].textContent=String(data.content);elements['learner-controls'].hidden=false;}const nodeId=target?.dataset?.nodeId;if(nodeId)showDetail(nodeId,true);}invalidate();}
  function disposeGraphics(){
    const geometries=new Set(),materials=new Set(),textures=new Set(),objects=new Set();
    const collect=object=>{if(objects.has(object))return;objects.add(object);const owner=nodes.get(object.userData.nodeId);if(owner?.userData.dispose)return;if(object.geometry)geometries.add(object.geometry);for(const mat of (Array.isArray(object.material)?object.material:[object.material]).filter(Boolean)){materials.add(mat);for(const value of Object.values(mat))if(value?.isTexture)textures.add(value);}object.shadow?.dispose();if(object.isInstancedMesh)object.dispose();};
    world?.traverse(collect);for(const object of nodes.values())object.traverse(collect);
    for(const object of nodes.values())object.userData.dispose?.();
    geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());textures.forEach(value=>{if(value!==environmentTarget?.texture)value.dispose();});
    for(const pass of composer?.passes||[])pass.dispose?.();if(composer)composer.dispose();else compositionTarget?.dispose();environmentTarget?.dispose();
    renderer?.dispose();renderer?.forceContextLoss();nodes.clear();links.length=0;baseMaterials.clear();world=environmentGround=environmentTarget=compositionTarget=undefined;
  }
  function dispose(){if(disposed)return;disposed=true;clearPointers();transport.pause();cancelAnimationFrame(frameId);frameId=null;observer?.disconnect();listeners.abort();disposeGraphics();}
  function bind(){
    const update=callback=>(...args)=>{if(disposed)return;callback(...args);invalidate();controls?.update();};
    actions={
      play:update(()=>{if(state.canPlay)transport.play();}),pause:update(()=>transport.pause()),toggle:update(()=>{if(state.canPlay)transport.toggle();}),
      seek:update(time=>transport.seek(time)),step:update(delta=>transport.step(delta)),
      reset:update(()=>{clearPointers();transport.reset();if(interactionMode==='experiment')domainLab?.reset();state.selectedDetail=null;if(mode==='webgl')elements['detail-box'].hidden=true;state.exploded=false;setExplore(false);}),
      rate:update(value=>transport.setRate(value)),
      quality:update(value=>{if(mode!=='webgl'||!qualityProfiles[value]||state.quality===value)return;state.quality=value;metricsDirty=true;resize();}),
      camera:update(()=>{clearPointers();setExplore(!state.explore);}),
      explode:update(()=>{if(mode==='webgl')state.exploded=!state.exploded;}),
      zoom:update(factor=>{if(mode!=='webgl')return;setExplore(true);state.zoom=clamp(state.zoom*factor,.3,2.5);}),
      labels:update(value=>{state.labelsVisible=value;}),
      beginScrub:update(()=>transport.beginScrub()),endScrub:update(()=>transport.endScrub()),
      layout:()=>{invalidate();},
      fullscreen:()=>{
        if(window.parent!==window){window.parent.postMessage({__aiseceduCinematicPreview:true,action:'toggle-immersive'},'*');return;}
        if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
        else root.requestFullscreen().catch(()=>{elements['interaction-hint'].textContent='请使用浏览器全屏功能放大演示';});
      },
    };
    controls=globalThis.CinematicControls({root,state,scene:sceneData,presentation,listen,actions});
    buildLearnerControls();
    if(sceneData.lab){root.classList.add('has-domain-lab');const labRoot=document.getElementById('cinematic-domain-lab');root.querySelector('.cinema-stage').append(labRoot);labRoot.hidden=false;domainLab=globalThis.AISecCinematicDomainLab({lab:sceneData.lab,root:labRoot,invalidate,onChange:()=>{experimentTransport.reset();controls?.update();}});globalThis.__cinematicLab=domainLab;document.getElementById('cinema-mode-controls').hidden=false;for(const name of ['process','experiment'])listen(document.getElementById('cinema-mode-'+name),'click',()=>setInteractionMode(name));setInteractionMode('experiment');}
    controls.update();
    listen(window,'message',handleWidgetMessage);
    listen(viewport,'pointerdown',event=>{
      if(mode!=='webgl'||event.button!==0)return;
      const label=event.target.closest?.('.node-label');if(event.target!==canvas&&!label)return;
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false,labelId:label?.dataset.nodeId});canvas.setPointerCapture(event.pointerId);
      if(pointers.size>1){for(const pointer of pointers.values())pointer.moved=true;pinchDistance=pointerDistance();setExplore(true);}
    });
    listen(canvas,'pointermove',event=>{
      const pointer=pointers.get(event.pointerId);if(!pointer)return;
      const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;pointer.x=event.clientX;pointer.y=event.clientY;
      if(pointers.size>1){const distance=pointerDistance();if(distance>0&&pinchDistance>0){state.zoom=clamp(state.zoom*pinchDistance/distance,.3,2.5);invalidate();}pinchDistance=distance;return;}
      if(!pointer.moved&&Math.hypot(pointer.x-pointer.startX,pointer.y-pointer.startY)>=5)pointer.moved=true;
      if(pointer.moved&&(dx||dy)){setExplore(true);state.yaw+=dx*.006;state.pitch=clamp(state.pitch+dy*.006,-Math.PI,Math.PI);invalidate();}
    });
    listen(canvas,'pointerup',event=>{
      const pointer=pointers.get(event.pointerId);if(!pointer)return;
      const click=pointers.size===1&&!pointer.moved&&Math.hypot(event.clientX-pointer.startX,event.clientY-pointer.startY)<5;
      pointers.delete(event.pointerId);if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
      for(const remaining of pointers.values())remaining.moved=true;pinchDistance=pointerDistance();
      if(click&&mode==='webgl'){if(pointer.labelId){if(!domainLab?.pick(pointer.labelId))showDetail(pointer.labelId,true);}else pickModel(event);}
    });
    listen(canvas,'pointercancel',clearPointers);listen(canvas,'lostpointercapture',event=>{if(pointers.has(event.pointerId))clearPointers();});listen(window,'blur',()=>{clearPointers();actions.endScrub();});
    listen(viewport,'wheel',event=>{if(mode!=='webgl'||(event.target!==canvas&&!event.target.closest?.('.node-label'))||!Number.isFinite(event.deltaY)||!event.deltaY)return;event.preventDefault();setExplore(true);const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?height:1);state.zoom=clamp(state.zoom*Math.exp(clamp(delta,-600,600)*.0015),.3,2.5);invalidate();},{passive:false});
    if(elements['interaction-hint']){const ids=new Set((canvas.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));ids.add('interaction-hint');canvas.setAttribute('aria-describedby',[...ids].join(' '));}
    if(mode==='webgl')setExplore(false);else{
      for(const id of ['camera-mode','explode-mode','zoom-in','zoom-out','quality','player-labels'])document.getElementById(id).disabled=true;
      const note='二维兼容示意：仅支持播放与时间轴；三维旋转、缩放、拆解和画质切换不可用。';
      elements['detail-box'].hidden=false;elements['detail-title'].textContent='为何与三维演示不同？';elements['detail-copy'].textContent=root.dataset.renderError==='WebGL unavailable'?'浏览器未提供 WebGL。请在 Edge / Chrome 设置中开启“在可用时使用图形加速”，保存其他标签页工作后重新启动浏览器，再打开此作品。若仍无法启用，请检查浏览器 GPU 状态。'+note:'三维场景未能初始化，当前只是二维示意，并非完整模型。请记录下方错误信息后联系维护人员。'+note;elements['node-labels'].hidden=true;
      if(elements['interaction-hint'])elements['interaction-hint'].textContent=note;
    }
    observer=new ResizeObserver(resize);observer.observe(viewport);listen(window,'resize',resize);
    const suspend=()=>{suspended=true;clearPointers();transport.endScrub();transport.resetClock();cancelAnimationFrame(frameId);frameId=null;};
    const resume=()=>{if(disposed)return;suspended=false;transport.resetClock();invalidate();};
    listen(document,'visibilitychange',()=>{if(document.hidden)suspend();else resume();});
    listen(window,'pagehide',event=>{if(event.persisted)suspend();else dispose();});
    listen(window,'pageshow',event=>{if(event.persisted&&!document.hidden)resume();});
  }
  try{
    root.style.setProperty('--accent',sceneData.theme.accent);root.style.setProperty('--secondary',sceneData.theme.secondary);root.style.setProperty('--bg',sceneData.theme.background);
    const gl=canvas.getContext('webgl2',{antialias:true,alpha:false})||canvas.getContext('webgl',{antialias:true,alpha:false});
    if(!gl)throw new Error('WebGL unavailable');T.ColorManagement.enabled=true;renderer=new T.WebGLRenderer({canvas,context:gl,antialias:true,alpha:false});renderer.info.autoReset=false;renderer.physicallyCorrectLights=true;renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;capabilities=readCapabilities();buildWorld();
  }catch(error){
    root.dataset.renderError=error.message;
    if(renderer){const notice=document.createElement('div');notice.className='cinema-error';notice.textContent='三维场景初始化失败：'+error.message;viewport.append(notice);console.error(error);}
    disposeGraphics();renderer=undefined;composer=undefined;camera=undefined;
    mode='2d';canvas.classList.add('hidden');fallback.classList.remove('hidden');ctx=fallback.getContext('2d');const note=document.createElement('div');note.className='fallback-banner';note.setAttribute('role','status');note.textContent=error.message==='WebGL unavailable'?'未启用三维渲染：浏览器无法创建 WebGL。请开启浏览器图形加速并重启浏览器；当前不是完整三维模型。':'三维渲染初始化失败：'+error.message+'。当前仅显示二维示意。';viewport.append(note);
  }
  root.dataset.renderer=mode;bind();resize();
  globalThis.__cinematic={seek,setInteractionMode,dispose,play:actions.play,pause:actions.pause,toggle:actions.toggle,reset:actions.reset,getFrameDiagnostics,getState:()=>({...state,interactionMode,disposed,renderer:mode,frameScheduled:frameId!=null,suspended,camera:camera?.position.toArray(),cameraTarget:cameraTarget?.toArray(),gpu:mode==='webgl'?gpuMetrics:null,activePointers:pointers.size,meshes:[...nodes.values()].reduce((sum,node)=>{let n=0;node.traverse(child=>{if(child.isMesh)n++;});return sum+n;},0),drawCalls:renderer?.info.render.calls,triangles:renderer?.info.render.triangles}),scene:sceneData,presentation};
  function frame(now){frameId=null;if(disposed||suspended)return;if(mode==='webgl'&&(globalThis.devicePixelRatio||1)!==lastDpr)resize();if(transport.tick(now))dirty=true;if(dirty)render();if(state.playing&&!state.scrubbing)frameId=requestAnimationFrame(frame);}invalidate();
})();
