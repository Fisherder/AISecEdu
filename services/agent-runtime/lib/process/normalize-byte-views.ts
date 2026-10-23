import type { ProcessScene } from './schema';

/** Recover actual byte arrays when a generated "source and cipher bytes" panel
 * accidentally contains only their two lengths. The correction is grounded in
 * both modeled arrays and the panel's own region boundary. */
export function recoverByteArraysFromLengthPanel(scene: ProcessScene): void {
  if (!Array.isArray(scene.views) || scene.views.length >= 12) return;
  for (const view of [...scene.views]) {
    const candidate = view as any;
    const lengths = candidate.value?.op === 'array' && Array.isArray(candidate.value.args)
      ? candidate.value.args : undefined;
    if (candidate.kind !== 'array' || candidate.format !== 'byte' ||
        !/原文.*密文|密文.*原文/.test(candidate.title ?? '') ||
        !lengths || lengths.length !== 2 || !Array.isArray(candidate.regions) ||
        candidate.regions.length !== 2) continue;
    const ids = lengths.map((item: any) => item?.op === 'length' &&
      typeof item.args?.[0]?.state === 'string' ? item.args[0].state : null);
    if (ids.some((id: unknown) => typeof id !== 'string' ||
        !Array.isArray(scene.initialState[id as string]))) continue;
    const sourceId = ids.find((id: string) => /^(?:input|source|plain)/i.test(id));
    const cipherId = ids.find((id: string) => /^(?:encrypted|cipher)/i.test(id));
    if (!sourceId || !cipherId || sourceId === cipherId) continue;
    const [processed, pending] = candidate.regions;
    if (processed?.start !== 0 || typeof pending?.start?.state !== 'string' ||
        !JSON.stringify(pending.end).includes(`"state":"${sourceId}"`)) continue;
    const position = pending.start.state;
    if (typeof scene.initialState[position] !== 'number' ||
        !scene.actions.some(action => action.updates.some(update => update.target === position))) continue;
    const newId = `${candidate.id}Cipher`;
    if (newId.length > 48 || scene.views.some(item => item.id === newId)) continue;
    candidate.title = '原文字节数组';
    candidate.value = {state: sourceId};
    processed.end = {state: position};
    pending.end = {op: 'length', args: [{state: sourceId}]};
    scene.views.push({id: newId, title: '已加密字节数组', kind: 'array',
      value: {state: cipherId}, format: 'byte',
      ...(candidate.activeIndex === undefined ? {} : {activeIndex: structuredClone(candidate.activeIndex)})});
  }
}

/** A model can store already formatted hex strings in an array while also
 * requesting the numeric hex formatter. Show those authored strings directly
 * only when every write to that array is itself a hex conversion. */
export function normalizeHexStringArrayViews(scene: ProcessScene): void {
  for (const view of scene.views ?? []) {
    if (view.kind !== 'array' || !['hex', 'byte'].includes(view.format ?? '') ||
        typeof (view.value as any)?.state !== 'string') continue;
    const id = (view.value as {state: string}).state;
    if (!Array.isArray(scene.initialState?.[id]) || scene.initialState[id].length) continue;
    const writes = (scene.actions ?? []).flatMap(action => action.updates.filter(update => update.target === id));
    if (!writes.length || writes.some(update => (update.value as any)?.op !== 'hex')) continue;
    view.format = 'plain';
  }
}

/** A cipher-byte array is data, not a list of cell indexes. When it is
 * written in lockstep with the displayed byte array, mark the processed
 * prefix by its length instead of misreading the cipher values as indexes. */
export function normalizeProcessedByteMarkers(scene: ProcessScene): void {
  for (const view of scene.views ?? []) {
    if (view.kind !== 'array' || typeof (view.value as any)?.state !== 'string' ||
        typeof (view.markedIndices as any)?.state !== 'string') continue;
    const dataId = (view.value as {state: string}).state;
    const markerId = (view.markedIndices as {state: string}).state;
    if (dataId === markerId || !Array.isArray(scene.initialState?.[dataId]) ||
        !Array.isArray(scene.initialState?.[markerId]) ||
        scene.initialState[dataId].length || scene.initialState[markerId].length) continue;
    let sawCipherWrite = false, aligned = true;
    for (const action of scene.actions ?? []) {
      const markers = action.updates.filter(update => update.target === markerId);
      if (!markers.length) continue;
      const data = action.updates.filter(update => update.target === dataId);
      if (markers.length !== 1 || data.length !== 1 || markers[0].index === undefined ||
          JSON.stringify(markers[0].index) !== JSON.stringify(data[0].index)) {
        aligned = false;
        break;
      }
      const expression = (markers[0].value as any)?.local
        ? action.locals?.find(local => local.id === (markers[0].value as any).local)?.value
        : markers[0].value;
      if ((expression as any)?.op !== 'xor') { aligned = false; break; }
      sawCipherWrite = true;
    }
    if (sawCipherWrite && aligned)
      view.markedIndices = {op:'range',args:[0,{op:'length',args:[{state:markerId}]}]};
  }
}
