import playerSource from './player.js?raw';
import transportSource from './transport.js?raw';
import controlsSource from './player-ui.js?raw';
import { playerTemplate } from './player-template';
import modelSource from './models.js?raw';
import playerStyles from './player-styles.txt?raw';
import { parseCinematicScene, type CinematicScene } from './schema';
import { cinematicStudentPresentation } from './student-presentation';
import { hardwareAssetKinds } from './hardware-assets';
import cinematicLibrary from '../../public/vendor/cinematic-three-r150.min.js?raw';
import { cinematicInteractionManifest } from './interaction-manifest';
import processEngineSource from '../process/engine.js?raw';
import decisionPanelSource from '../process/decision-panel.js?raw';
import domainLabSource from './domain-lab.js?raw';
import decisionStyles from '../process/styles.txt?raw';
import domainLabStyles from './domain-lab-styles.txt?raw';

export const CINEMATIC_RUNTIME_VERSION='2026-10-02.22';

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
const script = (value: string) => value.replace(/<\/script/gi, '<\\/script');
export function compileCinematicScene(input: CinematicScene): string {
  const scene = parseCinematicScene(input);
  // The browser compiler cannot import the server-only geometry evaluator.
  // Refuse unresolved authoring bindings here; the server quality gate separately
  // recomputes and compares every sample against the current connection geometry.
  for (const node of scene.nodes) {
    if (node.connectionPath && (!node.points || node.points.length < 2))
      throw Error('Unresolved connectionPath: run resolveCinematicAssembly before compilation');
    if (node.followConnection) {
      const { start, end } = node.followConnection;
      const expectedTimes = Array.from({ length: 21 }, (_, i) => start + (end - start) * i / 20);
      if (start > 0) expectedTimes.unshift(0);
      if (end < scene.duration) expectedTimes.push(scene.duration);
      const track = scene.tracks.find(track => track.target === node.id && track.property === 'position');
      if (!track || track.easing !== 'linear' || JSON.stringify(track.keyframes.map(key => key.at)) !== JSON.stringify(expectedTimes))
        throw Error('Unresolved followConnection: run resolveCinematicAssembly before compilation');
    }
  }
  const data = JSON.stringify(scene).replace(/</g, '\\u003c');
  const version = scene.lab || scene.nodes.some(node => node.kind === 'model' && hardwareAssetKinds.has(node.model!)) ? 'v2' : 'v1';
  const library = version === 'v2'
    ? `<script data-cinematic-library="three-r150">${script(cinematicLibrary)}</script>`
    : '<script src="aisecedu:three"></script>';
  const labScripts = scene.lab ? `<script>${script(processEngineSource + '\n' + decisionPanelSource + '\n' + domainLabSource)}</script>` : '';
  const labStyles = scene.lab ? decisionStyles.slice(decisionStyles.indexOf('.decision-panel{')) + '\n' + domainLabStyles : '';
  const presentation = cinematicStudentPresentation(scene);
  const presentationData = JSON.stringify(presentation).replace(/</g, '\\u003c');
  const interactionData = JSON.stringify(cinematicInteractionManifest(scene)).replace(/</g, '\\u003c');
  const modelNote = presentation.modelNote
    ? `<details class="model-note"><summary>模型说明</summary><p>${escape(presentation.modelNote)}</p></details>`
    : '';
  return `<!doctype html><html lang="zh-CN" data-cinematic-runtime="${CINEMATIC_RUNTIME_VERSION}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(presentation.title)}</title><style>${playerStyles}\n${labStyles}</style></head><body>${playerTemplate(escape(presentation.title), escape(presentation.subtitle), modelNote, scene.duration, version, scene.learnerControls)}<script type="application/json" id="cinematic-scene">${data}</script><script type="application/json" id="cinematic-presentation">${presentationData}</script><script type="application/json" id="widget-config">${interactionData}</script>${library}${labScripts}<script>${script(modelSource)}</script><script>${script(transportSource)}</script><script>${script(controlsSource)}</script><script>${script(playerSource)}</script></body></html>`;
}
