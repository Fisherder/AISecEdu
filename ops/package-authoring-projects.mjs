import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {packageAnimationValidator} from './package-animation-validator.mjs';

const root=process.cwd();
const destination=process.argv[2];
if (!destination || !/^\/private\/tmp\/aisecedu-(?:authoring|cinematic)-[^/]+\//.test(destination)) throw new Error('Explicit task staging subdirectory required');
const runtimeConfig=JSON.parse(fs.readFileSync('services/agent-runtime/.next/required-server-files.json','utf8')).config;
if(runtimeConfig?.basePath!=='/agent-runtime'||runtimeConfig?.assetPrefix!=='/agent-runtime'||runtimeConfig?.output!=='standalone') throw new Error('Integrated runtime build required; run node ops/build-cinematic-runtime.mjs before packaging');
fs.mkdirSync(destination,{recursive:true,mode:0o700});
const paths=execFileSync('git',['ls-files','--modified','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean).filter(name=>(!fs.lstatSync(name).isSymbolicLink()||name.startsWith('dojo_theme/static/'))&&!name.startsWith('services/agent-runtime/packages/')&&!name.startsWith('services/agent-runtime/cache/'));
const sha=content=>crypto.createHash('sha256').update(content).digest('hex');
const base=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const files={};
for(const name of paths){let before=null;try{before=sha(execFileSync('git',['show',`HEAD:${name}`],{stdio:['ignore','pipe','ignore']}));}catch{} files[name]={before,after:sha(fs.readFileSync(name))};}
fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify({base,files},null,2));
fs.writeFileSync(path.join(destination,'files.txt'),paths.join('\n')+'\n');
execFileSync('tar',['--no-xattrs','-chf',path.join(destination,'source.tar'),'-T',path.join(destination,'files.txt')],{env:{...process.env,COPYFILE_DISABLE:'1'}});
const build=path.join(destination,'runtime');fs.mkdirSync(build,{recursive:true});
fs.cpSync('services/agent-runtime/.next/standalone/.next',path.join(build,'.next'),{recursive:true,dereference:true});
fs.cpSync('services/agent-runtime/.next/static',path.join(build,'.next/static'),{recursive:true,dereference:true});
fs.copyFileSync('services/agent-runtime/.next/standalone/server.js',path.join(build,'server.js'));
packageAnimationValidator(path.join(build,'runtime-deps'));
execFileSync('tar',['--no-xattrs','-czf',path.join(destination,'runtime.tgz'),'-C',build,'.next','server.js','runtime-deps'],{env:{...process.env,COPYFILE_DISABLE:'1'}});
console.log(JSON.stringify({sourceFiles:paths.length,base,runtimeBytes:fs.statSync(path.join(destination,'runtime.tgz')).size}));
