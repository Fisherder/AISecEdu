import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const runtime = fileURLToPath(
  new URL("../services/agent-runtime/", import.meta.url),
);
const runtimeRequire = createRequire(path.join(runtime, "package.json"));
const { chromium, expect } = runtimeRequire("@playwright/test");
const ts = runtimeRequire("typescript");
const outerBridgePath = fileURLToPath(
  new URL("../dojo_theme/static/js/dojo/teaching-artifact.js", import.meta.url),
);
const outerSource = ts.createSourceFile(
  outerBridgePath,
  readFileSync(outerBridgePath, "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS,
);
function outerFunction(name) {
  let declaration;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name)
      declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(outerSource);
  assert(declaration, `Missing outer bridge function: ${name}`);
  return declaration.getText(outerSource);
}
let esbuild;
try {
  esbuild = runtimeRequire("esbuild");
} catch {
  const store = path.join(runtime, "node_modules/.pnpm");
  const packageName = readdirSync(store)
    .filter((name) => name.startsWith("esbuild@"))
    .sort()
    .at(-1);
  assert(
    packageName,
    "Install the project dependencies before running this harness.",
  );
  esbuild = runtimeRequire(
    path.join(store, packageName, "node_modules/esbuild"),
  );
}

const evidence = process.env.AISECEDU_CINEMATIC_UI_EVIDENCE
  ? path.resolve(process.env.AISECEDU_CINEMATIC_UI_EVIDENCE)
  : mkdtempSync(path.join(tmpdir(), "cinematic-preview-ui-"));
mkdirSync(evidence, { recursive: true });
const reportPath = path.join(evidence, "report.json");
const report = {
  startedAt: new Date().toISOString(),
  scope:
    "Actual CinematicPreview React component and CSS, with an instrumented offline playback fixture; not a cinematic visual-quality assessment.",
  component: path.join(runtime, "components/cinematic-preview.tsx"),
  sourceHashes: Object.fromEntries(
    [
      path.join(runtime, "components/cinematic-preview.tsx"),
      path.join(runtime, "components/integrated-lesson-preview.module.css"),
      path.join(runtime, "lib/utils/iframe.ts"),
      outerBridgePath,
      fileURLToPath(import.meta.url),
    ].map((filename) => [
      filename,
      createHash("sha256").update(readFileSync(filename)).digest("hex"),
    ]),
  ),
  scenarios: [],
  status: "running",
};

const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{margin:0;background:#091425;color:#def5ff;font-family:system-ui,sans-serif}main{min-height:100vh;padding:24px;display:flex;flex-direction:column;gap:16px}h1{font-size:clamp(18px,3vw,30px);margin:0}p{color:#99b4cc;margin:0}canvas{width:100%;height:40vh;background:#101e34;border:1px solid #335369;border-radius:12px}nav{display:flex;flex-wrap:wrap;gap:12px}button{padding:12px 16px;background:#1b394b;color:#c4f4ff;border:1px solid #75d8e9;border-radius:8px;font:inherit}output{font:22px monospace}button:focus-visible{outline:3px solid #ffffab}
</style></head><body><main data-cinematic-container-fixture="v1"><h1>电影式播放器 · 浏览器 UI 验证</h1><p>离线计时夹具，仅验证容器、播放状态和消息行为。</p><canvas id="fixture-canvas"></canvas><output id="fixture-time"></output><nav><button id="fixture-play">播放</button><button id="fixture-pause">暂停</button><button id="fixture-error">触发运行时错误</button></nav></main><script>
window.__fixture={token:Math.random().toString(36).slice(2),time:17.25,playing:false,ticks:0};
const state=window.__fixture,canvas=document.querySelector('canvas'),context=canvas.getContext('2d');
canvas.width=1000;canvas.height=340;
document.querySelector('#fixture-play').onclick=()=>{state.playing=true};
document.querySelector('#fixture-pause').onclick=()=>{state.playing=false};
document.querySelector('#fixture-error').onclick=()=>{throw new Error('cinematic fixture render failure')};
let last=0;
function tick(now){if(state.playing&&last)state.time+=(now-last)/1000;last=now;state.ticks++;context.fillStyle='#101e34';context.fillRect(0,0,1000,340);context.fillStyle='#6bdded';context.beginPath();context.arc(500+Math.sin(state.time)*260,170,48,0,Math.PI*2);context.fill();context.fillStyle='#dffaff';context.font='22px monospace';context.fillText('t = '+state.time.toFixed(3)+'s',28,40);document.querySelector('#fixture-time').value=state.time.toFixed(3)+' s';requestAnimationFrame(tick)}
requestAnimationFrame(tick);
</script></body></html>`;

const entry = `
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { CinematicPreview } from './components/cinematic-preview';
let html = ${JSON.stringify(fixture)};
if (location.search.includes('bootstrap-error')) html=html.replace('</head>','<script>throw new Error("cinematic fixture early error")</script></head>');
window.__harness={spoofs:0,fullscreenCalls:0};
Element.prototype.requestFullscreen=function(){window.__harness.fullscreenCalls++;throw new Error('Native fullscreen must not be required for immersion')};
window.addEventListener('message',event=>{if(event.data?.__fixtureSpoof)window.__harness.spoofs++});
const root=createRoot(document.getElementById('root'));
window.__unmountPreview=()=>root.unmount();
root.render(createElement(CinematicPreview,{title:'电影式播放器 UI 验证',html}));
`;

const built = await esbuild.build({
  stdin: {
    contents: entry,
    resolveDir: runtime,
    sourcefile: "cinematic-preview-ui-harness.tsx",
    loader: "tsx",
  },
  bundle: true,
  write: false,
  outdir: evidence,
  entryNames: "harness",
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  tsconfig: path.join(runtime, "tsconfig.json"),
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "raw-assets",
      setup(build) {
        build.onResolve({ filter: /\?raw$/ }, (args) => ({
          path: path.resolve(args.resolveDir, args.path.slice(0, -4)),
          namespace: "raw-assets",
        }));
        build.onLoad({ filter: /.*/, namespace: "raw-assets" }, (args) => ({
          contents: readFileSync(args.path, "utf8"),
          loader: "text",
        }));
      },
    },
  ],
});
const assets = new Map(
  built.outputFiles.map((file) => [
    `/${path.basename(file.path)}`,
    file.contents,
  ]),
);
assert(
  assets.has("/harness.js") && assets.has("/harness.css"),
  "Harness requires both the actual JS component and CSS module.",
);
const shell = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/harness.css"><style>html,body{margin:0;background:#030914;color:#dcefff;font-family:system-ui,sans-serif}#root{margin:16px}#outside{padding:12px 16px}#outside button{padding:10px} @media(max-width:650px){#root{margin:0}}</style></head><body><div id="outside"><button id="outside-button">播放器外部按钮</button></div><div id="root"></div><script src="/harness.js"></script></body></html>`;
const hostShell = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#182133;color:#edf5ff;font-family:system-ui}body{overflow:scroll}.artifact-preview-toolbar{height:40px;flex-shrink:0;padding:10px;box-sizing:border-box}</style></head><body><section id="artifact-preview-panel" style="width:980px;height:540px;margin:70px 32px;border:2px solid #7399ab;display:flex;flex-direction:column;box-sizing:border-box"><header class="artifact-preview-toolbar">父页面预览工具栏</header><iframe id="artifact-preview" title="runtime" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals" allow="fullscreen" referrerpolicy="no-referrer" style="width:100%;height:496px;border:0" src="/"></iframe></section><script>
const iframe=document.getElementById('artifact-preview'),previewPanel=document.getElementById('artifact-preview-panel'),artifactId='fixture';let cinematicImmersion=null;
window.__hostEvents=[];window.__hostWitness={iframe,frameWindow:iframe.contentWindow,src:iframe.getAttribute('src'),loads:0};iframe.addEventListener('load',()=>window.__hostWitness.loads++);
${outerFunction("setCinematicImmersion")}
${outerFunction("handlePreviewMessage")}
window.addEventListener('message',handlePreviewMessage);
window.addEventListener('message',event=>{if(event.source===iframe.contentWindow&&event.origin===location.origin&&event.data?.action==='immersive-change')window.__hostEvents.push(event.data.immersive)});
</script></body></html>`;
const server = createServer((request, response) => {
  const pathname = new URL(request.url, "http://127.0.0.1").pathname;
  const asset = assets.get(pathname);
  if (asset) {
    response.writeHead(200, {
      "content-type": pathname.endsWith(".css")
        ? "text/css"
        : "text/javascript",
      "cache-control": "no-store",
    });
    response.end(asset);
  } else if (pathname === "/" || pathname === "/host") {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(pathname === "/host" ? hostShell : shell);
  } else {
    response.writeHead(204);
    response.end();
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const origin = `http://127.0.0.1:${server.address().port}`;
const candidates = [
  process.env.PLAYWRIGHT_CHROMIUM_PATH,
  chromium.executablePath(),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const executablePath = candidates.find((candidate) => existsSync(candidate));
const playerSelector = '[data-aisecedu-cinematic-preview="v1"]';
let browser;

async function openScenario(name, viewport, query = "") {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(10_000);
  const observations = {
    pageErrors: [],
    consoleErrors: [],
    externalRequests: [],
  };
  page.on("pageerror", (error) => observations.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error")
      observations.consoleErrors.push(message.text());
  });
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === origin)
      return route.continue();
    observations.externalRequests.push(route.request().url());
    return route.abort();
  });
  await page.goto(origin + query);
  const frameElement = page.locator(`${playerSelector} iframe`);
  await expect(frameElement).toBeVisible();
  const frame = await (await frameElement.elementHandle()).contentFrame();
  await frame.waitForFunction(() => window.__fixture?.ticks > 1);
  await page.evaluate((selector) => {
    const iframe = document.querySelector(`${selector} iframe`);
    window.__witness = {
      iframe,
      frameWindow: iframe.contentWindow,
      srcDoc: iframe.srcdoc,
      loads: 0,
      sourceChanges: 0,
      replacements: 0,
    };
    iframe.addEventListener("load", () => window.__witness.loads++);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes" && record.target === iframe)
          window.__witness.sourceChanges++;
        if (record.type === "childList") {
          for (const node of [...record.addedNodes, ...record.removedNodes]) {
            if (
              node === iframe ||
              (node instanceof Element && node.contains(iframe))
            )
              window.__witness.replacements++;
          }
        }
      }
    });
    observer.observe(document.querySelector(selector), {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["srcdoc"],
    });
  }, playerSelector);
  return {
    name,
    viewport,
    page,
    frame,
    frameElement,
    player: page.locator(playerSelector),
    observations,
  };
}

async function documentWitness(scenario) {
  const result = await scenario.page.evaluate((selector) => {
    const iframe = document.querySelector(`${selector} iframe`);
    const witness = window.__witness;
    return {
      sameElement: witness.iframe === iframe,
      sameWindow: witness.frameWindow === iframe.contentWindow,
      sameSrcDoc: witness.srcDoc === iframe.srcdoc,
      loads: witness.loads,
      sourceChanges: witness.sourceChanges,
      replacements: witness.replacements,
      nativeFullscreen: !!document.fullscreenElement,
      fullscreenCalls: window.__harness.fullscreenCalls,
    };
  }, playerSelector);
  assert.deepEqual(result, {
    sameElement: true,
    sameWindow: true,
    sameSrcDoc: true,
    loads: 0,
    sourceChanges: 0,
    replacements: 0,
    nativeFullscreen: false,
    fullscreenCalls: 0,
  });
  return result;
}

async function enter(scenario) {
  await scenario.page
    .getByRole("button", { name: "沉浸演示", exact: true })
    .click();
  await expect(scenario.player).toHaveAttribute("data-immersive", "true");
  await expect(scenario.player).toHaveAttribute("role", "dialog");
  await expect(
    scenario.page.getByRole("button", { name: "退出沉浸演示", exact: true }),
  ).toBeVisible();
}

async function iframeEscape(scenario) {
  await scenario.frame.locator("#fixture-pause").focus();
  assert(
    await scenario.page.evaluate(
      () => document.activeElement instanceof HTMLIFrameElement,
    ),
    "Escape must be sent while focus is actually inside the iframe.",
  );
  await scenario.page.keyboard.press("Escape");
  await expect(scenario.player).toHaveAttribute("data-immersive", "false");
  await expect(
    scenario.page.getByRole("button", { name: "沉浸演示", exact: true }),
  ).toBeFocused();
}

function checkObservations(scenario, expectedErrors = []) {
  assert.deepEqual(scenario.observations.externalRequests, []);
  const unexpected = [
    ...scenario.observations.pageErrors,
    ...scenario.observations.consoleErrors,
  ].filter(
    (message) => !expectedErrors.some((expected) => message.includes(expected)),
  );
  assert.deepEqual(unexpected, []);
}

try {
  assert(
    executablePath,
    "No installed Chromium found. Set PLAYWRIGHT_CHROMIUM_PATH; this helper does not download browsers.",
  );
  browser = await chromium.launch({ executablePath, headless: true });
  report.browser = await browser.version();
  report.executablePath = executablePath;
  console.log(`Evidence: ${evidence}`);
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["laptop", { width: 1366, height: 768 }],
    ["mobile", { width: 390, height: 844 }],
    ["landscape", { width: 844, height: 390 }],
  ]) {
    const scenario = await openScenario(name, viewport);
    const { page, frame, frameElement, player } = scenario;
    const initial = await frame.evaluate(() => ({ ...window.__fixture }));
    const inlineBox = await frameElement.boundingBox();
    assert(
      inlineBox.height >= Math.min(viewport.height * 0.72, 800) - 1,
      `${name}: iframe is too short`,
    );
    await expect(frameElement).toHaveAttribute("sandbox", "allow-scripts");
    assert.equal(
      await frame.evaluate(() => {
        try {
          return !!parent.document;
        } catch {
          return false;
        }
      }),
      false,
    );
    await page.screenshot({
      path: path.join(evidence, `${name}-inline.png`),
      fullPage: true,
    });
    await enter(scenario);
    const immersiveBox = await player.boundingBox();
    const immersiveFrameBox = await frameElement.boundingBox();
    assert(Math.abs(immersiveBox.x) < 1 && Math.abs(immersiveBox.y) < 1);
    assert(
      Math.abs(immersiveBox.width - viewport.width) < 1 &&
        Math.abs(immersiveBox.height - viewport.height) < 1,
    );
    assert(
      Math.abs(immersiveFrameBox.width - viewport.width) < 1 &&
        immersiveFrameBox.height > viewport.height * 0.5,
    );
    assert.equal(
      await frame.evaluate(() => window.__fixture.time),
      initial.time,
    );
    await page.screenshot({
      path: path.join(evidence, `${name}-immersive.png`),
      fullPage: true,
    });
    await iframeEscape(scenario);
    await enter(scenario);
    await page
      .getByRole("button", { name: "退出沉浸演示", exact: true })
      .click();
    await expect(player).toHaveAttribute("data-immersive", "false");
    await enter(scenario);
    await expect(
      page.getByRole("button", { name: "退出沉浸演示", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(player).toHaveAttribute("data-immersive", "false");
    assert.equal(
      await frame.evaluate(() => window.__fixture.time),
      initial.time,
    );
    await frame.locator("#fixture-play").click();
    await frame.waitForFunction(
      (start) => window.__fixture.time > start + 0.1,
      initial.time,
    );
    await enter(scenario);
    const playing = await frame.evaluate(() => ({ ...window.__fixture }));
    assert.equal(playing.playing, true);
    await iframeEscape(scenario);
    await frame.locator("#fixture-pause").click();
    const paused = await frame.evaluate(() => ({ ...window.__fixture }));
    assert.equal(paused.token, initial.token);
    assert(paused.time >= playing.time && paused.time > initial.time);
    const witness = await documentWitness(scenario);
    assert.equal(await page.evaluate(() => document.body.style.overflow), "");
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `${name}: page overflows horizontally`,
    );
    checkObservations(scenario);
    report.scenarios.push({
      name,
      viewport,
      inlineBox,
      immersiveBox,
      immersiveFrameBox,
      initial,
      playing,
      paused,
      witness,
      sandboxParentAccessBlocked: true,
      exitViaButton: true,
      exitViaParentEscape: true,
      exitViaIframeEscape: true,
      ...scenario.observations,
    });
    await page.close();
    console.log(
      `PASS ${name}: iframe retained; paused/running state retained; iframe Escape and button exit; dimensions and sandbox`,
    );
  }

  const messages = await openScenario("message-source-and-errors", {
    width: 1440,
    height: 1000,
  });
  await enter(messages);
  await messages.page.evaluate(() => {
    const foreign = document.createElement("iframe");
    foreign.id = "unrelated-frame";
    foreign.sandbox = "allow-scripts";
    foreign.style.display = "none";
    foreign.srcdoc = "<html><body>unrelated frame</body></html>";
    document.body.append(foreign);
  });
  const foreign = await (
    await messages.page.locator("#unrelated-frame").elementHandle()
  ).contentFrame();
  await foreign.waitForLoadState();
  const spoofError = {
    __fixtureSpoof: true,
    __maicInteractive: true,
    kind: "runtime-error",
    errorKind: "error",
    message: "unrelated frame must be ignored",
  };
  const spoofEscape = {
    __fixtureSpoof: true,
    __aiseceduCinematicPreview: true,
    action: "exit-immersive",
  };
  await foreign.evaluate((data) => parent.postMessage(data, "*"), spoofError);
  await foreign.evaluate((data) => parent.postMessage(data, "*"), spoofEscape);
  await messages.page.evaluate(
    (data) => window.postMessage(data, "*"),
    spoofError,
  );
  await messages.page.waitForFunction(() => window.__harness.spoofs === 3);
  await expect(messages.player).toHaveAttribute("data-immersive", "true");
  await expect(messages.page.getByRole("alert")).toHaveCount(0);
  await messages.frame.locator("#fixture-error").click();
  const errorPanel = messages.page.getByRole("alert", {
    name: "演示运行时错误",
  });
  await expect(errorPanel).toBeVisible();
  await expect(errorPanel).toContainText("cinematic fixture render failure");
  await expect(errorPanel.locator("li")).toHaveCount(1);
  await messages.page
    .locator(`${playerSelector} iframe`)
    .evaluate((iframe) =>
      iframe.contentWindow.postMessage({ __maicErrorReplayRequest: true }, "*"),
    );
  await expect(errorPanel.locator("li")).toHaveCount(1);
  await messages.page.screenshot({
    path: path.join(evidence, "runtime-error-immersive.png"),
    fullPage: true,
  });
  await iframeEscape(messages);
  await expect(errorPanel).toBeVisible();
  await enter(messages);
  await expect(errorPanel).toBeVisible();
  const errorWitness = await documentWitness(messages);
  checkObservations(messages, ["cinematic fixture render failure"]);
  report.scenarios.push({
    name: messages.name,
    ignoredForeignMessages: 3,
    actualRuntimeErrorVisible: true,
    replayDeduplicated: true,
    errorVisibleAcrossImmersion: true,
    witness: errorWitness,
    ...messages.observations,
  });
  await messages.page.close();
  console.log(
    "PASS message sources: sibling/null-origin and parent ignored; real iframe runtime error visible and replay deduplicated",
  );

  const early = await openScenario(
    "early-runtime-error",
    { width: 1366, height: 768 },
    "?bootstrap-error=1",
  );
  await expect(early.page.getByRole("alert")).toContainText(
    "cinematic fixture early error",
  );
  await enter(early);
  await expect(early.page.getByRole("alert")).toBeVisible();
  await early.page.screenshot({
    path: path.join(evidence, "early-runtime-error.png"),
    fullPage: true,
  });
  await iframeEscape(early);
  checkObservations(early, ["cinematic fixture early error"]);
  report.scenarios.push({
    name: early.name,
    synchronousBootstrapErrorVisible: true,
    witness: await documentWitness(early),
    ...early.observations,
  });
  await early.page.close();
  console.log("PASS early runtime error capture");

  const hostPage = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  hostPage.setDefaultTimeout(10_000);
  const hostErrors = [];
  hostPage.on("pageerror", (error) => hostErrors.push(error.message));
  await hostPage.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort(),
  );
  await hostPage.goto(origin + "/host");
  const runtimeElement = hostPage.locator("#artifact-preview");
  const runtimeFrame = await (
    await runtimeElement.elementHandle()
  ).contentFrame();
  const nestedPlayer = runtimeFrame.locator(playerSelector);
  const nestedElement = runtimeFrame.locator(`${playerSelector} iframe`);
  await expect(nestedElement).toBeVisible();
  const nestedFrame = await (
    await nestedElement.elementHandle()
  ).contentFrame();
  await nestedFrame.waitForFunction(() => window.__fixture?.ticks > 1);
  const nestedInitial = await nestedFrame.evaluate(() => ({
    ...window.__fixture,
  }));
  const originalStyles = await hostPage.evaluate(() => ({
    panel: document
      .getElementById("artifact-preview-panel")
      .getAttribute("style"),
    iframe: document.getElementById("artifact-preview").getAttribute("style"),
    toolbar: document
      .querySelector(".artifact-preview-toolbar")
      .getAttribute("style"),
    body: document.body.style.overflow,
  }));
  await hostPage.evaluate(() => {
    window.__hostWitness.loads = 0;
  });
  await runtimeFrame.evaluate((selector) => {
    const iframe = document.querySelector(`${selector} iframe`);
    window.__nestedWitness = {
      iframe,
      frameWindow: iframe.contentWindow,
      srcdoc: iframe.srcdoc,
      loads: 0,
    };
    iframe.addEventListener("load", () => window.__nestedWitness.loads++);
  }, playerSelector);
  await runtimeFrame
    .getByRole("button", { name: "沉浸演示", exact: true })
    .click();
  await expect
    .poll(() => hostPage.evaluate(() => window.__hostEvents.at(-1)))
    .toBe(true);
  const hostImmersiveBox = await runtimeElement.boundingBox();
  assert(
    Math.abs(hostImmersiveBox.width - 1436) < 1 &&
      Math.abs(hostImmersiveBox.height - 996) < 1,
    "Nested runtime must fill the host panel viewport (excluding its 2px border).",
  );
  await expect(hostPage.locator(".artifact-preview-toolbar")).toBeHidden();
  await hostPage.screenshot({
    path: path.join(evidence, "nested-host-immersive.png"),
    fullPage: true,
  });
  await hostPage.evaluate(() =>
    document
      .getElementById("artifact-preview")
      .contentWindow.postMessage(
        { __aiseceduCinematicPreview: true, action: "host-exit-immersive" },
        location.origin,
      ),
  );
  await expect(nestedPlayer).toHaveAttribute("data-immersive", "false");
  await expect
    .poll(() => hostPage.evaluate(() => window.__hostEvents.at(-1)))
    .toBe(false);
  await expect(hostPage.locator(".artifact-preview-toolbar")).toBeVisible();
  const restoredStyles = await hostPage.evaluate(() => ({
    panel: document
      .getElementById("artifact-preview-panel")
      .getAttribute("style"),
    iframe: document.getElementById("artifact-preview").getAttribute("style"),
    toolbar: document
      .querySelector(".artifact-preview-toolbar")
      .getAttribute("style"),
    body: document.body.style.overflow,
  }));
  assert.deepEqual(restoredStyles, originalStyles);
  await runtimeFrame
    .getByRole("button", { name: "沉浸演示", exact: true })
    .click();
  await expect
    .poll(() => hostPage.evaluate(() => window.__hostEvents.at(-1)))
    .toBe(true);
  await nestedFrame.locator("#fixture-pause").focus();
  await hostPage.keyboard.press("Escape");
  await expect(nestedPlayer).toHaveAttribute("data-immersive", "false");
  await expect
    .poll(() => hostPage.evaluate(() => window.__hostEvents.at(-1)))
    .toBe(false);
  const nestedWitness = await runtimeFrame.evaluate((selector) => {
    const frame = document.querySelector(`${selector} iframe`),
      w = window.__nestedWitness;
    return {
      sameElement: frame === w.iframe,
      sameWindow: frame.contentWindow === w.frameWindow,
      sameSrcDoc: frame.srcdoc === w.srcdoc,
      loads: w.loads,
    };
  }, playerSelector);
  assert.deepEqual(nestedWitness, {
    sameElement: true,
    sameWindow: true,
    sameSrcDoc: true,
    loads: 0,
  });
  const nestedFinal = await nestedFrame.evaluate(() => ({
    ...window.__fixture,
  }));
  assert.equal(nestedFinal.token, nestedInitial.token);
  assert.equal(nestedFinal.time, nestedInitial.time);
  await runtimeFrame
    .getByRole("button", { name: "沉浸演示", exact: true })
    .click();
  await expect
    .poll(() => hostPage.evaluate(() => window.__hostEvents.at(-1)))
    .toBe(true);
  await runtimeFrame.evaluate(() => window.__unmountPreview());
  await expect
    .poll(() => hostPage.evaluate(() => window.__hostEvents.at(-1)))
    .toBe(false);
  const hostWitness = await hostPage.evaluate(() => {
    const iframe = document.getElementById("artifact-preview"),
      w = window.__hostWitness;
    return {
      sameElement: w.iframe === iframe,
      sameWindow: w.frameWindow === iframe.contentWindow,
      sameSrc: w.src === iframe.getAttribute("src"),
      loads: w.loads,
    };
  });
  assert.deepEqual(hostWitness, {
    sameElement: true,
    sameWindow: true,
    sameSrc: true,
    loads: 0,
  });
  const hostEvents = await hostPage.evaluate(() => window.__hostEvents);
  assert.deepEqual(hostEvents, [true, false, true, false, true, false]);
  assert.deepEqual(hostErrors, []);
  report.scenarios.push({
    name: "nested-host-bridge",
    hostFunctions: outerBridgePath,
    hostImmersiveBox,
    hostWitness,
    nestedWitness,
    nestedInitial,
    nestedFinal,
    hostEvents,
    hostExitSynchronized: true,
    iframeEscapeSynchronized: true,
    activeUnmountRestoresHost: true,
    originalStylesRestored: true,
  });
  await hostPage.close();
  console.log(
    "PASS nested host: actual outer bridge functions expand/restore viewport; source-checked host exit, inner Escape and unmount; both iframe instances preserved",
  );
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.failure = error.stack || String(error);
  process.exitCode = 1;
  if (browser) {
    for (const [index, page] of browser
      .contexts()
      .flatMap((context) => context.pages())
      .entries()) {
      await page
        .screenshot({
          path: path.join(evidence, `failure-${index}.png`),
          fullPage: true,
        })
        .catch(() => {});
    }
  }
  console.error(report.failure);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  report.finishedAt = new Date().toISOString();
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`Report: ${reportPath}`);
}
