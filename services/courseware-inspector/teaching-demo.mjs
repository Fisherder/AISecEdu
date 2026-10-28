import {createHash} from 'node:crypto';
import {inspectionContextLifecycle} from './inspection-context.mjs';
import {teachingDemoCases, teachingDemoExpected} from './teaching-demo-oracles.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => JSON.stringify(a, Object.keys(a ?? {}).sort()) === JSON.stringify(b, Object.keys(b ?? {}).sort());
const visibleText = node => node.evaluate(element => (element instanceof HTMLElement ? element.innerText : element.textContent)?.trim() || '');

export async function inspectTeachingDemo(browser, {data, signal}) {
  const cases = teachingDemoCases(data.profile);
  const context = await browser.newContext({viewport: {width: 1365, height: 4000}, deviceScaleFactor: 1, serviceWorkers: 'block'});
  const lifecycle = inspectionContextLifecycle(context, {signal, timeoutMs: 90000});
  const issues = [], requests = [], errors = [], frames = [];
  const controls = {forward: false, backward: false, reset: false, parameterChange: false, experiment: false, quiz: false, responsive: false, offline: false};
  let oracleCases = 0;
  try {
    await context.route('**/*', route => {requests.push(route.request().url()); return route.abort();});
    const page = await context.newPage();
    page.setDefaultTimeout(3500);
    page.on('pageerror', error => errors.push(error.message.slice(0, 1000)));
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
    const secured = data.html.replace(/<head\b[^>]*>/i, tag => tag + csp);
    const encoded = secured.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    await page.setContent(`<style>html,body{margin:0;overflow:hidden}iframe{position:fixed;inset:0;border:0;width:100vw;height:100vh;display:block}</style><iframe sandbox="allow-scripts" srcdoc="${encoded}"></iframe>`);
    const frame = await (await page.locator('iframe').elementHandle()).contentFrame();
    const button = action => frame.locator(`[data-demo-action="${action}"]`).filter({visible: true}).first();
    const capture = async name => {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      frames.push({name, width: page.viewportSize().width, screenshotSha256: hash(await page.screenshot({animations: 'disabled'}))});
    };
    const action = async (method, argument) => {
      lifecycle.throwIfStopped();
      return frame.evaluate(async ({method, argument}) => {
        const api = globalThis.aiseceduDemo;
        if (api?.version !== 'teaching-demo-v1' || typeof api[method] !== 'function') throw Error('缺少教学运行接口：' + method);
        await api[method](argument);
        const snapshot = api.snapshot();
        if (!snapshot || !Number.isInteger(snapshot.step) || !Number.isInteger(snapshot.stepCount) ||
            snapshot.stepCount < 3 || snapshot.stepCount > 8 || snapshot.step < 0 || snapshot.step >= snapshot.stepCount ||
            !snapshot.inputs || !snapshot.outputs || typeof snapshot.playing !== 'boolean') throw Error('教学快照无效');
        return snapshot;
      }, {method, argument});
    };
    const checkOutputs = async (snapshot, inputs) => {
      const expected = teachingDemoExpected(data.profile, inputs);
      const checkMath = value => {
        if (!same(value.inputs, inputs)) throw Error('实际输入与测试输入不一致');
        for (const [key, expectedValue] of Object.entries(expected))
          if (value.outputs[key] !== expectedValue) throw Error(`独立算法检查失败：${key}实际${value.outputs[key]}，应为${expectedValue}`);
      };
      checkMath(snapshot);
      try {
        checkMath(await action('step', snapshot.stepCount - 1 - snapshot.step));
        for (const [key, value] of Object.entries(expected)) {
          const visible = frame.locator(`[data-demo-value="${key}"]`).filter({visible: true});
          if (!await visible.count()) throw Error(`末步缺少可见结果：${key}`);
          for (const node of await visible.all())
            if (await visibleText(node) !== value) throw Error(`末步舞台可见结果与真实计算不一致：${key}`);
        }
      } finally {
        const current = await action('snapshot');
        if (current.step !== snapshot.step) await action('step', snapshot.step - current.step);
      }
    };
    const attempt = async (label, operation) => {
      try { await operation(); }
      catch (error) { lifecycle.throwIfStopped(); issues.push(label + '：' + error.message.slice(0, 1500)); }
    };
    await attempt('初始化', async () => {
      await frame.waitForFunction(() => !!globalThis.aiseceduDemo);
      const snapshot = await action('snapshot');
      await checkOutputs(snapshot, cases.valid[0]);
      for (const role of ['workflow', 'visualization', 'controls', 'experiment', 'quiz', 'summary'])
        if (!await frame.locator(`[data-demo="${role}"]`).isVisible()) throw Error('区域不可见：' + role);
      const diagram = frame.locator('[data-demo="visualization"]').locator('svg,canvas,[data-demo-diagram]').filter({visible: true}).first();
      if (!await diagram.count()) throw Error('渲染后的主舞台缺少可见专用主图');
      const size = await diagram.boundingBox();
      if (!size || size.width < 24 || size.height < 24) throw Error('专用主图尺寸不足以观察');
    });
    for (const inputs of cases.valid) await attempt('算法', async () => {
      const snapshot = await action('setInputs', inputs);
      await checkOutputs(snapshot, inputs);
      oracleCases++;
    });
    for (const inputs of cases.invalid) await attempt('无效参数', async () => {
      const before = await action('snapshot');
      const rejected = await frame.evaluate(async inputs => {try {await globalThis.aiseceduDemo.setInputs(inputs); return false;} catch {return true;}}, inputs);
      const after = await action('snapshot');
      if (!rejected || !same(before.inputs, after.inputs) || !same(before.outputs, after.outputs)) throw Error('无效输入未拒绝或覆盖了有效结果');
    });
    await attempt('步骤', async () => {
      await action('reset');
      await button('next').click();
      const advanced = await action('snapshot');
      if (advanced.step !== 1) throw Error(`下一步应只触发一次，从0到1，实际到${advanced.step}；检查按钮监听与document事件委托是否重复处理点击`);
      controls.forward = true;
      await button('previous').click();
      if ((await action('snapshot')).step !== 0) throw Error('上一步未恢复同一状态');
      controls.backward = true;
      const snapshot = await action('snapshot');
      await action('step', snapshot.stepCount + 1);
      const last = await action('snapshot');
      if (last.step !== snapshot.stepCount - 1 || !await button('next').isDisabled()) throw Error('末步未停止或未禁用越界');
      await action('reset');
    });
    await attempt('对照实验', async () => {
      await action('setInputs', cases.valid[0]);
      await button('experiment').click();
      const snapshot = await action('snapshot'), experiment = snapshot.experiment;
      if (!experiment || !same(experiment.inputs, snapshot.inputs)) throw Error('实验基准输入不属于当前输入');
      const changed = Object.keys(snapshot.inputs).filter(key => experiment.variantInputs[key] !== snapshot.inputs[key]);
      if (changed.length !== 1) throw Error('变式必须只改变一个输入');
      const baseline = teachingDemoExpected(data.profile, snapshot.inputs);
      const variant = teachingDemoExpected(data.profile, experiment.variantInputs);
      for (const [kind, values] of [['baseline', baseline], ['variant', variant]])
        for (const [key, value] of Object.entries(values)) {
          const node = frame.locator(`[data-demo-${kind}="${key}"]`).filter({visible: true}).first();
          const changed = baseline[key] !== variant[key];
          if ((changed || key in experiment[kind]) && experiment[kind][key] !== value)
            throw Error(`实验快照${kind}.${key}应为${value}，实际${experiment[kind][key]}`);
          if (!await node.count()) {
            if (changed) throw Error(`对照实验缺少可见元素[data-demo-${kind}="${key}"]，应单独显示${value}`);
          } else if (await visibleText(node) !== value) throw Error(`实验${kind}.${key}显示值与真实值${value}不一致`);
        }
      if (same(baseline, variant)) throw Error('对照实验没有产生可观察的结果变化');
      controls.experiment = true;
      const inputs = cases.valid.find(value => Object.keys(snapshot.inputs).filter(key => value[key] !== snapshot.inputs[key]).length === 1) || cases.valid[1];
      for (const [key, value] of Object.entries(inputs).filter(([key, value]) => value !== snapshot.inputs[key])) await frame.locator(`[data-demo-input="${key}"]`).filter({visible: true}).first().fill(value);
      await button('apply').click();
      const after = await action('snapshot');
      const result = frame.locator('[data-demo-experiment-result]').filter({visible: true});
      if (after.experiment !== null || after.playing || after.step !== 0 ||
          await result.count() && (await result.innerText()).trim()) throw Error('参数变化未停止播放并清除旧实验结果');
      await checkOutputs(after, inputs);
      controls.parameterChange = true;
    });
    await attempt('练习', async () => {
      await button('experiment').click();
      const questions = frame.locator('fieldset[data-demo-question]');
      if (await questions.count() < 2) throw Error('独立练习不足两道');
      for (const question of await questions.all()) {
        const choices = question.locator('input[type="radio"]'), check = question.locator('[data-demo-action="check-answer"]');
        if (await choices.count() < 2 || await choices.count() > 6) throw Error('每题须有2至6个选项');
        const feedback = new Set();
        for (const choice of await choices.all()) {
          await choice.scrollIntoViewIfNeeded();
          await choice.check(); await check.click();
          const text = (await question.locator('[aria-live]').innerText()).trim();
          if (!text) throw Error('答案没有反馈');
          feedback.add(text);
        }
        if (feedback.size < 2) throw Error(`题目“${await question.locator('legend').innerText()}”的所有答案得到相同反馈“${[...feedback][0]}”。题干指定参数时应按题干计算；动态题需同时更新选项与正确答案`);
      }
      controls.quiz = true;
    });
    await attempt('重置', async () => {
      await action('step', -(await action('snapshot')).step);
      await button('play').click();
      if (!(await action('snapshot')).playing) throw Error('播放按钮没有启动同一状态的播放计时器');
      await button('reset').click();
      const snapshot = await action('snapshot');
      const result = frame.locator('[data-demo-experiment-result]').filter({visible: true});
      if (snapshot.step !== 0) throw Error('重置后step必须为0');
      if (snapshot.playing) throw Error('重置后必须停止播放和计时器');
      if (snapshot.experiment !== null) throw Error('重置后experiment必须为null');
      const selected = await frame.locator('fieldset input:checked').evaluateAll(nodes => nodes.map(node => `${node.name}=${node.value}`));
      if (selected.length) throw Error('重置后仍选中了练习或实验预测选项：' + selected.join(',') + '；清除所有radio选择与反馈');
      if (await result.count() && (await result.innerText()).trim()) throw Error('重置后仍显示旧实验DOM结果，需清空或隐藏[data-demo-experiment-result]');
      await checkOutputs(snapshot, cases.valid[0]);
      controls.reset = true;
    });
    await page.setViewportSize({width: 1365, height: 900});
    await frame.evaluate(() => scrollTo(0, 0));
    await capture('desktop');
    await page.setViewportSize({width: 390, height: 844});
    await frame.evaluate(() => scrollTo(0, 0));
    await attempt('响应式', async () => {
      const measurement = await frame.evaluate(() => ({overflow: document.documentElement.scrollWidth - innerWidth,
        top: document.querySelector('[data-demo="visualization"]')?.getBoundingClientRect().top,
        height: document.querySelector('[data-demo="visualization"]')?.getBoundingClientRect().height}));
      if (measurement.overflow > 4 || measurement.top > 480 || measurement.height < 120) throw Error('手机舞台溢出、过小或被长介绍挤出首屏');
      controls.responsive = true;
    });
    await capture('mobile');
    controls.offline = requests.length === 0;
    if (requests.length) issues.push('生成页面尝试访问网络');
    issues.push(...errors.map(error => '浏览器脚本错误：' + error));
    return {issues: [...new Set(issues)].slice(0, 80), evidence: {version: 'teaching-demo-browser-v1',
      profile: data.profile, sourceSha256: hash(data.html), oracleCases, controls, frames}};
  } finally { await lifecycle.dispose(); }
}
