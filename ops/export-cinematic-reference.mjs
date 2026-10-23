import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';

const root=process.cwd(),runtime=path.join(root,'services/agent-runtime');
const destination=path.resolve(process.argv[2]||'cache/cinematic-reference');
const require=createRequire(path.join(runtime,'package.json'));
const {build}=require(require.resolve('esbuild',{paths:[require.resolve('vitest/package.json')]}));
const staging=fs.mkdtempSync(path.join(os.tmpdir(),'aisecedu-cinematic-export-'));
const output=path.join(staging,'export.cjs');
await build({stdin:{contents:`import {compileCinematicScene} from './lib/cinematic/compile';import {patchHtmlForIframe} from './lib/utils/iframe';import * as fixtures from './lib/cinematic/reference-scenes';export {compileCinematicScene,patchHtmlForIframe,fixtures};`,resolveDir:runtime},outfile:output,bundle:true,platform:'node',format:'cjs',tsconfig:path.join(runtime,'tsconfig.json'),plugins:[{name:'raw',setup(build){build.onResolve({filter:/\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path.replace(/\?raw$/,'')),namespace:'raw'}));build.onLoad({filter:/.*/,namespace:'raw'},args=>({contents:fs.readFileSync(args.path,'utf8'),loader:'text'}));}}]});
const {compileCinematicScene,patchHtmlForIframe,fixtures}=require(output);
const artifactRoot=process.argv[3]?path.resolve(process.argv[3]):null;
const scenes=artifactRoot?[1,2,3].map(index=>path.join(artifactRoot,'example-'+index,'artifact.json')).filter(file=>fs.existsSync(file)).map(file=>JSON.parse(fs.readFileSync(file,'utf8')).revision.content.lesson.artifacts[0].content.cinematicScene):Object.values(fixtures).flat().map(value=>value?.scene||value).filter(value=>value?.schemaVersion==='cinematic-v1');
if(!scenes.length)throw Error('No reference scenes exported');
fs.mkdirSync(destination,{recursive:true});
const seen=new Set();
for(const scene of scenes){if(seen.has(scene.title))continue;seen.add(scene.title);const name='reference-'+seen.size;fs.writeFileSync(path.join(destination,name+'.html'),patchHtmlForIframe(compileCinematicScene(scene)));fs.writeFileSync(path.join(destination,name+'.json'),JSON.stringify(scene,null,2));console.log(name,scene.title);}
console.log(artifactRoot?'AI-generated SceneIR, recompiled locally; production browser acceptance still required:':'REFERENCE FIXTURES ONLY; not AI-generated production examples:',destination);
