(() => {
  const array = value => Array.isArray(value) ? value : [];
  const bytes = value => Array.isArray(value) && value.length === 8 && value.every(n => Number.isInteger(n) && n >= 0 && n <= 255) ? value.slice() : null;
  const fromHex = value => typeof value === 'string' && /^(?:[a-f\d]{2}\s+){7}[a-f\d]{2}$/i.test(value.trim()) ? value.trim().split(/\s+/).map(n => parseInt(n, 16)) : null;
  const basename = value => String(value || '').replace(/\\/g, '/').split('/').at(-1);
  function normalizeTrace(source, result) {
    const trace = result?.trace;
    if (!source || typeof source.text !== 'string' || !source.text || source.text.length > 200000 || !trace) return null;
    if (result.sourceMatchesChecks === false) return null;
    if (source.sha256 && result.sourceSha256 && source.sha256 !== result.sourceSha256) return null;
    const lines = source.text.replace(/\r\n/g, '\n').split('\n');
    const input = array(trace.events);
    if (!input.length || input.length > 3000 || !['complete', 'truncated', 'timeout', 'error'].includes(trace.status)) return null;
    const events = [];
    for (const entry of input) {
      const before = bytes(entry?.beforeBytes), after = bytes(entry?.afterBytes);
      if (!before || !after || !Number.isInteger(entry.line) || entry.line < 1 || entry.line > lines.length || basename(entry.file) !== basename(source.file)) return null;
      if (!['completed', 'interrupted'].includes(entry.status || 'completed')) return null;
      const locals = Object.fromEntries(Object.entries(entry.afterLocals || {}).filter(([key, value]) => /^[A-Za-z_]\w{0,39}$/.test(key) && (Number.isSafeInteger(value) || typeof value === 'string' && /^-?\d{1,40}$/.test(value))));
      events.push({...entry, beforeBytes: before, afterBytes: after, changedIndices: before.flatMap((n, i) => n !== after[i] ? [i] : []), afterLocals: locals, localChanges: Object.entries(locals).filter(([key, value]) => entry.beforeLocals?.[key] !== value).map(([key, value]) => ({key, before: entry.beforeLocals?.[key], after: value})), returnValue: Number.isFinite(entry.returnValue) ? entry.returnValue : null});
    }
    return {source: {...source, lines}, events, status: trace.status, reason: String(trace.reason || ''), complete: trace.status === 'complete'};
  }
  function tokenizeLine(line, blockComment = false) {
    const tokens = []; let i = 0;
    const add = (text, kind = '') => tokens.push({text, kind});
    while (i < line.length) {
      const tail = line.slice(i);
      if (blockComment) { const end = tail.indexOf('*/'); const length = end < 0 ? tail.length : end + 2; add(tail.slice(0, length), 'comment'); i += length; blockComment = end < 0; continue; }
      if (tail.startsWith('//')) { add(tail, 'comment'); break; }
      if (tail.startsWith('/*')) { const end = tail.indexOf('*/', 2); const length = end < 0 ? tail.length : end + 2; add(tail.slice(0, length), 'comment'); i += length; blockComment = end < 0; continue; }
      const string = tail.match(/^(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/);
      if (string) { add(string[0], 'string'); i += string[0].length; continue; }
      const directive = tail.match(/^#\s*\w+/); if (directive) { add(directive[0], 'directive'); i += directive[0].length; continue; }
      const number = tail.match(/^(?:0[xX][\da-fA-F]+|\d+(?:\.\d+)?)[uUlLfF]*/); if (number) { add(number[0], 'number'); i += number[0].length; continue; }
      const word = tail.match(/^[A-Za-z_]\w*/);
      if (word) { const keyword = /^(?:if|else|while|for|return|do|break|continue|switch|case|default|const|restrict|static|unsigned|signed|int|char|void|size_t|rsize_t|errno_t|NULL)$/.test(word[0]); add(word[0], keyword ? 'keyword' : /^\s*\(/.test(tail.slice(word[0].length)) ? 'function' : ''); i += word[0].length; continue; }
      add(line[i++]);
    }
    return {tokens, blockComment};
  }
  function frameFor(trace, index, progress = 1) {
    if (!trace) return {bytes: null, changed: [], line: null, event: null};
    if (index < 0) return {bytes: trace.events[0].beforeBytes, changed: [], line: null, event: null, guardUnchanged: true};
    const event = trace.events[Math.min(index, trace.events.length - 1)];
    return {bytes: progress < .8 ? event.beforeBytes : event.afterBytes, changed: event.changedIndices, line: event.line, event, guardUnchanged: progress < .8 ? index > 0 ? trace.events[index - 1].guardUnchanged : true : event.guardUnchanged};
  }
  const helpers = {normalizeTrace, tokenizeLine, frameFor, bytes, fromHex};
  if (typeof module === 'object' && module.exports) module.exports = helpers;
  if (typeof document === 'undefined') return;
  const root = document.getElementById('lab-environment'); if (!root) return;
  const get = id => document.getElementById(id);
  const stage = get('lab-battle-stage'), canvas = get('lab-battle-canvas'), labels = get('lab-battle-labels');
  const caption = get('lab-battle-caption'), state = get('lab-battle-state'), path = get('lab-verification-path');
  const sourcePane = get('lab-trace-source'), lineBadge = get('lab-trace-line'), bytePane = get('lab-trace-bytes');
  const playButton = get('lab-trace-play'), prevButton = get('lab-trace-prev'), nextButton = get('lab-trace-next'), replay = get('lab-battle-replay'), scrubber = get('lab-trace-progress'), position = get('lab-trace-position');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let running = false, current = null, trace = null, index = -1, stepProgress = 1, playing = false, raf = 0, stepStart = 0, stepMs = 400, visible = true, activeLine = null, rows = [];
  let sceneView = null;
  const node = (tag, text, parent, className) => { const el = document.createElement(tag); if (text != null) el.textContent = String(text); if (className) el.className = className; parent?.append(el); return el; };
  function evidence(mode, states = {}) {
    if (!path) return; path.dataset.state = mode;
    path.querySelectorAll('[data-evidence-step]').forEach(el => { const status = states[el.dataset.evidenceStep] || 'pending'; el.classList.toggle('is-active', status === 'running'); el.classList.toggle('is-complete', status === 'complete'); el.classList.toggle('is-failed', status === 'failed'); });
  }
  function stop() { playing = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  function controls() {
    const available = !!trace && !running;
    if (playButton) { playButton.disabled = !available; playButton.textContent = playing ? '暂停' : '播放'; playButton.setAttribute('aria-pressed', String(playing)); }
    if (prevButton) prevButton.disabled = !available || index < 0;
    if (nextButton) nextButton.disabled = !available || index >= trace.events.length - 1;
    if (replay) replay.disabled = !available;
    if (scrubber) { scrubber.disabled = !available; scrubber.max = trace ? trace.events.length : 0; scrubber.value = index + 1; }
    if (position) position.textContent = (index + 1) + ' / ' + (trace?.events.length || 0);
  }
  function renderSource(source) {
    if (!sourcePane) return; sourcePane.replaceChildren(); rows = []; activeLine = null;
    if (get('lab-trace-file')) get('lab-trace-file').textContent = source?.file || 'strcpy_s.c';
    if (get('lab-trace-version')) { get('lab-trace-version').textContent = source?.sha256 ? '本次运行源码' : '尚无本次源码快照'; get('lab-trace-version').title = source?.sha256 ? 'SHA-256 ' + source.sha256 : ''; }
    if (!source || typeof source.text !== 'string') { node('p', '运行自测后，显示本次代码和逐行执行轨迹。', sourcePane, 'le-trace-empty'); return; }
    let block = false;
    source.text.replace(/\r\n/g, '\n').split('\n').forEach((line, i) => {
      const row = node('div', null, sourcePane, 'le-code-line'); row.dataset.line = String(i + 1);
      node('span', i + 1, row, 'le-code-number'); const code = node('code', null, row, 'le-code-content');
      const parsed = tokenizeLine(line, block); block = parsed.blockComment;
      parsed.tokens.forEach(token => node('span', token.text, code, token.kind ? 'le-token-' + token.kind : ''));
      if (!line) node('span', ' ', code); rows.push(row);
    });
  }
  function highlight(line) {
    if (line === activeLine) return;
    if (activeLine != null) { rows[activeLine - 1]?.classList.remove('is-current'); rows[activeLine - 1]?.removeAttribute('aria-current'); }
    activeLine = line;
    const row = line != null ? rows[line - 1] : null;
    if (row) {
      row.classList.add('is-current'); row.setAttribute('aria-current', 'step');
      const top = row.offsetTop - sourcePane.offsetTop;
      if (top < sourcePane.scrollTop + 60 || top + row.offsetHeight > sourcePane.scrollTop + sourcePane.clientHeight - 60) sourcePane.scrollTo({top: Math.max(0, top - sourcePane.clientHeight * .4), behavior: 'auto'});
    }
    if (lineBadge) lineBadge.textContent = line == null ? trace ? '执行前' : '暂无逐行轨迹' : '执行第 ' + line + ' 行';
  }
  function updateBytes(frame) {
    if (!bytePane) return;
    if (bytePane.children.length !== 8) { bytePane.replaceChildren(); for (let i = 0; i < 8; i++) { const cell = node('div', null, bytePane, 'le-byte-cell'); node('strong', '—', cell); node('span', '[' + i + ']', cell); } }
    [...bytePane.children].forEach((cell, i) => { const value = frame.bytes?.[i]; cell.classList.toggle('is-changed', frame.changed.includes(i)); cell.classList.toggle('is-nul', value === 0); cell.children[0].textContent = value == null ? '—' : value === 0 ? 'NUL' : value >= 32 && value <= 126 ? String.fromCharCode(value) : value.toString(16).padStart(2, '0').toUpperCase(); cell.children[1].textContent = '[' + i + '] ' + (value == null ? '未知' : '0x' + value.toString(16).padStart(2, '0').toUpperCase()); });
  }
  function render() {
    const frame = trace ? frameFor(trace, index, stepProgress) : {bytes: fromHex(current?.result?.afterHex), changed: [], line: null, event: null};
    highlight(frame.line); updateBytes(frame); sceneView?.display(frame, current, stepProgress);
    const e = frame.event;
    if (get('lab-trace-locals')) get('lab-trace-locals').textContent = e ? e.localChanges.slice(0, 4).map(item => item.key + (item.before == null ? ' = ' : ': ' + item.before + ' → ') + item.after).join(' · ') : '';
    if (caption && !running) {
      if (e) {
        const changes = e.changedIndices.map(i => '[' + i + '] ' + e.beforeBytes[i].toString(16).padStart(2, '0').toUpperCase() + ' → ' + e.afterBytes[i].toString(16).padStart(2, '0').toUpperCase());
        caption.textContent = '第 ' + e.line + ' 行' + (e.status === 'interrupted' ? '执行中断' : stepProgress < .8 ? '执行步骤' : '执行后') + ' · ' + (changes.length ? '写入 ' + changes.join('，') : '缓冲区未改变') + (e.returnValue != null && stepProgress >= .8 ? ' · 实际返回 ' + e.returnValue : '') + (e.guardUnchanged === false ? ' · 相邻内存发生变化' : '') + (!trace.complete && index === trace.events.length - 1 ? ' · 轨迹未完整结束' : '');
        caption.dataset.state = e.guardUnchanged === false ? 'fail' : 'ready';
      } else if (trace) { caption.textContent = '已载入本次实际逐行轨迹，播放或单步查看代码与内存。'; caption.dataset.state = 'ready'; }
      else { caption.textContent = current?.result?.sourceMatchesChecks === false ? '轨迹与检测记录采用不同代码版本，请保存后重新运行。' : current?.result?.status === 'observed' && current.result.observed !== false ? '本次未取得完整逐行轨迹，当前显示实际最终内存。' : current?.result ? '本次轨迹尚未完整返回，当前没有可确认的最终内存。' : '选择输入并运行自测，查看实际代码执行与内存变化。'; caption.dataset.state = 'pending'; }
    }
    controls();
  }
  function tick(now) {
    raf = 0; if (!playing || !trace || !visible || document.hidden) return;
    stepProgress = Math.min(1, (now - stepStart) / stepMs); render();
    if (stepProgress >= 1) { if (index >= trace.events.length - 1) { stop(); controls(); return; } index++; stepStart = now; stepProgress = 0; }
    raf = requestAnimationFrame(tick);
  }
  function startPlayback(restart = false) {
    if (!trace || running) return; stop();
    if (restart || index >= trace.events.length - 1) index = -1;
    if (index < 0) { index = 0; stepProgress = 0; }
    playing = true; stepStart = performance.now() - stepProgress * stepMs; controls();
    if (visible && !document.hidden) raf = requestAnimationFrame(tick);
  }
  function seek(next) { if (!trace || running) return; stop(); index = Math.max(-1, Math.min(trace.events.length - 1, next)); stepProgress = 1; render(); }
  function update(event) {
    stop(); current = event.detail || {}; index = -1; stepProgress = 1;
    const source = current.source || current.result?.source;
    trace = normalizeTrace(source, current.result); stepMs = trace ? Math.max(150, 15000 / trace.events.length) : 400;
    renderSource(source);
    if (state) state.textContent = trace ? trace.complete ? '代码与内存同步' : '实际轨迹 · 尚未完整结束' : current.result?.status === 'observed' && current.result.observed !== false ? '实际最终内存' : '等待实际执行';
    render(); if (trace && trace.complete && !running && !reduced.matches) startPlayback(true);
  }
  root.addEventListener('lab:case', update);
  root.addEventListener('lab:running', event => { running = true; stop(); trace = null; current = null; index = -1; renderSource(null); render(); if (event.detail.operation === 'submit') evidence('running', {source: 'running', checks: 'running'}); if (state) state.textContent = '正在读取本次执行轨迹'; if (caption) caption.textContent = '正在读取已保存代码并执行检查，结果返回后可逐行回放。'; });
  root.addEventListener('lab:results', event => { running = false; if (event.detail.operation === 'submit') evidence('checked', {source: event.detail.detail?.checkEvidence?.verifiedReceipt ? 'complete' : 'pending', checks: event.detail.passed === true ? 'complete' : event.detail.passed === false ? 'failed' : 'pending'}); controls(); });
  root.addEventListener('lab:record', event => evidence('archived', {source: event.detail.sources && Object.keys(event.detail.sources).length ? 'complete' : 'pending', checks: event.detail.passed === true ? 'complete' : event.detail.passed === false ? 'failed' : 'pending', record: 'complete'}));
  root.addEventListener('lab:error', event => { running = false; stop(); trace = null; current = null; index = -1; renderSource(null); render(); if (event.detail.operation === 'submit') evidence('failed', {checks: 'failed'}); if (state) state.textContent = '本次检查未完成'; if (caption) caption.textContent = '当前没有可回放的本次执行轨迹。'; });
  playButton?.addEventListener('click', () => { if (playing) { stop(); controls(); } else startPlayback(); });
  prevButton?.addEventListener('click', () => seek(index - 1)); nextButton?.addEventListener('click', () => seek(index + 1));
  scrubber?.addEventListener('input', () => seek(Number(scrubber.value) - 1)); replay?.addEventListener('click', () => startPlayback(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); controls(); } });
  reduced.addEventListener?.('change', () => { if (reduced.matches) { stop(); stepProgress = 1; render(); } });
  if (stage && canvas && labels) sceneView = makeScene();
  if (stage && typeof IntersectionObserver === 'function') new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting !== false; if (!visible) { stop(); controls(); } else sceneView?.resize(); }, {threshold: .02}).observe(stage);
  root.addEventListener('lab:tab', event => { if (event.detail.tab === 'history') { stop(); controls(); } else sceneView?.resize(); });
  render();
  function makeScene() {
    const T = window.THREE; let renderer;
    try { if (!T) throw new Error('Three unavailable');
    T.ColorManagement.enabled = true;
    renderer = new T.WebGLRenderer({canvas, alpha: true, antialias: true});
  } catch (_) {
    document.getElementById('lab-battle-fallback').hidden = false;
    canvas.hidden = true;
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0x071a27, .025);
  const camera = new T.PerspectiveCamera(38, 1, .1, 80);
  camera.zoom = 1.12;
  const centre = new T.Vector3(.2, .5, 0);
  const rig = new T.Group(); scene.add(rig);
  scene.add(new T.HemisphereLight(0xc8f4ff, 0x24384a, 1.25));
  const key = new T.DirectionalLight(0xe9fbff, 1.7);
  key.position.set(-4, 9, 6); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -9; key.shadow.camera.right = 9;
  key.shadow.camera.top = 7; key.shadow.camera.bottom = -7;
  scene.add(key);
  const rim = new T.PointLight(0x43dcc5, 2.4, 30); rim.position.set(3, 4, -6); scene.add(rim);
  const palette = {input: 0x8de4ff, target: 0x176477, nul: 0xffca70, guard: 0x5de4b6, error: 0xff7179, dark: 0x0a2738, neutral: 0x19394c};
  const mat = (color, extra = {}) => new T.MeshStandardMaterial({color, metalness: .33, roughness: .35, ...extra});
  function box(w, h, d, color, x, y, z, group = rig, extra = {}) {
    const object = new T.Mesh(new T.BoxGeometry(w, h, d), mat(color, extra));
    object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true;
    group.add(object); return object;
  }
  const base = box(10.8, .2, 5.5, palette.dark, .45, -.2, -.05);
  const deck = box(7.5, .1, 1.6, 0x17475b, -.25, -.03, 1.08);
  const slotX = index => -3.35 + index * .9;
  const slots = [], values = [], valueLabels = [];
  const labelRecords = [];
  function label(text, position, kind = '') {
    const node = document.createElement('span'); node.className = 'le-battle-label ' + kind; node.textContent = text;
    labels.append(node); const record = {node, position}; labelRecords.push(record); return record;
  }
  for (let index = 0; index < 8; index++) {
    slots.push(box(.79, .15, 1.05, palette.target, slotX(index), .1, 1.1));
    const value = box(.61, .55, .68, palette.input, slotX(index), .46, 1.1);
    value.visible = false; values.push(value);
    valueLabels.push(label('', value.position, 'is-byte'));
    label(String(index), new T.Vector3(slotX(index), .01, 1.98), 'is-index');
  }
  const sentinel = box(.84, .3, 1.05, 0x455367, 4.65, .19, 1.1);
  const boundary = box(.055, .9, 1.3, palette.nul, 3.78, .5, 1.1, rig, {transparent: true, opacity: .65});
  label('相邻内存', new T.Vector3(4.65, .15, 2.06), 'is-small');
  label('目标缓冲区 · 8 字节', new T.Vector3(-.25, -.07, 2.64), 'is-target');
  label('输入字节', new T.Vector3(-1.6, 1.65, -3.0), 'is-small');
  const gateGroup = new T.Group(); rig.add(gateGroup);
  const gate = box(7.8, 1.65, .1, palette.guard, -.2, 1.04, -.27, gateGroup, {transparent: true, opacity: .18, depthWrite: false});
  const gateTop = box(7.9, .055, .16, palette.guard, -.2, 1.89, -.27, gateGroup, {emissive: palette.guard, emissiveIntensity: .5});
  [-4.15, 3.75].forEach(x => box(.055, 1.7, .16, palette.guard, x, 1.05, -.27, gateGroup, {emissive: palette.guard, emissiveIntensity: .4}));
  const gateLabel = label('长度检查', new T.Vector3(2.1, 2.8, -.28), 'is-gate');
  const rail = box(8.15, .08, .08, 0x39728b, -.2, .2, -2.45);
  const packets = [], packetLabels = [];
  for (let index = 0; index < 9; index++) {
    const packet = box(.57, .57, .57, palette.input, slotX(index), 1.1, -2.45);
    packets.push(packet); packetLabels.push(label('', packet.position, 'is-byte'));
  }

    const writeTokens = [], writeLabels = [];
    const writeOrigin = new T.Vector3(4.3, 2.6, -.9);
    const writeHeading = label('本步写入', new T.Vector3(4.3, 3.2, -.9), 'is-gate');
    for (let i = 0; i < 8; i++) { const token = box(.55, .55, .55, palette.input, 4.3, 2.6, -.9); token.visible = false; writeTokens.push(token); writeLabels.push(label('', token.position, 'is-byte')); }
    let angle = .24, elevation = 7.6, distance = 12.8, lastFrame = {bytes: null, changed: [], event: null}, lastCurrent = null, lastProgress = 1;
    const hexLabel = value => value == null ? '—' : value === 0 ? 'NUL' : value >= 32 && value <= 126 ? String.fromCharCode(value) : value.toString(16).padStart(2, '0').toUpperCase();
    function positionCamera() {
      const fit = Math.max(.88, 1.7 / Math.max(.55, camera.aspect));
      camera.position.set(Math.sin(angle) * distance * fit, elevation * fit, Math.cos(angle) * distance * fit); camera.lookAt(centre);
    }
    function display(frame, current, progress) {
      lastFrame = frame; lastCurrent = current; lastProgress = progress;
      const data = current?.caseData || {}, input = array(data.inputBytes), event = frame.event;
      const guardChanged = frame.guardUnchanged === false || !trace && current?.result?.guardUnchanged === false;
      const returned = progress >= .8 ? event?.returnValue : null;
      gateGroup.scale.y = returned != null && returned !== 0 ? .06 + .94 * Math.min(1, progress * 3) : .06;
      gateLabel.node.hidden = returned == null;
      gateLabel.node.textContent = returned === 0 ? '返回 0' : returned != null ? '返回 ' + returned + (returned === 34 ? ' · 拒绝复制' : '') : '';
      gateLabel.node.style.color = returned === 0 ? '#8de4ff' : '#ffca70';
      sentinel.material.color.setHex(guardChanged ? palette.error : 0x455367);
      for (let i = 0; i < 9; i++) {
        const present = i <= input.length && i < 9 && !!current;
        packets[i].visible = present; packetLabels[i].node.hidden = !present;
        packets[i].position.set(slotX(i), .7, -2.45); packets[i].scale.setScalar(.8);
        packets[i].material.color.setHex(i === input.length ? palette.nul : palette.input);
        packetLabels[i].node.textContent = i === input.length ? 'NUL' : hexLabel(input[i]);
      }
      writeHeading.node.hidden = !frame.changed.length || progress >= .8;
      for (let i = 0; i < 8; i++) {
        const moving = frame.changed.includes(i) && progress < .8 && !reduced.matches;
        writeTokens[i].visible = moving; writeLabels[i].node.hidden = !moving;
        if (moving) {
          const q = Math.min(1, progress / .8); const value = event.afterBytes[i];
          writeTokens[i].position.set(writeOrigin.x + (slotX(i) - writeOrigin.x) * q, writeOrigin.y + (.46 - writeOrigin.y) * q + Math.sin(q * Math.PI) * 1.1, writeOrigin.z + (1.1 - writeOrigin.z) * q);
          writeTokens[i].material.color.setHex(value === 0 ? palette.nul : palette.input);
          writeTokens[i].material.emissive.setHex(0x164333);
          writeLabels[i].node.textContent = hexLabel(value);
          writeLabels[i].node.classList.toggle('is-nul', value === 0);
        }
        const value = frame.bytes?.[i]; const changed = frame.changed.includes(i);
        values[i].visible = value != null; valueLabels[i].node.hidden = value == null;
        values[i].position.y = .46 + (changed && !reduced.matches ? Math.sin(Math.max(0, (progress - .8) * 5) * Math.PI) * .12 : 0);
        values[i].material.color.setHex(value === 0 ? palette.nul : value === 165 ? palette.neutral : palette.input);
        values[i].material.emissive.setHex(changed ? 0x174f3a : 0x000000); values[i].material.emissiveIntensity = changed ? .7 : 0;
        valueLabels[i].node.textContent = hexLabel(value); valueLabels[i].node.classList.toggle('is-nul', value === 0);
        slots[i].material.color.setHex(changed ? 0x2a8b68 : palette.target);
      }
      positionCamera(); renderer.render(scene, camera);
      const width = stage.clientWidth, height = stage.clientHeight;
      for (const record of labelRecords) { const v = record.position.clone().project(camera); record.node.style.left = ((v.x + 1) / 2 * width) + 'px'; record.node.style.top = ((1 - v.y) / 2 * height) + 'px'; }
    }
    function resize() { const width = stage.clientWidth, height = stage.clientHeight; if (!width || !height) return; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); display(lastFrame, lastCurrent, lastProgress); }
    new ResizeObserver(resize).observe(stage);
    let drag = null;
    canvas.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY, angle, elevation]; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (!drag) return; angle = Math.max(-.7, Math.min(.7, drag[2] + (e.clientX - drag[0]) * .004)); elevation = Math.max(4, Math.min(12, drag[3] + (e.clientY - drag[1]) * .02)); display(lastFrame, lastCurrent, lastProgress); });
    canvas.addEventListener('pointerup', () => { drag = null; }); canvas.addEventListener('pointercancel', () => { drag = null; });
    canvas.addEventListener('wheel', e => { e.preventDefault(); distance = Math.max(10, Math.min(18, distance + e.deltaY * .007)); resize(); }, {passive: false});
    canvas.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); angle += e.key === 'ArrowLeft' ? -.06 : .06; resize(); } if (e.key === 'Home') { e.preventDefault(); angle = .24; elevation = 7.6; distance = 12.8; resize(); } });
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); get('lab-battle-fallback').hidden = false; stop(); controls(); });
    resize(); return {display, resize};
  }
})();
