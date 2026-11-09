(function () {
  function initialize() {
    const shell = document.querySelector('.workspace-shell');
    const panel = document.getElementById('workspace-demo');
    const api = window.DojoLearning;
    if (!shell || !panel || !api) return;
    const frame = document.getElementById('workspace-demo-iframe');
    const picker = panel.querySelector('[data-workspace-demo-select]');
    const status = panel.querySelector('.workspace-demo-status');
    const message = panel.querySelector('[data-workspace-demo-message]');
    const retry = panel.querySelector('[data-workspace-demo-retry]');
    const create = panel.querySelector('[data-workspace-demo-create]');
    const open = panel.querySelector('[data-workspace-demo-open]');
    const tutor = shell.querySelector('[data-learning-tutor]');
    const tutorToggle = tutor?.querySelector('.learning-tutor-toggle');
    const controls = [...shell.querySelectorAll('[data-workspace-view]')];
    const navigation = shell.querySelector('[data-workspace-navigation]');
    const mobile = window.matchMedia('(max-width: 900px)');
    let entries = [];
    let selected = '';
    let view = 'code';
    let sequence = 0;
    let timer;
    let expectedOrigin = '';
    let ready = false;
    let disposed = false;
    const unwrap = result => result?.data || result;

    function showStatus(text, state) {
      status.hidden = false;
      message.textContent = text;
      retry.hidden = state !== 'error';
      create.hidden = state !== 'empty';
      frame.hidden = true;
      panel.dataset.state = state;
    }

    function stopPreview() {
      sequence += 1;
      clearTimeout(timer);
      ready = false;
      expectedOrigin = '';
      frame.src = 'about:blank';
      frame.hidden = true;
      panel.classList.remove('is-immersive');
    }

    function markView() {
      controls.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.workspaceView === view)));
      shell.dataset.auxiliaryView = view;
      shell.querySelectorAll('[data-workspace-mobile-panel]').forEach(button => {
        if (!window.matchMedia('(max-width: 700px)').matches) return;
        const activePanel = navigation?.classList.contains('is-mobile-open') ? 'navigation' : view === 'code' ? 'workspace' : view;
        const active = button.dataset.workspaceMobilePanel === activePanel;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    }

    function setView(next, focus) {
      const previous = view;
      view = next;
      panel.hidden = next !== 'demo';
      if (next !== 'demo' && previous === 'demo') stopPreview();
      if (tutorToggle) {
        const expanded = !tutor.classList.contains('is-collapsed');
        if ((next === 'tutor') !== expanded) tutorToggle.click();
      }
      if (next === 'demo' && navigation && !navigation.classList.contains('is-collapsed')) {
        navigation.querySelector('.workspace-navigation-toggle')?.click();
      }
      if (next !== 'demo') shell.classList.remove('workspace-demo-wide');
      markView();
      if (next === 'demo' && previous !== 'demo') loadCatalog();
      if (focus) (next === 'demo' ? picker : shell.querySelector(`[data-workspace-view="${next}"]`))?.focus({preventScroll: true});
    }

    async function launch() {
      stopPreview();
      const entry = entries.find(item => item.id === selected);
      if (!entry || view !== 'demo' || disposed) return;
      const current = sequence;
      open.hidden = false;
      open.href = entry.url;
      frame.title = entry.title + ' · 教学演示';
      showStatus('正在打开演示…', 'loading');
      try {
        const result = unwrap(await api.json('POST', '/teaching/runtime/launch', {
          role: entry.role,
          target: '/prep/' + encodeURIComponent(entry.id),
          dojoId: entry.dojoId,
          moduleIndex: entry.moduleIndex,
          workspaceId: entry.workspaceId,
        }));
        if (current !== sequence || view !== 'demo' || disposed) return;
        if (!result.launchUrl) throw new Error('演示入口未就绪，请重新加载。');
        const target = new URL(result.launchUrl, window.location.origin);
        if (!['https:', 'http:'].includes(target.protocol)) throw new Error('演示入口不可用。');
        expectedOrigin = target.origin;
        frame.src = target.href;
        timer = setTimeout(() => {
          if (current === sequence && !ready) showStatus('演示加载时间较长，可重新加载或在新窗口打开。', 'error');
        }, 30000);
      } catch (error) {
        if (current === sequence && view === 'demo') showStatus(error.message || '无法打开演示，请重试。', 'error');
      }
    }

    async function loadCatalog() {
      const current = ++sequence;
      showStatus('正在读取可用演示…', 'loading');
      picker.disabled = true;
      open.hidden = true;
      try {
        const result = unwrap(await api.request('/workspace/demos'));
        if (current !== sequence || view !== 'demo' || disposed) return;
        entries = Array.isArray(result.artifacts) ? result.artifacts : [];
        picker.replaceChildren();
        if (!entries.length) {
          picker.add(new Option('暂无可用演示', ''));
          selected = '';
          showStatus('当前课程暂无已发布演示，也没有可使用的个人演示。', 'empty');
          return;
        }
        const groups = new Map();
        entries.forEach(item => {
          let group = groups.get(item.source);
          if (!group) {
            group = document.createElement('optgroup');
            group.label = item.source;
            groups.set(item.source, group);
            picker.append(group);
          }
          group.append(new Option(item.title, item.id));
        });
        if (!entries.some(item => item.id === selected)) selected = entries[0].id;
        picker.value = selected;
        picker.disabled = false;
        await launch();
      } catch (error) {
        if (current === sequence && view === 'demo') showStatus(error.message || '无法读取演示列表，请重试。', 'error');
      }
    }

    window.addEventListener('message', event => {
      if (event.source !== frame.contentWindow || event.origin !== expectedOrigin || view !== 'demo') return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'aisecedu:artifact-preview' && data.artifactId === selected) {
        clearTimeout(timer);
        ready = data.state === 'ready';
        if (ready) {
          status.hidden = true;
          frame.hidden = false;
          panel.dataset.state = 'ready';
        } else showStatus(data.message || '演示未能打开，请重新加载。', 'error');
      }
      if (data.__aiseceduCinematicPreview === true && data.action === 'immersive-change') {
        panel.classList.toggle('is-immersive', data.immersive === true);
      }
    });
    controls.forEach(button => button.addEventListener('click', () => setView(button.dataset.workspaceView, false)));
    shell.querySelectorAll('[data-workspace-mobile-panel]').forEach(button => button.addEventListener('click', () => {
      const next = button.dataset.workspaceMobilePanel;
      setView(next === 'demo' || next === 'tutor' ? next : 'code', false);
    }));
    panel.querySelector('[data-workspace-demo-close]').addEventListener('click', () => setView('code', true));
    panel.querySelector('[data-workspace-demo-reload]').addEventListener('click', loadCatalog);
    retry.addEventListener('click', loadCatalog);
    picker.addEventListener('change', () => { selected = picker.value; launch(); });
    tutorToggle?.addEventListener('click', () => queueMicrotask(() => {
      if (disposed) return;
      const expanded = !tutor.classList.contains('is-collapsed');
      if (expanded && view === 'demo') { panel.hidden = true; stopPreview(); }
      if (expanded) view = 'tutor';
      else if (view === 'tutor') view = 'code';
      markView();
    }));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && window.matchMedia('(max-width: 700px)').matches) {
        queueMicrotask(() => { if (!disposed) setView('code', false); });
      }
    });
    shell.querySelector('[data-workspace-mobile-backdrop]')?.addEventListener('click', () => {
      queueMicrotask(() => { if (!disposed) setView('code', false); });
    });
    window.addEventListener('dojo:workspace-stopped', () => setView('code', false));
    window.addEventListener('pagehide', () => { disposed = true; stopPreview(); });
    mobile.addEventListener('change', markView);
    markView();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
