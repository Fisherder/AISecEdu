import { createHash } from "node:crypto";
import { inspectionContextLifecycle } from "./inspection-context.mjs";
import {findDecisionWitness} from './decision-witness.mjs';

const hash = (value) => createHash("sha256").update(value).digest("hex");
export class ProcessInteractionProofError extends Error {}

export function processPresentationEvidence() {
  const runtime = globalThis.__process;
  const issues = [], codePanels = [], addressedViews = [];
  for (const view of runtime.scene.views) {
    const panel = [...document.querySelectorAll("section[data-view]")]
      .find(node => node.dataset.view === view.id);
    if (!panel) continue;
    if (view.kind === "code") {
      const lines = String(runtime.evaluate(view.value)).split("\n");
      const rendered = [...panel.querySelectorAll(".code-line")];
      const active = runtime.markers ? runtime.markers(view.id).activeIndex : view.activeIndex === undefined ? -1 : runtime.evaluate(view.activeIndex);
      const activeIndex = Number.isInteger(active) && active >= 0 && active < lines.length ? active : -1;
      const rawMarked = runtime.markers ? runtime.markers(view.id).markedIndices : view.markedIndices === undefined ? [] : runtime.evaluate(view.markedIndices);
      const markedIndices = [...new Set(Array.isArray(rawMarked) ? rawMarked.filter(index =>
        Number.isInteger(index) && index >= 0 && index < lines.length) : [])].sort((a, b) => a - b);
      const observedActive = rendered.filter(node => node.classList.contains("active"))
        .map(node => Number(node.dataset.index));
      const observedMarked = rendered.filter(node => node.classList.contains("marked"))
        .map(node => Number(node.dataset.index));
      if (rendered.length !== lines.length || rendered.some((node, index) =>
        node.querySelector("code")?.textContent !== lines[index]))
        issues.push(view.id + "：可见代码行与当前代码内容不一致");
      if (JSON.stringify(observedActive) !== JSON.stringify(activeIndex < 0 ? [] : [activeIndex]) ||
          JSON.stringify(observedMarked) !== JSON.stringify(markedIndices))
        issues.push(view.id + "：代码行高亮与当前执行状态不一致");
      codePanels.push({id: view.id, lineCount: lines.length, activeIndex, markedIndices});
    }
    if (view.addressBase !== undefined) {
      const base = runtime.evaluate(view.addressBase), value = runtime.evaluate(view.value);
      const cells = [...panel.querySelectorAll(".cell")];
      if (cells.length !== value.length || cells.some((node, index) =>
        node.querySelector(".cell-index")?.textContent !== (base + index).toString(16).padStart(8, "0") ||
        node.querySelector("strong")?.textContent !== runtime.format(value[index], view.format)))
        issues.push(view.id + "：可见字节或示意地址与当前内存不一致");
      addressedViews.push({id: view.id, base, length: value.length});
    }
  }
  return {version: "code-evidence-v1", codePanels, addressedViews, issues};
}

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
}

async function frameEvidence(page, name) {
  await settle(page);
  const png = await page.screenshot({
    animations: "disabled",
    fullPage: false,
  });
  const measured = await page.evaluate(() => ({
    visibleViews: [
      ...document.querySelectorAll("[data-process] section[data-view]"),
    ].filter((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    }).length,
    activeStages: document.querySelectorAll(
      '#process-stages [aria-current="true"]',
    ).length,
    horizontalOverflow: Math.max(
      0,
      document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  }));
  return {
    name,
    width: page.viewportSize().width,
    screenshotSha256: hash(png),
    ...measured,
    presentation: await page.evaluate(processPresentationEvidence),
  };
}

export async function inspectProcess(browser, { data, signal = undefined }) {
  signal?.throwIfAborted();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1,
  });
  const lifecycle = inspectionContextLifecycle(context, {
    signal,
    timeoutMs: 90000,
  });
  const errors = [];
  const requests = [];
  try {
    await context.route("**/*", (route) => {
      requests.push(route.request().url());
      return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (error) => errors.push(error.message.slice(0, 1200)));
    page.on("console", (message) => {
      if (message.type() === "error")
        errors.push(message.text().slice(0, 1200));
    });
    await page.setContent(data.html, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(globalThis.__process));
    const initial = await frameEvidence(page, "initial");
    const initialState = await page.evaluate(() =>
      globalThis.__process.getState(),
    );
    const test = data.tests[0];
    await page.evaluate(
      (inputs) =>
        window.postMessage(
          { type: "SET_WIDGET_STATE", state: { inputs } },
          "*",
        ),
      test.inputs,
    );
    await page.waitForFunction((inputs) => {
      const actual = globalThis.__process.getState().inputs;
      return Object.entries(inputs).every(
        ([key, value]) => JSON.stringify(actual[key]) === JSON.stringify(value),
      );
    }, test.inputs);
    let actionSteps = 0;
    for (const operation of test.actions) {
      const selector = "#action-" + operation.id;
      if (operation.count === "untilDone") {
        for (let step = 0; step < 256; step += 1) {
          if (await page.locator(selector).isDisabled()) break;
          await page.locator(selector).click();
          actionSteps += 1;
        }
      } else {
        for (let step = 0; step < operation.count; step += 1) {
          await page.locator(selector).click();
          actionSteps += 1;
        }
      }
    }
    const final = await frameEvidence(page, "final");
    const finalState = await page.evaluate(() =>
      globalThis.__process.getState(),
    );
    let verification = true;
    if (data.scene.questions.length) {
      const question = data.scene.questions[0];
      const view = data.scene.views.find(
        (candidate) => candidate.id === question.evidenceView,
      );
      const answer = await page.evaluate(
        (candidate) =>
          globalThis.__process.format(
            globalThis.__process.evaluate(candidate.value),
            candidate.format,
          ),
        view,
      );
      await page.locator("#answer-" + question.id).fill(answer);
      await page.locator("#check-" + question.id).click();
      verification = await page
        .locator("#check-" + question.id)
        .evaluate(
          (button) => button.nextElementSibling?.dataset.correct === "true",
        );
    }
    const beforeUndo = await page.evaluate(
      () => globalThis.__process.getState().count,
    );
    if (beforeUndo > 0) await page.locator("#process-back").click();
    const afterUndo = await page.evaluate(
      () => globalThis.__process.getState().count,
    );
    await page.locator("#process-reset").click();
    const resetState = await page.evaluate(() =>
      globalThis.__process.getState(),
    );
    await page.setViewportSize({ width: 720, height: 960 });
    const mobile = await frameEvidence(page, "mobile");
    const controls = {
      domainAction: actionSteps > 0 && finalState.count > 0,
      visibleChange: initial.screenshotSha256 !== final.screenshotSha256,
      undo: beforeUndo === 0 || afterUndo === beforeUndo - 1,
      reset:
        resetState.count === 0 &&
        JSON.stringify(resetState.state) === JSON.stringify(initialState.state),
      verification,
      offline: requests.length === 0,
      responsive: mobile.horizontalOverflow <= 2,
    };
    const decisionEvidence = [];
    for (const decision of data.scene.decisions || []) {
      const scenario = await findDecisionWitness(page,data.scene,data.tests,decision.id);
      if (!scenario) throw new ProcessInteractionProofError('浏览器测试没有覆盖决策点：' + decision.id);
      await page.locator('#process-reset').click();
      await page.evaluate(inputs => window.postMessage({type:'SET_WIDGET_STATE',state:{inputs}},'*'),scenario.inputs);
      await page.waitForFunction(inputs => Object.entries(inputs).every(([key,value]) =>
        JSON.stringify(globalThis.__process.getState().inputs[key]) === JSON.stringify(value)),scenario.inputs);
      for (const action of scenario.path) await page.locator('#action-'+action).click();
      const before = await page.evaluate(() => globalThis.__process.getState());
      const pending = await page.evaluate(() => globalThis.__process.decisions().pending);
      if (pending.length !== 1 || pending[0].id !== decision.id || pending[0].available.length < 2)
        throw new ProcessInteractionProofError('实际界面未呈现同情境的多个选择：' + decision.id);
      const alternatives = [];
      for (const choice of pending[0].available) {
        await page.locator('#action-' + choice).click();
        const current = await page.evaluate(() => globalThis.__process.decisions().current);
        alternatives.push({action:choice,values:current.values,screenshotSha256:hash(await page.screenshot({animations:'disabled'}))});
        await page.locator('#process-reconsider').click();
        const restored = await page.evaluate(() => globalThis.__process.getState());
        if (JSON.stringify(restored) !== JSON.stringify(before)) throw new ProcessInteractionProofError('返回决策点没有恢复相同的完整情境：' + decision.id);
      }
      const uniqueResults = new Set(alternatives.map(item => JSON.stringify(item.values))).size;
      const comparisonRows = await page.locator('.decision-results .result-different').count();
      if (uniqueResults < 2 || !comparisonRows) throw new ProcessInteractionProofError('实际决策界面没有不同结果或没有呈现比较：' + decision.id);
      decisionEvidence.push({id:decision.id,alternatives,comparisonRows,sameCheckpoint:true});
    }
    controls.decisions = !data.scene.decisions?.length || decisionEvidence.length === data.scene.decisions.length;
    const objectEvidence = [];
    for (const view of data.scene.views.filter(view => view.pick)) {
      await page.locator('#process-reset').click();
      // Reach a usable object-operation checkpoint using an actual authored
      // test, then exercise the DOM object rather than its sidebar control.
      if (view.pick.action && await page.locator('#action-' + view.pick.action).isDisabled()) {
        const scenario = data.tests.find(test => test.actions.some(step => step.id === view.pick.action));
        if (!scenario) throw new ProcessInteractionProofError('对象操作没有可达测试路径：' + view.id);
        await page.evaluate(inputs => window.postMessage({type:'SET_WIDGET_STATE',state:{inputs}},'*'),scenario.inputs);
        await page.waitForFunction(inputs => Object.entries(inputs).every(([id,value]) =>
          JSON.stringify(globalThis.__process.getState().inputs[id]) === JSON.stringify(value)),scenario.inputs);
        for (const step of scenario.actions) {
          if (step.id === view.pick.action) break;
          for (let n=0;n<(step.count==='untilDone'?256:step.count);n++) {
            const button=page.locator('#action-'+step.id);
            if(step.count==='untilDone'&&await button.isDisabled())break;
            await button.click();
          }
        }
      }
      const input=data.scene.inputs.find(input=>input.id===view.pick.input);
      const before=await page.evaluate(()=>globalThis.__process.getState());
      const elements=page.locator('[data-view="'+view.id+'"] [data-pick-index]');
      const count=await elements.count();
      const fixedIdentity=count===1&&input.type==='select'&&input.options.length===1&&!view.pick.action;
      const selected=Array.from({length:count},(_,index)=>index).find(index=>
        JSON.stringify(input.type==='select'?input.options[index]?.value:Number(input.min??0)+index*Number(input.step??1))!==JSON.stringify(before.inputs[input.id]))??(fixedIdentity?0:undefined);
      if(selected===undefined)throw new ProcessInteractionProofError('对象视图没有另一个可操作对象：'+view.id);
      const expected=input.type==='select'?input.options[selected].value:Number(input.min??0)+selected*Number(input.step??1);
      const selector='[data-view="'+view.id+'"] [data-pick-index="'+selected+'"]';
      let after;
      for(const method of ['click','keyboard']) {
        const target=page.locator(selector);
        if(method==='click')await target.click();else{await target.focus();await target.press('Enter');}
        after=await page.evaluate(()=>globalThis.__process.getState());
        if(JSON.stringify(after.inputs[input.id])!==JSON.stringify(expected)||
            view.pick.action&&after.count!==before.count+1)throw new ProcessInteractionProofError('对象'+method+'未驱动真实选择/领域操作：'+view.id);
        const undoSteps=after.history.length-before.history.length;
        if(undoSteps<1&&!fixedIdentity)throw new ProcessInteractionProofError('对象操作没有可撤销的实验变化：'+view.id);
        for(let n=0;n<undoSteps;n++)await page.locator('#process-back').click();
        if(JSON.stringify(await page.evaluate(()=>globalThis.__process.getState()))!==JSON.stringify(before))throw new ProcessInteractionProofError('对象操作撤销没有恢复完整状态：'+view.id);
      }
      objectEvidence.push({view:view.id,input:input.id,index:selected,value:expected,action:view.pick.action,
        stateChanges:Object.fromEntries(Object.entries(after.state).filter(([id,value])=>JSON.stringify(before.state[id])!==JSON.stringify(value))),
        click:true,keyboard:true,undo:after.history.length>before.history.length,
        fixedIdentity,selectionChanged:JSON.stringify(before.inputs[input.id])!==JSON.stringify(expected)});
    }
    controls.objectPick = objectEvidence.length === data.scene.views.filter(view=>view.pick).length;
    controls.liveInput = true;
    for (const input of data.scene.inputs.filter(input => input.mode === 'live')) {
      const before = await page.evaluate(() => globalThis.__process.getState());
      const value = input.type === 'toggle' ? !before.inputs[input.id] : input.type === 'select'
        ? input.options.find(option => JSON.stringify(option.value) !== JSON.stringify(before.inputs[input.id]))?.value
        : ['range','number'].includes(input.type)
          ? before.inputs[input.id] === input.min ? input.max : input.min : before.inputs[input.id] === '' ? 'A' : '';
      // A single identity is displayed as fixed text, not an adjustable input.
      // It cannot be varied to an invented second value during inspection.
      if(input.type==='select'&&input.options.length===1)continue;
      await page.evaluate(({id,value}) => window.postMessage({type:'SET_WIDGET_STATE',state:{inputs:{[id]:value}}},'*'),{id:input.id,value});
      await page.waitForFunction(({id,value}) => JSON.stringify(globalThis.__process.getState().inputs[id]) === JSON.stringify(value),{id:input.id,value});
      const adjusted = await page.evaluate(() => globalThis.__process.getState());
      if (JSON.stringify(adjusted.state) !== JSON.stringify(before.state) || adjusted.count !== before.count) controls.liveInput = false;
      await page.locator('#process-back').click();
      if (JSON.stringify(await page.evaluate(() => globalThis.__process.getState())) !== JSON.stringify(before)) controls.liveInput = false;
    }
    const issues = [];
    if (!controls.liveInput) issues.push({code:'live-input',message:'实时调整或撤销未保留完整实验状态'});
    for (const frame of [initial, final, mobile])
      for (const message of frame.presentation.issues)
        issues.push({code: "presentation-state", message: frame.name + "：" + message});
    for (const message of [...new Set(errors)])
      issues.push({ code: "runtime", message });
    if (requests.length)
      issues.push({
        code: "network-request",
        message:
          "成品运行时尝试访问外部资源：" + requests.slice(0, 5).join("；"),
      });
    if (initial.visibleViews < 4 || final.visibleViews < 4)
      issues.push({
        code: "missing-views",
        message: "实际浏览器中可见证据视图少于4个",
      });
    if (initial.activeStages !== 1 || final.activeStages !== 1)
      issues.push({
        code: "stage-state",
        message: "实际浏览器中每个状态必须恰有一个活动阶段",
      });
    if (!controls.domainAction)
      issues.push({
        code: "domain-action",
        message: "真实领域操作未能在浏览器中执行",
      });
    if (!controls.visibleChange)
      issues.push({
        code: "no-visible-change",
        message: "执行前后的实际像素完全相同",
      });
    if (!controls.undo)
      issues.push({ code: "undo", message: "撤销没有恢复一个完整步骤" });
    if (!controls.reset)
      issues.push({ code: "reset", message: "重置没有恢复完整初态" });
    if (!controls.verification)
      issues.push({
        code: "verification",
        message: "根据当前可见证据填写答案仍未通过核对",
      });
    if (!controls.responsive)
      issues.push({
        code: "responsive-overflow",
        message: "720px视口出现横向溢出",
      });
    lifecycle.throwIfStopped();
    return {
      issues,
      evidence: {
        mode: "headless-chromium-process-dom-and-pixels",
        sourceSha256: hash(data.html),
        inspectedAt: new Date().toISOString(),
        frames: [initial, final, mobile],
        controls,
        decisions: decisionEvidence,
        objects: objectEvidence,
      },
    };
  } catch (error) {
    lifecycle.throwIfStopped();
    throw error;
  } finally {
    await lifecycle.dispose();
  }
}
