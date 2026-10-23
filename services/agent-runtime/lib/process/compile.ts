import { playerIcon, playerIconButton } from '../cinematic/ui-icons';
import engineSource from './engine.js?raw';
import basePlayerSource from './player.js?raw';
import topologySource from './topology.js?raw';
import decisionPanelSource from './decision-panel.js?raw';
import baseStyles from './styles.txt?raw';
import topologyStyles from './topology-styles.txt?raw';
import { parseProcessScene, type ProcessScene } from './schema';
import { processInteractionManifest } from './interaction-manifest';
const playerSource = topologySource + '\n' + decisionPanelSource + '\n' + basePlayerSource;
const styles = baseStyles + '\n' + topologyStyles;
export const PROCESS_RUNTIME_VERSION='2026-10-02.10';

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
const script = (value: string) => value.replace(/<\/script/gi, '<\\/script');
export function compileProcessScene(value: ProcessScene): string {
  const scene = parseProcessScene(value);
  const json = JSON.stringify(scene).replace(/</g, '\\u003c');
  const interaction = JSON.stringify(processInteractionManifest(scene)).replace(/</g, '\\u003c');
  const layout = scene.layout ?? (scene.decisions?.length ? 'decision-lab' : scene.views.some(view => view.kind === 'code') ? 'code-lab' : 'standard');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(scene.title)}</title><style>${styles}</style></head><body><main data-process="v2" data-process-runtime="${PROCESS_RUNTIME_VERSION}" data-layout="${layout}"><header><span class="eyebrow">互动过程实验</span><h1>${escape(scene.title)}</h1><p>${escape(scene.summary)}</p><details><summary>模型说明</summary><p>${escape(scene.modelNote)}</p></details></header><nav id="process-stages" aria-label="实验阶段"></nav><div class="lab-layout"><aside><div id="process-leading-views"></div><section><h2>实验条件</h2><p class="muted">标注“实时”的条件可在实验中调整。</p><div id="process-inputs"></div></section><section><h2>亲手操作</h2><div id="process-actions"></div><div class="transport">${playerIconButton('process-pause', 'pause', '暂停连续执行')}${playerIconButton('process-back', 'back', '撤销一步')}${playerIconButton('process-reset', 'replay', '重置实验')}<label>执行速度<select id="process-speed"><option value="700">慢速</option><option value="350" selected>标准</option><option value="100">快速</option></select></label></div><output id="process-progress" aria-live="off"></output></section></aside><article><div id="process-views" class="views"></div><section id="process-decisions" class="decision-panel" aria-label="情境决策"></section><section class="explanation"><h2 id="process-stage-title"></h2><p id="process-stage-explanation"></p><p id="process-feedback" role="status" aria-live="polite"></p><p id="process-error" role="alert"></p></section><section id="process-questions"><h2>核对你的观察</h2><p class="muted">根据当前可见证据核对，不计入课程正式成绩。</p></section><details class="trace-panel"><summary>查看操作记录</summary><ol id="process-trace"></ol></details></article></div></main><template id="process-play-icon">${playerIcon('play')}</template><script id="process-scene" type="application/json">${json}</script><script id="widget-config" type="application/json">${interaction}</script><script>${script(engineSource)}</script><script>${script(playerSource)}</script></body></html>`;
}
