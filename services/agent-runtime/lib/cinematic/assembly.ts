import {
  assetCatalog,
  sampleCinematicConnectionPath,
  type AssetBounds,
  type AssetCatalogEntry,
  type AssetPort,
} from './asset-catalog';
import type { CinematicNode, CinematicScene } from './schema';

export type Vector3 = [number, number, number];
export type Matrix = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
export type Bounds = Pick<AssetBounds, 'min' | 'max'>;
export type WorldNode = { node: CinematicNode; matrix: Matrix; opacity: number; explode: number };
export const add = (a: Vector3, b: Vector3): Vector3 => a.map((v, i) => v + b[i]) as Vector3;
export const sub = (a: Vector3, b: Vector3): Vector3 => a.map((v, i) => v - b[i]) as Vector3;
export const scale = (a: Vector3, s: number): Vector3 => a.map((v) => v * s) as Vector3;
// Placement bounds involve matrix arithmetic. Keep their authored result
// stable across an otherwise identical replay before deriving bound paths.
const stablePlacement = (value: Vector3): Vector3 =>
  value.map(component => Number(component.toPrecision(12))) as Vector3;
export const dot = (a: Vector3, b: Vector3) => a.reduce((sum, v, i) => sum + v * b[i], 0);
export const cross = (a: Vector3, b: Vector3): Vector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (v: Vector3) => Math.hypot(...v);
export const unit = (v: Vector3): Vector3 => scale(v, 1 / (length(v) || 1));
export const identity = (): Matrix => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
export const transformPoint = (m: Matrix, p: Vector3): Vector3 =>
  [0, 4, 8].map((i) => m[i] * p[0] + m[i + 1] * p[1] + m[i + 2] * p[2] + m[i + 3]) as Vector3;
export const transformDirection = (m: Matrix, p: Vector3): Vector3 =>
  sub(transformPoint(m, p), transformPoint(m, [0, 0, 0]));

export function compose(position: Vector3, rotation: Vector3, size: Vector3): Matrix {
  const [x, y, z] = rotation,
    a = Math.cos(x),
    b = Math.sin(x),
    c = Math.cos(y),
    d = Math.sin(y),
    e = Math.cos(z),
    f = Math.sin(z);
  return [
    c * e * size[0],
    -c * f * size[1],
    d * size[2],
    position[0],
    (a * f + b * e * d) * size[0],
    (a * e - b * f * d) * size[1],
    -b * c * size[2],
    position[1],
    (b * f - a * e * d) * size[0],
    (b * e + a * f * d) * size[1],
    a * c * size[2],
    position[2],
  ];
}

export function multiply(a: Matrix, b: Matrix): Matrix {
  const m = identity();
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 4; col++)
      m[row * 4 + col] =
        a[row * 4] * b[col] +
        a[row * 4 + 1] * b[4 + col] +
        a[row * 4 + 2] * b[8 + col] +
        (col === 3 ? a[row * 4 + 3] : 0);
  return m;
}

export function inverse(m: Matrix): Matrix {
  const [a, b, c, tx, d, e, f, ty, g, h, i, tz] = m;
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(determinant) < 1e-12) throw Error('装配变换不可逆');
  const r: Matrix = [
    (e * i - f * h) / determinant,
    (c * h - b * i) / determinant,
    (b * f - c * e) / determinant,
    0,
    (f * g - d * i) / determinant,
    (a * i - c * g) / determinant,
    (c * d - a * f) / determinant,
    0,
    (d * h - e * g) / determinant,
    (b * g - a * h) / determinant,
    (a * e - b * d) / determinant,
    0,
  ];
  const t = transformDirection(r, [-tx, -ty, -tz]);
  r[3] = t[0];
  r[7] = t[1];
  r[11] = t[2];
  return r;
}

export function valueAt(
  scene: CinematicScene,
  node: CinematicNode,
  property: CinematicScene['tracks'][number]['property'],
  time: number,
): number | Vector3 {
  const track = scene.tracks.find((item) => item.target === node.id && item.property === property);
  if (!track) return property === 'explode' ? 0 : node[property];
  const keys = track.keyframes;
  if (time <= keys[0].at) return keys[0].value;
  for (let i = 1; i < keys.length; i++)
    if (time < keys[i].at) {
      const previous = keys[i - 1],
        next = keys[i];
      let fraction = (time - previous.at) / (next.at - previous.at);
      if (track.easing === 'smooth') fraction *= fraction * (3 - 2 * fraction);
      return Array.isArray(previous.value)
        ? (previous.value.map(
            (v, axis) => v + ((next.value as Vector3)[axis] - v) * fraction,
          ) as Vector3)
        : previous.value + ((next.value as number) - previous.value) * fraction;
    }
  return keys[keys.length - 1].value;
}

export function worldNodes(scene: CinematicScene, time = 0): Map<string, WorldNode> {
  const nodes = new Map(scene.nodes.map((node) => [node.id, node])),
    result = new Map<string, WorldNode>(),
    groupOpacity = new Map<string, number>(),
    visiting = new Set<string>();
  const visit = (id: string): WorldNode => {
    if (result.has(id)) return result.get(id)!;
    if (visiting.has(id)) throw Error(`装配层级循环：${id}`);
    const node = nodes.get(id);
    if (!node) throw Error(`装配节点不存在：${id}`);
    visiting.add(id);
    const parent = node.parent ? visit(node.parent) : undefined;
    const local = compose(
      valueAt(scene, node, 'position', time) as Vector3,
      valueAt(scene, node, 'rotation', time) as Vector3,
      valueAt(scene, node, 'scale', time) as Vector3,
    );
    const inheritedOpacity = node.parent ? groupOpacity.get(node.parent) ?? 1 : 1;
    const ownOpacity = valueAt(scene, node, 'opacity', time) as number;
    const world = {
      node,
      matrix: parent ? multiply(parent.matrix, local) : local,
      opacity: inheritedOpacity * ownOpacity,
      explode: valueAt(scene, node, 'explode', time) as number,
    };
    result.set(id, world);
    // Mesh materials belong to that entity. A translucent housing must not
    // fade separately authored internal parts; groups explicitly fade a rig.
    groupOpacity.set(id, inheritedOpacity * (node.kind === 'group' ? ownOpacity : 1));
    visiting.delete(id);
    return world;
  };
  for (const node of scene.nodes) visit(node.id);
  return result;
}

export function catalogFor(node: CinematicNode): AssetCatalogEntry {
  if (node.kind !== 'model' || !node.model)
    throw Error(`节点 ${node.id} 不是具有资产端口的精细模型`);
  return assetCatalog(node.model, node.params);
}

export function localBounds(node: CinematicNode, explode = 0): Bounds {
  if (node.kind === 'model') {
    const asset = catalogFor(node);
    return explode > 0 ? asset.expandedBounds : asset.bounds;
  }
  const p = node.params,
    n = (key: string, fallback: number) =>
      typeof p[key] === 'number' ? (p[key] as number) : fallback;
  let half: Vector3 = [0, 0, 0];
  if (node.kind === 'box') half = [n('width', 1) / 2, n('height', 1) / 2, n('depth', 1) / 2];
  if (node.kind === 'sphere') half = [1, 1, 1].map(() => n('radius', 1)) as Vector3;
  if (node.kind === 'cylinder')
    half = [
      Math.max(n('top', 0.5), n('bottom', 0.5)),
      n('height', 2) / 2,
      Math.max(n('top', 0.5), n('bottom', 0.5)),
    ];
  if (node.kind === 'torus')
    half = [n('radius', 1) + n('tube', 0.08), n('radius', 1) + n('tube', 0.08), n('tube', 0.08)];
  if (node.kind === 'plane') half = [n('width', 6) / 2, n('height', 6) / 2, 0.001];
  if (node.kind === 'points') half = [1, 1, 1].map(() => n('spread', 5)) as Vector3;
  if (node.kind === 'points' && node.points?.length) return {
    min: [0, 1, 2].map(i => Math.min(...node.points!.map(point => point[i])) - n('size', .035)) as Vector3,
    max: [0, 1, 2].map(i => Math.max(...node.points!.map(point => point[i])) + n('size', .035)) as Vector3,
  };
  if (node.kind === 'tube' && node.points?.length)
    return {
      min: [0, 1, 2].map(
        (i) => Math.min(...node.points!.map((point) => point[i])) - n('radius', 0.04),
      ) as Vector3,
      max: [0, 1, 2].map(
        (i) => Math.max(...node.points!.map((point) => point[i])) + n('radius', 0.04),
      ) as Vector3,
    };
  return { min: scale(half, -1), max: half };
}

export function corners(bounds: Bounds): Vector3[] {
  return Array.from(
    { length: 8 },
    (_, bits) => [0, 1, 2].map((i) => (bits & (1 << i) ? bounds.max[i] : bounds.min[i])) as Vector3,
  );
}
export function enclosing(points: Vector3[]): Bounds {
  return {
    min: [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))) as Vector3,
    max: [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i]))) as Vector3,
  };
}
export function worldBounds(world: WorldNode): Bounds {
  return enclosing(
    corners(localBounds(world.node, world.explode)).map((p) => transformPoint(world.matrix, p)),
  );
}
/** Groups have no mesh of their own. Their physical envelope is the union of
 * actual descendant meshes, in world space; an empty transform is not a body. */
export function assemblyWorldBounds(worlds:Map<string,WorldNode>,id:string):Bounds {
  const world=worlds.get(id);if(!world)throw Error(`装配节点不存在：${id}`);
  if(world.node.kind!=='group')return worldBounds(world);
  const parts=[...worlds.values()].filter(part=>{
    if(part.node.kind==='group')return false;
    let parent=part.node.parent;const seen=new Set<string>();
    while(parent&&!seen.has(parent)){if(parent===id)return true;seen.add(parent);parent=worlds.get(parent)?.node.parent;}
    return false;
  });
  if(!parts.length)throw Error(`不能使用空 group ${id} 的边界作装配参照`);
  return enclosing(parts.flatMap(part=>corners(worldBounds(part))));
}
export const center = (bounds: Bounds): Vector3 => scale(add(bounds.min, bounds.max), 0.5);

function portFor(node: CinematicNode, name: string): AssetPort {
  const ports = catalogFor(node).ports;
  if (!Object.hasOwn(ports, name))
    throw Error(
      `节点 ${node.id} 不存在端口 ${name}；真实端口：${Object.keys(ports).join(', ') || '无'}`,
    );
  if (ports[name].dynamic)
    throw Error(
      `端口 ${node.id}.${name} 随内部动画运动，当前不能静态锚定；请选择固定壳体/底座端口或相对摆放`,
    );
  return ports[name];
}

function anchorId(node: string, port: string): string {
  let hash = 2166136261;
  for (const char of `${node}:${port}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `port-${node.slice(0, 25)}-${(hash >>> 0).toString(16)}`;
}

export function resolveCinematicAssembly(input: CinematicScene): {
  scene: CinematicScene;
  report: { version: string; placements: number; portAnchors: number; coordinateSpace: string };
} {
  const scene = structuredClone(input),
    nodes = new Map(scene.nodes.map((node) => [node.id, node]));
  const placements = new Map((scene.assembly?.placements ?? []).map((item) => [item.node, item]));
  const complete = new Set<string>(),
    visiting = new Set<string>();
  const resolve = (id: string) => {
    if (complete.has(id)) return;
    if (visiting.has(id)) throw Error(`装配依赖循环：${[...visiting, id].join(' → ')}`);
    const node = nodes.get(id);
    if (!node) throw Error(`装配节点不存在：${id}`);
    visiting.add(id);
    if (node.parent) resolve(node.parent);
    const placement = placements.get(id);
    if (placement && 'reference' in placement) resolve(placement.reference);
    if (placement) {
      const worlds = worldNodes(scene),
        current = worlds.get(id)!,
        bounds = assemblyWorldBounds(worlds,id);
      let delta: Vector3 = [0, 0, 0];
      if (placement.mode === 'floor') delta[1] = placement.y - bounds.min[1];
      else {
        const reference = worlds.get(placement.reference)!;
        if (!reference) throw Error(`装配参照不存在：${placement.reference}`);
        if (placement.mode === 'relative') {
          const other = assemblyWorldBounds(worlds,reference.node.id);
          delta = sub(center(other), center(bounds));
          const sides: Record<string, [number, number]> = {
            left: [0, -1],
            right: [0, 1],
            below: [1, -1],
            above: [1, 1],
            behind: [2, -1],
            front: [2, 1],
          };
          const side = sides[placement.side];
          if (side) {
            const [axis, sign] = side;
            delta[axis] =
              sign > 0
                ? other.max[axis] + placement.gap - bounds.min[axis]
                : other.min[axis] - placement.gap - bounds.max[axis];
          }
          delta = add(delta, placement.offset);
        } else {
          const own = portFor(node, placement.port),
            target = portFor(reference.node, placement.referencePort);
          const normal = unit(transformDirection(reference.matrix, target.normal));
          if (dot(unit(transformDirection(current.matrix, own.normal)), normal) > -0.95)
            throw Error(
              `端口法向不相对：${id}.${placement.port} → ${placement.reference}.${placement.referencePort}；请修订节点 rotation 后再连接`,
            );
          delta = sub(
            add(
              add(transformPoint(reference.matrix, target.position), scale(normal, placement.gap)),
              placement.offset,
            ),
            transformPoint(current.matrix, own.position),
          );
        }
      }
      const parentMatrix = node.parent ? worlds.get(node.parent)!.matrix : identity();
      // Already aligned bodies can differ by machine roundoff after matrix
      // multiplication. Keep their authored position so checkpoint/cache
      // identities do not drift on each repeated assembly solve.
      const extent=Math.max(1,...bounds.min.map(Math.abs),...bounds.max.map(Math.abs),...delta.map(Math.abs));
      delta=delta.map(value=>Math.abs(value)<=32*Number.EPSILON*extent?0:value) as Vector3;
      const localDelta = transformDirection(inverse(parentMatrix), delta);
      const initial = valueAt(scene, node, 'position', 0) as Vector3;
      node.position = stablePlacement(add(initial, localDelta));
      const track = scene.tracks.find((item) => item.target === id && item.property === 'position');
      if (track)
        track.keyframes = track.keyframes.map((key) => ({
          ...key,
          value: stablePlacement(add(key.value as Vector3, localDelta)),
        }));
    }
    visiting.delete(id);
    complete.add(id);
  };
  for (const node of scene.nodes) resolve(node.id);
  const ensureAnchor = (ownerId: string, portName: string): string => {
    const owner = nodes.get(ownerId);
    if (!owner) throw Error(`端口所属节点不存在：${ownerId}`);
    const port = portFor(owner, portName),
      id = anchorId(ownerId, portName),
      existing = nodes.get(id);
    if (
      existing &&
      (existing.assemblyPort?.node !== ownerId || existing.assemblyPort.port !== portName)
    )
      throw Error(`装配端口 ID 冲突：${id}`);
    const anchor: CinematicNode = {
      id,
      kind: 'group',
      parent: ownerId,
      assemblyPort: { node: ownerId, port: portName },
      role: 'decoration',
      position: [...port.position],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#8ea6bd',
      emissive: 0,
      metalness: 0.5,
      roughness: 0.3,
      opacity: 1,
      params: {},
    };
    if (existing) Object.assign(existing, anchor);
    else {
      nodes.set(id, anchor);
      scene.nodes.push(anchor);
    }
    return id;
  };
  for (const node of [...scene.nodes])
    if (node.assemblyPort) {
      if (anchorId(node.assemblyPort.node, node.assemblyPort.port) !== node.id) {
        delete node.assemblyPort;
        continue;
      }
      const id = ensureAnchor(node.assemblyPort.node, node.assemblyPort.port);
      if (id !== node.id) throw Error(`端口锚点 ID 非确定性：${node.id}`);
    }
  for (const connection of scene.connections) {
    if (connection.fromPort) {
      connection.from = ensureAnchor(connection.from, connection.fromPort);
      delete connection.fromPort;
    }
    if (connection.toPort) {
      connection.to = ensureAnchor(connection.to, connection.toPort);
      delete connection.toPort;
    }
  }
  Object.assign(scene, bindCinematicConnectionPaths(scene));
  if (scene.nodes.length > 100) throw Error('装配端口解析后超过100个节点，需简化连接');
  for (const node of scene.nodes)
    if (node.position.some((v) => !Number.isFinite(v) || Math.abs(v) > 200))
      throw Error(`装配位置超出场景范围：${node.id}`);
  return {
    scene,
    report: {
      version: 'assembly-v1',
      placements: placements.size,
      portAnchors: scene.nodes.filter((node) => node.assemblyPort).length,
      coordinateSpace: 'world-placement / parent-local-output',
    },
  };
}

// A path's tube, particles and directed markers must share endpoints AFTER
// assembly placement. Independent coordinate guesses were producing correctly
// animated but backwards educational explanations.
export function bindCinematicConnectionPaths(input: CinematicScene): CinematicScene {
  const scene = structuredClone(input);
  const bound = scene.nodes.filter(node => node.connectionPath || node.followConnection);
  if (!bound.length) return scene;
  const connections = new Map(scene.connections.map(connection => [connection.id, connection]));
  const paths = new Map<string, { controls: Vector3[]; samples: Vector3[]; length: number; maxChordError: number }>();
  const hasChangingTransform = (node: CinematicNode, start: number, end: number) => scene.tracks.some(track => {
    if(track.target!==node.id||!['position','rotation','scale'].includes(track.property))return false;
    const times=[start,end,...track.keyframes.filter(key=>key.at>start&&key.at<end).map(key=>key.at)];
    return new Set(times.map(at=>JSON.stringify(valueAt(scene,node,track.property,at)))).size>1;
  });
  const pathFor = (id: string, at: number, interval: [number,number]) => {
    const cacheKey=`${id}:${at}:${interval[0]}:${interval[1]}`,cached = paths.get(cacheKey); if (cached) return cached;
    const link = connections.get(id);
    if (!link || link.fromPort || link.toPort) throw Error('先解析装配和端口，再绑定真实连接路径：' + id);
    const worlds=worldNodes(scene,at);
    for (const endpoint of [link.from, link.to]) {
      let node: CinematicNode | undefined = worlds.get(endpoint)?.node;
      if (!node) throw Error('路径端点不存在：' + endpoint);
      while (node) {
        if (node.followConnection || node.connectionPath || hasChangingTransform(node,interval[0],interval[1]))
          throw Error('当前连接路径绑定只支持固定世界端点及固定祖先；不能引用自身、其他路径绑定或移动端点：' + endpoint);
        node = node.parent ? worlds.get(node.parent)?.node : undefined;
      }
    }
    const from = transformPoint(worlds.get(link.from)!.matrix, [0, 0, 0]);
    const to = transformPoint(worlds.get(link.to)!.matrix, [0, 0, 0]);
    const middle = scale(add(from, to), 0.5); middle[1] += Math.max(0.8, length(sub(from, to)) * 0.15);
    const controls = [from, ...(link.via.length ? link.via : [middle]), to];
    const sampled = sampleCinematicConnectionPath(controls);
    // Existing 24-keyframe limits stay intact. Reject a path too sharp for the
    // bounded 20-segment approximation rather than misrepresenting its route.
    if (sampled.length < 1e-6 || sampled.maxChordError > Math.max(link.radius * 0.5, sampled.length * 0.005))
      throw Error('连接路径过短或急弯超出20段运动近似精度，请减少急折并保留真实起终点：' + id);
    const path = { controls, ...sampled }; paths.set(cacheKey, path); return path;
  };
  for (const node of bound) {
    const binding = node.followConnection;
    const path = node.connectionPath
      ? pathFor(node.connectionPath,0,[0,scene.duration])
      : pathFor(binding!.connection,binding!.start,[binding!.start,binding!.end]);
    if (node.connectionPath) {
      node.position = [0, 0, 0]; node.points = structuredClone(path.controls);
      if (scene.tracks.some(track => track.target === node.id && ['position', 'rotation', 'scale'].includes(track.property)))
        throw Error('通路几何由连接拥有，不可另设变换轨道：' + node.id);
    } else {
      const { start, end } = binding!;
      node.position = [...path.samples[0]];
      const keyframes = path.samples.map((point, index) => ({ at: start + (end - start) * index / 20, value: [...point] as Vector3 }));
      if (start > 0) keyframes.unshift({ at: 0, value: [...path.samples[0]] });
      if (end < scene.duration) keyframes.push({ at: scene.duration, value: [...path.samples.at(-1)!] });
      const track = { target: node.id, property: 'position' as const, easing: 'linear' as const, keyframes };
      const index = scene.tracks.findIndex(existing => existing.target === node.id && existing.property === 'position');
      if (index < 0) scene.tracks.push(track); else scene.tracks[index] = track;
    }
  }
  return scene;
}
