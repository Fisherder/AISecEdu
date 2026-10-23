(function (scope) {
  'use strict';
  const formatTime = time => {
    const seconds = Math.max(0, Math.floor(time));
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  };
  scope.CinematicControls = function ({ root, state, scene, presentation, listen, actions }) {
    const get = id => document.getElementById(id);
    const toggle = get('animation-toggle'), progress = get('animation-progress');
    const settings = get('player-settings'), settingsButton = get('player-settings-toggle');
    const notesButton = get('player-notes-toggle'), tooltip = get('timeline-tooltip');
    const iconLibrary = get('player-icon-library');
    const rail = get('timeline-rail'), markers = get('timeline-markers');
    const chapterAt = time => Math.max(0, presentation.chapters.findLastIndex(chapter => chapter.at <= time));
    let settingsOpen = false, notesChoice = null, lastIcon = '', lastTime = '';
    function label(button, text) {
      if (button.getAttribute('aria-label') === text) return;
      button.setAttribute('aria-label', text);
      button.title = text;
      button.dataset.tooltip = text;
    }
    function icon(button, name) {
      if (button.firstElementChild?.dataset.icon === name) return;
      button.replaceChildren(iconLibrary.content.querySelector('[data-icon="' + name + '"]').cloneNode(true));
    }
    function setSettings(open, restoreFocus = false) {
      settingsOpen = open;
      settings.hidden = !open;
      settingsButton.setAttribute('aria-expanded', String(open));
      if (open) get('playback-rate').focus({ preventScroll: true });
      else if (restoreFocus) settingsButton.focus({ preventScroll: true });
    }
    function setNotes(open, explicit = true) {
      if (explicit) notesChoice = open;
      root.dataset.notesOpen = String(open);
      notesButton.setAttribute('aria-expanded', String(open));
      label(notesButton, open ? '收起讲解' : '展开讲解');
      get('cinema-notes').hidden = !open;
      actions.layout();
    }
    function chapterJump(offset) {
      if(state.interactionMode==='experiment')return;
      const current = chapterAt(state.time);
      const target = offset < 0 && state.time > presentation.chapters[current].at + 2
        ? current : Math.max(0, Math.min(presentation.chapters.length - 1, current + offset));
      actions.seek(presentation.chapters[target].at);
    }
    const clicks = {
      'animation-toggle': actions.toggle,
      'animation-previous': () => chapterJump(-1),
      'animation-next': () => chapterJump(1),
      'animation-step': () => actions.step(1 / 30),
      'animation-back': () => actions.step(-1 / 30),
      'animation-reset': actions.reset,
      'camera-mode': actions.camera,
      'explode-mode': actions.explode,
      'zoom-in': () => actions.zoom(.8),
      'zoom-out': () => actions.zoom(1.25),
      'cinema-fullscreen': actions.fullscreen,
      'player-settings-toggle': () => setSettings(!settingsOpen),
      'player-notes-toggle': () => setNotes(root.dataset.notesOpen !== 'true'),
      'player-notes-close': () => { setNotes(false); notesButton.focus({ preventScroll: true }); },
    };
    for (const [id, callback] of Object.entries(clicks)) listen(get(id), 'click', callback);
    listen(get('playback-rate'), 'change', event => actions.rate(Number(event.target.value)));
    listen(get('quality'), 'change', event => actions.quality(event.target.value));
    listen(get('player-labels'), 'change', event => actions.labels(event.target.checked));
    listen(document, 'pointerdown', event => {
      if (settingsOpen && !settings.contains(event.target) && !settingsButton.contains(event.target)) setSettings(false);
    });
    listen(root, 'focusout', event => {
      const next = event.relatedTarget;
      if (settingsOpen && next && !settings.contains(next) && next !== settingsButton) setSettings(false);
    });
    const spans = presentation.chapters.map((chapter, index) => (presentation.chapters[index + 1]?.at ?? scene.duration) - chapter.at);
    // Titles and the seek track share one time scale, including native thumb travel.
    rail.style.setProperty('--timeline-units', String(Math.min(32, scene.duration / Math.min(...spans.filter(span => span > 0)))));
    rail.style.setProperty('--timeline-endcap', spans.at(-1) === 0 ? 'var(--chapter-min-width)' : '0px');
    get('chapters').style.gridTemplateColumns = spans.map(span => span > 0 ? `minmax(0, ${span}fr)` : 'var(--timeline-endcap)').join(' ');
    for (const [index, chapter] of presentation.chapters.entries()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = chapter.title;
      button.dataset.start = String(chapter.at);
      button.dataset.end = String(chapter.at + spans[index]);
      button.setAttribute('aria-label', '第 ' + (index + 1) + ' 章：' + chapter.title);
      const number = document.createElement('span');
      number.className = 'chapter-number';
      number.textContent = String(index + 1).padStart(2, '0');
      const text = document.createElement('span');
      text.className = 'chapter-label';
      text.append(number, document.createTextNode(chapter.title));
      button.append(text);
      listen(button, 'click', () => actions.seek(chapter.at));
      get('chapters').append(button);
      if (index > 0) {
        const mark = document.createElement('span');
        mark.style.left = (chapter.at / scene.duration * 100) + '%';
        markers.append(mark);
      }
    }
    function showTimelineHint(time, percentage) {
      tooltip.textContent = (state.interactionMode==='experiment'?time.toFixed(2)+' 秒 · 当前方案的运动观察':formatTime(time)+' · '+presentation.chapters[chapterAt(time)].title);
      tooltip.hidden = false;
      const track = markers.getBoundingClientRect(), shell = get('chapter-timeline-shell').getBoundingClientRect();
      const x = Math.max(0, Math.min(shell.width, track.left + track.width * percentage / 100 - shell.left));
      tooltip.style.left = x + 'px';
      tooltip.style.setProperty('--tooltip-shift', -(shell.width ? x / shell.width * 100 : 0) + '%');
    }
    listen(progress, 'pointermove', event => {
      const bounds = markers.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
      showTimelineHint(fraction * scene.duration, fraction * 100);
    });
    listen(progress, 'pointerleave', () => { tooltip.hidden = true; });
    listen(get('chapter-timeline'), 'scroll', () => { tooltip.hidden = true; });
    listen(progress, 'pointerdown', event => {
      if (event.button !== 0) return;
      actions.beginScrub();
      progress.setPointerCapture(event.pointerId);
    });
    listen(progress, 'input', event => {
      actions.seek(Number(event.target.value));
      showTimelineHint(state.time, state.time / scene.duration * 100);
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur', 'change']) {
      listen(progress, event, () => { actions.endScrub(); tooltip.hidden = true; });
    }
    listen(progress, 'keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const positions = { ArrowLeft: state.time - 5, ArrowRight: state.time + 5,
        ArrowDown: state.time - 5, ArrowUp: state.time + 5,
        PageDown: state.time - 10, PageUp: state.time + 10, Home: 0, End: scene.duration };
      if (!(event.key in positions)) return;
      event.preventDefault();
      event.stopPropagation();
      actions.seek(positions[event.key]);
      showTimelineHint(state.time, state.time / scene.duration * 100);
    });
    listen(root, 'keydown', event => {
      if (event.key === 'Escape' && settingsOpen) {
        event.preventDefault();
        event.stopPropagation();
        setSettings(false, true);
        return;
      }
      if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target.closest('input,select,textarea,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return;
      const key = event.key.toLowerCase();
      if ([' ', 'enter'].includes(key) && event.target.closest('button,a,summary')) return;
      const commands = {
        ' ': actions.toggle, k: actions.toggle,
        arrowleft: () => event.shiftKey ? chapterJump(-1) : actions.seek(state.time - 5),
        arrowright: () => event.shiftKey ? chapterJump(1) : actions.seek(state.time + 5),
        home: () => actions.seek(0), end: () => actions.seek(scene.duration),
        ',': () => actions.step(-1 / 30), '.': () => actions.step(1 / 30),
        f: actions.fullscreen, n: () => setNotes(root.dataset.notesOpen !== 'true'),
        '?': () => { setSettings(true); get('player-shortcuts').open = true; },
      };
      if (/^[0-9]$/.test(key)) commands[key] = () => actions.seek(scene.duration * Number(key) / 10);
      const command = commands[key];
      if (!command) return;
      event.preventDefault();
      if (event.repeat && [' ', 'k', 'f', 'n', '?'].includes(key)) return;
      command();
    });
    const smallScreen = matchMedia('(max-width: 760px)');
    setNotes(!smallScreen.matches, false);
    listen(smallScreen, 'change', () => { if (notesChoice === null) setNotes(!smallScreen.matches, false); });
    return {
      update() {
        const experiment=state.interactionMode==='experiment';
        toggle.disabled=state.canPlay===false;
        progress.setAttribute('aria-label',experiment?'实验观察时间轴':'动画时间轴');
        const name = state.ended && !state.playing ? 'replay' : state.playing ? 'pause' : 'play';
        if (lastIcon !== name) {
          icon(toggle, name);
          label(toggle, name === 'pause' ? '暂停' : name === 'replay' ? '重新播放' : '播放');
          lastIcon = name;
        }
        root.dataset.playing = String(state.playing);
        root.dataset.scrubbing = String(state.scrubbing);
        progress.value = String(state.time);
        markers.style.setProperty('--progress', (state.time / scene.duration * 100) + '%');
        const timeText = experiment?'观察 '+state.time.toFixed(2)+' 秒 / '+scene.duration+' 秒':formatTime(state.time) + ' / ' + formatTime(scene.duration);
        if (timeText !== lastTime) {
          get('time-label').textContent = timeText;
          progress.setAttribute('aria-valuetext', experiment?state.time.toFixed(2)+' 秒，共 '+scene.duration+' 秒':formatTime(state.time) + '，共 ' + formatTime(scene.duration));
          lastTime = timeText;
        }
        get('animation-previous').disabled = experiment||state.time === 0;
        get('animation-next').disabled = experiment||chapterAt(state.time) === presentation.chapters.length - 1;
        get('playback-rate').value = String(state.rate);
        get('quality').value = state.quality;
        get('player-labels').checked = state.labelsVisible;
        icon(get('camera-mode'), state.explore ? 'camera' : 'orbit');
        label(get('camera-mode'), state.explore ? (experiment?'返回固定实验视角':'返回导演镜头') : '自由探索');
        get('camera-mode').setAttribute('aria-pressed', String(state.explore));
        get('explode-mode').setAttribute('aria-pressed', String(state.exploded));
      },
      revealNotes() { setNotes(true); },
    };
  };
})(globalThis);
