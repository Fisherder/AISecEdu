import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { patchHtmlForIframe } from '@/lib/utils/iframe';

const require = createRequire(import.meta.url);
const { chromium } = require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const evidence = process.env.AISECEDU_EVIDENCE_DIR;
describe.skipIf(!evidence)('real sandboxed browser rendering', () => {
  it.each(['webgl2', 'webgl'])('renders visible offline geometry with %s', async (contextType) => {
    const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
    try {
      const page = await browser.newPage({viewport:{width:1400,height:900}});
      const failures: string[] = [];
      page.on('pageerror', (error: Error) => failures.push(error.message));
      page.on('console', (message: {type:()=>string;text:()=>string}) => {if(message.type()==='error')failures.push(message.text());});
      const requests: string[] = [];
      await page.route('**/*', (route: {request:()=>{url:()=>string};abort:()=>Promise<void>}) => {requests.push(route.request().url());return route.abort();});
      const html = patchHtmlForIframe(`<html><head></head><body><script src="aisecedu:three"></script><canvas id="canvas"></canvas><script>const canvas=document.querySelector("canvas");const gl=canvas.getContext("${contextType}",{preserveDrawingBuffer:true});if(!gl)throw Error("Requested context unavailable");const renderer=new THREE.WebGLRenderer({canvas,context:gl,preserveDrawingBuffer:true});renderer.setSize(600,400);const scene=new THREE.Scene();scene.add(new THREE.AmbientLight(0xffffff,1));const camera=new THREE.PerspectiveCamera(50,1.5,.1,100);camera.position.z=5;const box=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({color:0x2288dd,roughness:.6}));scene.add(box);let count=0;function frame(){box.rotation.x+=.03;box.rotation.y+=.04;renderer.render(scene,camera);document.body.dataset.frame=String(++count);requestAnimationFrame(frame)};frame();</script></body></html>`);
      await page.setContent('<iframe title="three" sandbox="allow-scripts" style="width:100%;height:800px"></iframe>');
      await page.locator('iframe').evaluate((element: HTMLIFrameElement, content: string) => {element.srcdoc=content;},html);
      const frame = page.frames().find((item: {parentFrame:()=>unknown}) => item.parentFrame());
      await frame.waitForFunction(() => Number(document.body.dataset.frame) > 5);
      const before = await frame.locator('canvas').screenshot();
      await page.waitForTimeout(500);
      const after = await frame.locator('canvas').screenshot();
      expect(before.equals(after)).toBe(false);
      const drawing = await frame.evaluate((kind:string) => {
        const canvas=document.querySelector('canvas')!;
        const gl=canvas.getContext(kind) as WebGLRenderingContext;
        const pixels=new Uint8Array(canvas.width*canvas.height*4);
        gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        let colored=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+2]>pixels[i]+20)colored++;
        return {colored,error:gl.getError()};
      },contextType);
      expect(drawing.error).toBe(0);expect(drawing.colored).toBeGreaterThan(1000);
      expect(failures).toEqual([]); expect(requests).toEqual([]);
      expect(await frame.evaluate(() => {try{return window.parent.document.title;}catch{return 'isolated';}})).toBe('isolated');
      fs.mkdirSync(evidence!,{recursive:true});fs.writeFileSync(path.join(evidence!,`three-offline-${contextType}.png`),after);
      fs.writeFileSync(path.join(evidence!,`three-offline-${contextType}.json`),JSON.stringify({contextType,drawing,changedFrames:true,externalRequests:requests,errors:failures,isolated:true}));
    } finally {await browser.close();}
  },30000);
});
