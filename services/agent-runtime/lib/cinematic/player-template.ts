import { playerIcon, playerIconButton as button, type PlayerIcon } from './ui-icons';
import type { CinematicScene } from './schema';

const icons: PlayerIcon[] = ['play', 'pause', 'replay', 'orbit', 'camera'];
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
function learnerControlMarkup(controls: CinematicScene['learnerControls']) {
  return controls.map(control => control.type === 'range'
    ? `<label class="learner-range" data-control-id="${control.id}"><span>${escape(control.label)}</span><output for="learner-${control.id}"></output><input id="learner-${control.id}" data-control-id="${control.id}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${control.defaultValue}" aria-label="${escape(control.label)}"></label>`
    : `<button id="learner-${control.id}" class="learner-button" data-control-id="${control.id}" data-action="${control.action}" type="button">${escape(control.label)}</button>`).join('');
}
export function playerTemplate(title: string, introduction: string, modelNote: string, duration: number, version: 'v1' | 'v2' = 'v1', learnerControls: CinematicScene['learnerControls'] = []) {
  return `<main id="cinema" data-cinematic="${version}" data-cinematic-runtime="${version === 'v2' ? '2026-09-15.2' : '2026-09-14.4'}" data-animation-state="chapter-1" tabindex="-1">
    <header class="cinema-header"><h1>${title}</h1><div id="cinema-mode-controls" role="group" aria-label="学习方式" hidden><button id="cinema-mode-process" type="button" aria-pressed="false">观看讲解</button><button id="cinema-mode-experiment" type="button" aria-pressed="true">操作实验</button></div></header>
    <section class="cinema-stage">
      <div class="viewport" id="viewport">
        <canvas id="cinematic-canvas" data-animation-scene tabindex="0" aria-label="${title} 三维场景" aria-describedby="interaction-hint"></canvas>
        <canvas id="cinematic-fallback" class="hidden" aria-label="二维兼容场景"></canvas>
        <div class="canvas-vignette"></div><div id="node-labels"></div>
        <p id="interaction-hint" class="sr-only">拖动旋转 · 滚轮 / 双指缩放 · 点击部件查看说明</p>
        <div class="view-actions" role="group" aria-label="观察视角">
          ${button('camera-mode', 'orbit', '自由探索', 'aria-pressed="false"')}
          ${button('explode-mode', 'layers', '结构拆解', 'aria-pressed="false"')}
          <span class="control-divider"></span>
          ${button('zoom-in', 'plus', '放大')}${button('zoom-out', 'minus', '缩小')}
        </div>
      </div>
      <aside id="cinema-notes" class="cinema-aside" aria-label="当前章节讲解">
        <div class="notes-heading"><div id="chapter-number" class="chapter-index">01</div>${button('player-notes-close', 'close', '收起讲解')}</div>
        <h2 id="chapter-title"></h2><p id="chapter-caption" aria-live="polite"></p><p id="chapter-question" class="question"></p>
        <section id="learner-controls" class="learner-controls" aria-label="实验控制"${learnerControls.length ? '' : ' hidden'}><h3>实验控制</h3><div id="learner-control-list">${learnerControlMarkup(learnerControls)}</div><output id="learner-feedback" aria-live="polite"></output></section>
        <div id="detail-box" class="detail-box" hidden><strong id="detail-title"></strong><p id="detail-copy"></p></div>
        <details class="intro-note"><summary>演示简介</summary><p>${introduction}</p>${modelNote}</details>
      </aside>
    </section>
    <section id="cinematic-domain-lab" class="domain-lab" aria-label="领域决策实验" hidden></section>\n    <div id="chapter-timeline-shell" class="chapter-timeline-shell">
      <div id="chapter-timeline" class="chapter-timeline">
        <div id="timeline-rail" class="timeline-rail">
          <nav id="chapters" class="cinema-chapters" aria-label="教学章节"></nav>
          <div class="timeline"><div id="timeline-markers" aria-hidden="true"></div><input id="animation-progress" aria-label="动画时间轴" type="range" min="0" max="${duration}" step="0.0333333" value="0"></div>
        </div>
      </div>
      <output id="timeline-tooltip" hidden></output>
    </div>
    <footer class="cinema-controls">
      <div class="controls-row"><div class="transport" role="group" aria-label="播放控制">
        ${button('animation-previous', 'previous', '上一章', 'aria-keyshortcuts="Shift+ArrowLeft"')}
        ${button('animation-toggle', 'play', '播放', 'aria-keyshortcuts="Space K"')}
        ${button('animation-next', 'next', '下一章', 'aria-keyshortcuts="Shift+ArrowRight"')}
      </div><output id="time-label">0:00 / 0:00</output>
      <div class="secondary-controls">
        ${button('player-notes-toggle', 'notes', '收起讲解', 'aria-controls="cinema-notes" aria-expanded="true" aria-keyshortcuts="N"')}
        ${button('player-settings-toggle', 'settings', '播放设置', 'aria-controls="player-settings" aria-expanded="false"')}
        ${button('cinema-fullscreen', 'fullscreen', '全屏演示', 'aria-keyshortcuts="F"')}
      </div></div>
      <section id="player-settings" class="settings-panel" aria-label="播放设置" hidden>
        <label for="playback-rate">播放速度</label><select id="playback-rate" aria-label="播放速度">${[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => `<option value="${rate}"${rate === 1 ? ' selected' : ''}>${rate} 倍速</option>`).join('')}</select>
        <label for="quality">画质</label><select id="quality" aria-label="渲染画质"><option value="high" selected>精细画质</option><option value="auto">标准画质</option><option value="low">流畅画质</option></select>
        <label for="player-labels">部件名称</label><input id="player-labels" type="checkbox" checked>
        <div class="frame-controls" role="group" aria-label="逐帧与重置">
          ${button('animation-back', 'back', '上一帧', 'aria-keyshortcuts=","')}${button('animation-step', 'step', '下一帧', 'aria-keyshortcuts="."')}${button('animation-reset', 'replay', '回到初始状态')}
        </div>
        <details id="player-shortcuts"><summary>快捷键与操作</summary><dl><dt>空格 / K</dt><dd>播放或暂停</dd><dt>← / →</dt><dd>后退或前进 5 秒</dd><dt>Shift + ← / →</dt><dd>切换章节</dd><dt>, / .</dt><dd>上一帧 / 下一帧</dd><dt>0–9</dt><dd>跳到对应进度</dd><dt>F / N</dt><dd>全屏 / 讲解</dd></dl><p>拖动旋转，滚轮或双指缩放。自由探索时动画继续播放。</p></details>
      </section>
    </footer>
  </main><template id="player-icon-library">${icons.map(playerIcon).join('')}</template>`;
}
