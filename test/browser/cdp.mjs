import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync, symlinkSync, existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const CHROME = process.env.CHROME_BIN || '/usr/bin/chromium-browser';

export class CdpError extends Error {}

function once(emitter, event) {
  return new Promise(resolve => emitter.once(event, resolve));
}

class Connection {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.sessionListeners = new Map();
  }

  async open() {
    this.ws = new WebSocket(this.url);
    this.ws.addEventListener('message', event => this.#dispatch(JSON.parse(event.data)));
    this.ws.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new CdpError('浏览器连接已关闭。'));
      this.pending.clear();
    });
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', () => reject(new CdpError(`无法连接浏览器调试端口 ${this.url}`)), { once: true });
    });
    return this;
  }

  #dispatch(message) {
    if (message.id !== undefined && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new CdpError(`${message.error.message} (${JSON.stringify(message.error.data ?? '')})`));
      else resolve(message.result);
      return;
    }
    if (message.method) {
      const key = `${message.sessionId ?? ''}:${message.method}`;
      for (const listener of this.listeners.get(key) ?? []) listener(message.params ?? {});
      for (const listener of this.listeners.get(`*:${message.method}`) ?? []) listener(message.params ?? {}, message.sessionId);
    }
  }

  send(method, params = {}, sessionId, { timeout = 30000 } = {}) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CdpError(`CDP ${method} 超过 ${timeout}ms 未响应`));
      }, timeout);
      this.pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
      this.ws.send(JSON.stringify(payload));
    });
  }

  on(method, listener, sessionId = '') {
    const key = `${sessionId}:${method}`;
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key).add(listener);
    return () => this.listeners.get(key)?.delete(listener);
  }

  waitFor(method, sessionId = '', timeout = 30000) {
    return new Promise((resolve, reject) => {
      const off = this.on(method, params => { off(); clearTimeout(timer); resolve(params); }, sessionId);
      const timer = setTimeout(() => { off(); reject(new CdpError(`等待 ${method} 超时`)); }, timeout);
    });
  }

  close() { try { this.ws.close(); } catch { /* already closed */ } }
}

export class Browser {
  constructor(connection, process) {
    this.connection = connection;
    this.process = process;
  }

  static async launch({ port = 9222, profileDir, headless = true, extraArgs = [] } = {}) {
    mkdirSync(`${profileDir}/profile`, { recursive: true });
    mkdirSync(`${profileDir}/crash`, { recursive: true });
    // Chrome puts its process-singleton socket under TMPDIR; Unix socket paths
    // are capped at 108 bytes, so TMPDIR must stay short regardless of how deep
    // the profile directory is.
    // The host may ship no CJK font, which renders Chinese pages as blank boxes
    // in screenshots. Link any font drop-in into the browser HOME so fontconfig
    // picks it up.
    const fontSource = process.env.CHROME_FONTS || '/srv/aisecedu-dojo/.cache/fonts';
    try {
      if (existsSync(fontSource)) {
        mkdirSync(`${profileDir}/.fonts`, { recursive: true });
        for (const file of readdirSync(fontSource)) {
          const link = `${profileDir}/.fonts/${file}`;
          if (!existsSync(link)) symlinkSync(`${fontSource}/${file}`, link);
        }
      }
    } catch { /* fonts are optional */ }
    const shortTmp = process.env.CHROME_TMPDIR || `/tmp/cdp-${process.pid.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    mkdirSync(shortTmp, { recursive: true });
    this.tmpDir = shortTmp;
    const args = [
      headless ? '--headless=new' : '--window-size=1440,1000',
      '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-crash-reporter',
      '--no-first-run', '--no-default-browser-check', '--disable-features=Translate,AcceptCHFrame',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      `--crash-dumps-dir=${profileDir}/crash`,
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}/profile`,
      ...extraArgs,
      'about:blank',
    ];
    const child = spawn(CHROME, args, {
      env: { ...process.env, HOME: profileDir, TMPDIR: shortTmp },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    writeFileSync(`${profileDir}/chrome.pid`, String(child.pid));

    const deadline = Date.now() + 30000;
    let version = null;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (response.ok) { version = await response.json(); break; }
      } catch { /* not up yet */ }
      if (child.exitCode !== null) throw new CdpError(`浏览器启动失败（退出码 ${child.exitCode}）：${stderr.slice(0, 1200)}`);
      await delay(250);
    }
    if (!version) { child.kill('SIGKILL'); throw new CdpError(`浏览器调试端口未就绪：${stderr.slice(0, 1200)}`); }
    const connection = await new Connection(version.webSocketDebuggerUrl).open();
    return new Browser(connection, child);
  }

  async newContext() {
    const { browserContextId } = await this.connection.send('Target.createBrowserContext');
    this.contexts ??= new Set();
    this.contexts.add(browserContextId);
    return browserContextId;
  }

  async disposeContext(browserContextId) {
    this.contexts?.delete(browserContextId);
    await this.connection.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
    return this;
  }

  async newPage({ width = 1440, height = 1000, contextId } = {}) {
    const target = { url: 'about:blank' };
    if (contextId) target.browserContextId = contextId;
    const { targetId } = await this.connection.send('Target.createTarget', target);
    this.knownTargets ??= new Set();
    this.ownedTargets ??= new Set();
    this.knownTargets.add(targetId);
    this.ownedTargets.add(targetId);
    this.pendingPages = (this.pendingPages ?? []).filter(info => info.targetId !== targetId);
    const { sessionId } = await this.connection.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(this.connection, sessionId, targetId, { width, height });
    await page.init();
    return page;
  }

  async watchTargets() {
    this.knownTargets = new Set();
    const { targetInfos } = await this.connection.send('Target.getTargets');
    for (const info of targetInfos) this.knownTargets.add(info.targetId);
    await this.connection.send('Target.setDiscoverTargets', { discover: true });
    this.connection.on('Target.targetCreated', params => {
      if (params.targetInfo.type !== 'page') return;
      if (!this.knownTargets.has(params.targetInfo.targetId)) {
        this.knownTargets.add(params.targetInfo.targetId);
        this.pendingPages ??= [];
        this.pendingPages.push(params.targetInfo);
      }
    });
    return this;
  }

  async waitForNewPage({ timeout = 20000, viewport = { width: 1440, height: 1000 } } = {}) {
    const deadline = Date.now() + timeout;
    this.pendingPages ??= [];
    while (Date.now() < deadline) {
      while (this.pendingPages.length) {
        const info = this.pendingPages.shift();
        if (this.ownedTargets?.has(info.targetId)) continue;
        const { sessionId } = await this.connection.send('Target.attachToTarget', { targetId: info.targetId, flatten: true });
        const page = new Page(this.connection, sessionId, info.targetId, viewport);
        await page.init();
        await page.waitForReady(timeout).catch(() => {});
        return page;
      }
      await delay(150);
    }
    throw new CdpError('没有等到新打开的标签页。');
  }

  async closePage(page) {
    await this.connection.send('Target.closeTarget', { targetId: page.targetId }).catch(() => {});
    return this;
  }

  async close() {
    this.connection.close();
    try { this.process?.kill('SIGKILL'); } catch { /* already gone */ }
  }
}

export class Page {
  constructor(connection, sessionId, targetId, viewport) {
    this.connection = connection;
    this.sessionId = sessionId;
    this.targetId = targetId;
    this.viewport = viewport;
    this.consoleLogs = [];
    this.pageErrors = [];
    this.failedRequests = [];
    this.dialogs = [];
  }

  send(method, params = {}) { return this.connection.send(method, params, this.sessionId); }

  async init() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Log.enable');
    await this.send('Network.enable');
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: this.viewport.width, height: this.viewport.height, deviceScaleFactor: 1, mobile: false,
    });
    this.connection.on('Runtime.consoleAPICalled', params => {
      this.consoleLogs.push({ type: params.type, text: params.args.map(a => a.value ?? a.description ?? a.type).join(' ') });
    }, this.sessionId);
    this.connection.on('Runtime.exceptionThrown', params => {
      const detail = params.exceptionDetails;
      this.pageErrors.push(detail.exception?.description || detail.text);
    }, this.sessionId);
    this.connection.on('Log.entryAdded', params => {
      if (params.entry.level === 'error') this.consoleLogs.push({ type: 'log-error', text: params.entry.text });
    }, this.sessionId);
    this.connection.on('Network.loadingFailed', params => {
      if (!params.canceled) this.failedRequests.push({ url: params.requestId, error: params.errorText });
    }, this.sessionId);
    this.connection.on('Page.javascriptDialogOpening', async params => {
      this.dialogs.push(params.message);
      await this.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    }, this.sessionId);
  }

  async goto(url, { waitUntil = 'load', timeout = 45000 } = {}) {
    const loaded = waitUntil === 'none' ? Promise.resolve() : this.connection.waitFor('Page.loadEventFired', this.sessionId, timeout);
    const result = await this.send('Page.navigate', { url }).catch(error => ({ errorText: error.message }));
    if (result.errorText) throw new CdpError(`导航失败 ${url}：${result.errorText}`);
    await loaded;
    await this.waitForReady(timeout);
    return this;
  }

  async waitForReady(timeout = 30000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const state = await this.evaluate('document.readyState').catch(() => null);
      if (state === 'complete' || state === 'interactive') {
        await this.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))').catch(() => {});
        return this;
      }
      await delay(100);
    }
    throw new CdpError('页面未进入可交互状态。');
  }

  async url() { return await this.evaluate('location.href'); }

  async title() { return await this.evaluate('document.title'); }

  async evaluate(expression, { awaitPromise = true } = {}) {
    const result = await this.send('Runtime.evaluate', {
      expression: typeof expression === 'string' ? expression : `(${expression})()`,
      awaitPromise, returnByValue: true, userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new CdpError(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result.value;
  }

  async waitFor(expression, { timeout = 30000, message } = {}) {
    const deadline = Date.now() + timeout;
    let last;
    while (Date.now() < deadline) {
      try {
        last = await this.evaluate(expression);
        if (last) return last;
      } catch (error) { last = error.message; }
      await delay(150);
    }
    throw new CdpError(`${message || `等待条件超时：${expression}`}（最后结果：${JSON.stringify(last)}）`);
  }

  async text(selector) {
    return await this.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? el.innerText : null; })()`);
  }

  async exists(selector) { return await this.evaluate(`!!document.querySelector(${JSON.stringify(selector)})`); }

  async count(selector) { return await this.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`); }

  async rect(selector, { nth = 0 } = {}) {
    return await this.evaluate(`(() => {
      const els = document.querySelectorAll(${JSON.stringify(selector)});
      const el = els[${nth}];
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height, visible: r.width > 0 && r.height > 0 };
    })()`);
  }

  async click(selector, { nth = 0, timeout = 20000, label, force = false } = {}) {
    const deadline = Date.now() + timeout;
    let box = null;
    while (Date.now() < deadline) {
      box = await this.rect(selector, { nth });
      if (box?.visible) break;
      await delay(150);
    }
    if (!box?.visible) {
      if (force) {
        const clicked = await this.evaluate(`(() => {
          const el = document.querySelectorAll(${JSON.stringify(selector)})[${nth}];
          if (!el) return false;
          el.click();
          return true;
        })()`).catch(() => false);
        if (clicked) return this;
      }
      const state = await this.evaluate(`({
        url: location.href,
        matches: document.querySelectorAll(${JSON.stringify(selector)}).length,
        body: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 240),
      })`).catch(error => ({ error: error.message }));
      throw new CdpError(`找不到可点击的元素：${label || selector}｜页面状态 ${JSON.stringify(state)}`);
    }
    const hit = await this.evaluate(`(() => {
      const el = document.querySelectorAll(${JSON.stringify(selector)})[${nth}];
      const top = document.elementFromPoint(${box.x}, ${box.y});
      return { same: Boolean(top && (top === el || el.contains(top) || top.contains(el))),
               top: top ? top.tagName + (top.id ? '#' + top.id : '') + '.' + (top.className || '').toString().split(' ')[0] : null };
    })()`);
    if (!hit.same) {
      if (force) {
        await this.evaluate(`document.querySelectorAll(${JSON.stringify(selector)})[${nth}].click()`);
        return this;
      }
      throw new CdpError(`元素被遮挡无法真实点击：${label || selector}｜命中 ${JSON.stringify(hit)}`);
    }
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, button: 'none' });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    return this;
  }

  async clickText(selector, text, options = {}) {
    const index = await this.evaluate(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
      return els.findIndex(el => (el.innerText || el.textContent || '').trim().includes(${JSON.stringify(text)}));
    })()`);
    if (index < 0) throw new CdpError(`找不到包含文本「${text}」的 ${selector}`);
    return await this.click(selector, { ...options, nth: index });
  }

  async fill(selector, value, { nth = 0 } = {}) {
    await this.click(selector, { nth });
    await this.evaluate(`(() => {
      const el = document.querySelectorAll(${JSON.stringify(selector)})[${nth}];
      el.focus(); el.select?.();
    })()`);
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 65, modifiers: 2, key: 'a', code: 'KeyA' });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 65, modifiers: 2, key: 'a', code: 'KeyA' });
    await this.send('Input.insertText', { text: String(value) });
    await this.evaluate(`(() => {
      const el = document.querySelectorAll(${JSON.stringify(selector)})[${nth}];
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    return this;
  }

  async check(selector, { nth = 0, force = true } = {}) {
    const checked = await this.evaluate(`document.querySelectorAll(${JSON.stringify(selector)})[${nth}]?.checked`);
    if (!checked) await this.click(selector, { nth, force });
    return this;
  }

  async selectOption(selector, value) {
    await this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    return this;
  }

  async press(key, { keyCode, code } = {}) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, windowsVirtualKeyCode: keyCode, code });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: keyCode, code });
    return this;
  }

  async screenshot(path) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(path, Buffer.from(data, 'base64'));
    return path;
  }

  async cookies() {
    const { cookies } = await this.send('Network.getCookies', {});
    return cookies;
  }

  async clearCookies() {
    await this.send('Network.clearBrowserCookies');
    return this;
  }

  async setCookie(cookie) {
    await this.send('Network.setCookie', cookie);
    return this;
  }

  async acceptDialog() { await this.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); }

  errors() { return this.pageErrors.slice(); }

  fatalConsole() {
    return this.consoleLogs.filter(entry => entry.type === 'error' || entry.type === 'log-error');
  }
}
