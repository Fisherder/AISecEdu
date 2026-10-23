import fs from 'node:fs';
import assert from 'node:assert/strict';
const checks=[];
const scene=index=>JSON.parse(fs.readFileSync(`cache/cinematic-production/example-${index}/artifact.json`)).revision.content.lesson.artifacts[0].content.cinematicScene;
const sample=(s,id,property,time)=>{
 const node=s.nodes.find(n=>n.id===id);assert.ok(node,`Missing ${id}`);
 const track=s.tracks.find(t=>t.target===id&&t.property===property);if(!track)return node[property]??(property==='opacity'?1:undefined);
 const keys=track.keyframes;if(time<=keys[0].at)return keys[0].value;
 for(let i=1;i<keys.length;i++)if(time<keys[i].at){let t=(time-keys[i-1].at)/(keys[i].at-keys[i-1].at);if(track.easing!=='linear')t=t*t*(3-2*t);const a=keys[i-1].value,b=keys[i].value;return Array.isArray(a)?a.map((v,j)=>v+(b[j]-v)*t):a+(b-a)*t;}
 return keys.at(-1).value;
};
const close=(a,b)=>Math.abs(a-b)<.001;
const industrial=scene(1);
assert.ok(!industrial.tracks.some(t=>t.target==='turbine'&&t.property==='rotation'),'Turbine base rotates');
assert.ok(industrial.tracks.some(t=>t.target==='turbine'&&t.property==='explode'),'No mechanism disassembly');
assert.ok(industrial.nodes.find(n=>n.id==='panel-rack').position[1]>.3,'Rack buried in floor');
const markers=['tag-local','tag-display','tag-independent'];
const states=markers.map(id=>sample(industrial,id,'position',50));
assert.equal(new Set(states.map(v=>v[2])).size,3,'Readout channels physically overlap');
assert.ok(close(states[0][0],states[2][0])&&!close(states[0][0],states[1][0]),'Independent observation does not match baseline');
assert.ok(close(sample(industrial,'tag-local','position',66)[0],sample(industrial,'tag-display','position',66)[0]),'Recovery not implemented');
assert.ok(sample(industrial,'tag-independent','opacity',10)<.01&&sample(industrial,'tag-independent','opacity',50)>.99);
checks.push('Industrial: stationary housing, disassembly, visible rack; three separate readout rows, deviation, independent match and recovery');
const processor=scene(2),layers=['layer-retaddr','layer-args','layer-locals','layer-saved'];
for(const [i,id]of layers.entries()){
 assert.ok(sample(processor,id,'opacity',20)<.01,`${id} present before call`);
 assert.ok(sample(processor,id,'opacity',39)>.99,`${id} absent in active frame`);
 assert.ok(sample(processor,id,'opacity',71)<.01,`${id} not released`);
 assert.ok(sample(processor,id,'opacity',30+2*i+.5)>0&&sample(processor,id,'opacity',30+2*i+.5)<1,`${id} not revealed sequentially`);
}
assert.ok(sample(processor,'pc-marker','position',10)[0]>0,'PC still opposite memory');
const old=processor.nodes.find(n=>n.id==='old-value'),fresh=processor.nodes.find(n=>n.id==='new-value');
assert.equal(old.parent,'layer-locals');assert.equal(fresh.parent,'layer-locals');
assert.ok(sample(processor,'old-value','opacity',49)<.01&&sample(processor,'new-value','opacity',49)>.99);
assert.deepEqual(sample(processor,'ret-marker','position',60),processor.nodes.find(n=>n.id==='result-marker').position,'Return misses receiver');
checks.push('Processor: four layers reveal/retire in sequence, PC on memory side, value markers parented to local layer and return reaches receiver');
const orbit=scene(3);
for(const id of ['star-ring-a','star-ring-b','planet-clouds'])assert.ok(!orbit.nodes.some(n=>n.id===id),'Redundant occluder: '+id);
const distance=v=>Math.hypot(...v);
for(let time=0;time<=orbit.duration;time+=.1)assert.ok(distance(sample(orbit,'satellite-body','position',time))>=6.6,'Satellite enters conservative planet+satellite bounds at '+time);
assert.ok(orbit.tracks.some(t=>t.target==='satellite-body'&&t.property==='explode'));
assert.ok(orbit.tracks.some(t=>t.target==='satellite-body'&&t.property==='rotation'));
assert.equal(orbit.nodes.find(n=>n.id==='view-cone').parent,'satellite-body','Direction marker not attached to satellite');
assert.ok(!orbit.tracks.some(t=>t.target==='view-cone'&&t.property==='rotation'),'Direction marker has independent world rotation');
assert.ok(!orbit.connections.some(c=>['orbit-to-satellite','view-cone-link'].includes(c.id)),'Misleading relationship remains');
checks.push('Orbit: duplicate shells removed; full sampled trajectory outside conservative bounds; satellite disassembly and attitude tracks present');
const result={passed:true,checks,scope:'SceneIR assertions supplement, not replace, real production browser and visual review'};
fs.writeFileSync('cache/cinematic-production/semantic-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
