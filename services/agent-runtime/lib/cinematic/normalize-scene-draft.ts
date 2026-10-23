/** Repair a few unambiguous authoring mistakes before asking the model for patches.
 * The original subject and teaching text stay in the scene; all other invalid
 * geometry and timeline decisions still go through the normal validators.
 */
export function normalizeCinematicSceneDraft<T>(value: T): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const scene = structuredClone(value) as Record<string, unknown>;
  if (!Array.isArray(scene.nodes)) return scene as T;
  const nodes = scene.nodes as Array<Record<string, unknown>>;
  const ids = new Set(nodes.map(node => node?.id).filter((id): id is string => typeof id === 'string'));
  const readouts: Array<Record<string, unknown>> = [];
  for (const node of nodes) {
    if (!node || node.kind !== 'box' || !node.surfaceText ||
        typeof node.id !== 'string' || !node.params || typeof node.params !== 'object') continue;
    const params = node.params as Record<string, unknown>;
    const width = typeof params.width === 'number' ? params.width : 1;
    const height = typeof params.height === 'number' ? params.height : 1;
    const depth = typeof params.depth === 'number' ? params.depth : 1;
    const frontAspect = width / height;
    if (!node.surface && frontAspect >= .25 && frontAspect <= 8) continue;
    const topAspect = width / depth;
    const top = frontAspect > 8 && topAspect >= .25 && topAspect <= 8;
    const faceHeight = top ? depth : height;
    if (!Number.isFinite(width) || !Number.isFinite(faceHeight) ||
        width <= 0 || width > 50 || faceHeight <= 0 || faceHeight > 50 ||
        width / faceHeight < .25 || width / faceHeight > 8 ||
        nodes.length + readouts.length >= 100) continue;
    const stem = node.id.slice(0, 39) + '_text';
    let id = stem, suffix = 2;
    while (ids.has(id)) id = `${stem.slice(0, 46 - String(suffix).length)}_${suffix++}`;
    ids.add(id);
    readouts.push({
      id, kind: 'plane', parent: node.id, role: 'support',
      represents: `${String(node.represents ?? node.label ?? node.id).slice(0, 70)}的可读文字面`,
      detail: Array.isArray((node.surfaceText as {lines?: unknown}).lines)
        ? (node.surfaceText as {lines: unknown[]}).lines.filter((line): line is string => typeof line === 'string').join('；').slice(0, 300)
        : undefined,
      position: top ? [0, height / 2 + .006, 0] : [0, 0, depth / 2 + .006],
      rotation: top ? [-Math.PI / 2, 0, 0] : [0, 0, 0],
      scale: [1, 1, 1], color: '#10243b', emissive: 0, metalness: .1,
      roughness: .55, opacity: typeof node.opacity === 'number' ? node.opacity : 1,
      params: {width, height: faceHeight}, surfaceText: node.surfaceText,
    });
    delete node.surfaceText;
  }
  nodes.push(...readouts);
  // A connection is animated by its built-in particles or a node bound to it.
  // SceneIR tracks only animate nodes, so a track targeting the connection ID
  // cannot render any motion and must not consume a model repair round.
  if (Array.isArray(scene.connections) && Array.isArray(scene.tracks)) {
    const connectionIds = new Set((scene.connections as Array<{id?: unknown}>).map(link => link?.id));
    scene.tracks = (scene.tracks as Array<{target?: unknown}>).filter(track =>
      !connectionIds.has(track?.target) || ids.has(track?.target as string));
  }
  return scene as T;
}
