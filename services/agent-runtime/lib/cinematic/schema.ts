import { z } from 'zod';
import {
  CINEMATIC_MAX_INTERACTIONS,
  CINEMATIC_MAX_OBJECTIVES,
  CINEMATIC_MAX_OBJECTIVE_LENGTH,
} from './limits';
import { cinematicPlayerControlNames } from './player-controls';
import {
  cinematicPresentationRequirementSchema,
  hasCinematicPresentationContent,
} from './presentation';
import { assetDefinition, cinematicAssetKinds, type AssetParameter } from './asset-definitions';
import { cinematicCurveSchema, cinematicCurvePoints } from './curves';
import { processPackageSchema, processExpressionSchema, parseProcessScene, validateProcessExpressions } from '../process/schema';

const vec3 = z.tuple([
  z.number().finite().min(-200).max(200),
  z.number().finite().min(-200).max(200),
  z.number().finite().min(-200).max(200),
]);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const identifier = z.string().regex(/^[a-z][a-z0-9_-]{0,47}$/);
export const cinematicModelKinds = cinematicAssetKinds as readonly [
  (typeof cinematicAssetKinds)[number],
  ...(typeof cinematicAssetKinds)[number][],
];
const positive = z.number().finite().positive().max(50);
const fullTurn = z.number().finite().min(0).max(Math.PI * 2);
const arcLength = z.number().finite().positive().max(Math.PI * 2);
const frameRegion = z.object({
  center: z.tuple([z.number().finite().min(-.5).max(.5), z.number().finite().min(-.5).max(.5), z.number().finite().min(-.5).max(.5)]),
  size: z.tuple([z.number().finite().min(.1).max(1), z.number().finite().min(.1).max(1), z.number().finite().min(.1).max(1)]),
}).strict().superRefine((region, context) => {
  if (region.center.some((value, axis) => Math.abs(value) + region.size[axis] / 2 > .5 + 1e-8))
    context.addIssue({ code: 'custom', path: ['center'], message: '局部取景区域必须位于选定主体的包络内', params: { reason: 'frame-region-invalid' } });
});
function parameterSchema(parameter: AssetParameter): z.ZodTypeAny {
  if (parameter.type === 'boolean') return z.boolean().optional();
  if (parameter.type === 'enum')
    return z.enum(parameter.values as [string, ...string[]]).optional();
  let value = z.number().finite();
  if (parameter.type === 'integer') value = value.int();
  if (parameter.min !== undefined) value = value.min(parameter.min);
  if (parameter.max !== undefined) value = value.max(parameter.max);
  return value.optional();
}
const modelParams = Object.fromEntries(
  cinematicAssetKinds.map((kind) => [
    kind,
    z
      .object(
        Object.fromEntries(
          Object.entries(assetDefinition(kind).parameters).map(([name, parameter]) => [
            name,
            parameterSchema(parameter),
          ]),
        ),
      )
      .strict(),
  ]),
);
const primitiveParams = {
  group: z.object({}).strict(),
  box: z
    .object({ width: positive.optional(), height: positive.optional(), depth: positive.optional() })
    .strict(),
  sphere: z.object({ radius: positive.max(25).optional(), phiStart: fullTurn.optional(),
    phiLength: arcLength.optional(), thetaStart: z.number().finite().min(0).max(Math.PI).optional(),
    thetaLength: z.number().finite().positive().max(Math.PI).optional() }).strict()
    .refine(p => (p.thetaStart ?? 0) + (p.thetaLength ?? Math.PI) <= Math.PI + 1e-8, 'Sphere theta interval exceeds π'),
  cylinder: z
    .object({
      top: z.number().min(0).max(25).optional(),
      bottom: z.number().min(0).max(25).optional(),
      height: positive.optional(),
      thetaStart: fullTurn.optional(),
      thetaLength: arcLength.optional(),
      openEnded: z.boolean().optional(),
    })
    .strict(),
  torus: z
    .object({ radius: positive.max(25).optional(), tube: positive.max(2).optional(), arc: arcLength.optional() })
    .strict(),
  plane: z.object({ width: positive.optional(), height: positive.optional() }).strict(),
  tube: z.object({ radius: positive.max(2).optional() }).strict(),
  points: z
    .object({
      count: z.number().int().min(1).max(1000).optional(),
      spread: positive.optional(),
      size: positive.max(4).optional(),
    })
    .strict(),
};
export const cinematicSchemaIssueReasons = [
  'node-id-duplicate',
  'coverage-object-node-missing',
  'coverage-presentation-empty',
  'coverage-interaction-reference-invalid',
  'coverage-interaction-connection-missing',
  'coverage-controls-invalid',
  'coverage-controls-unexpected',
  'assembly-node-missing',
  'assembly-node-duplicate',
  'assembly-reference-invalid',
  'node-model-missing',
  'node-asset-role-invalid',
  'node-params-invalid',
  'node-surface-text-invalid',
  'node-surface-invalid',
  'node-parent-missing',
  'node-parent-cycle',
  'node-scale-invalid',
  'tube-points-missing',
  'node-curve-kind-invalid',
  'node-path-binding-invalid',
  'connection-id-duplicate',
  'connection-endpoint-invalid',
  'track-property-duplicate',
  'track-target-missing',
  'track-explode-target-invalid',
  'track-emissive-target-invalid',
  'track-value-dimension',
  'track-time-invalid',
  'track-scale-invalid',
  'track-unit-value-invalid',
  'track-emissive-value-invalid',
  'timeline-start-invalid',
  'timeline-time-invalid',
  'chapter-focus-missing',
  'frame-node-duplicate',
  'frame-node-invalid',
  'frame-region-invalid',
  'model-count-minimum',
  'model-count-maximum',
  'camera-position-diversity',
  'camera-distance-minimum',
  'camera-transition-distance-minimum',
  'scene-motion-missing',
] as const;
export type CinematicSchemaIssueReason = (typeof cinematicSchemaIssueReasons)[number];

const node = z.object({
  id: identifier,
  kind: z.enum(['group', 'model', 'box', 'sphere', 'cylinder', 'torus', 'plane', 'tube', 'points']),
  model: z.enum(cinematicModelKinds).optional(),
  parent: identifier.optional(),
  role: z.enum(['primary', 'support', 'logic', 'decoration']).optional(),
  represents: z.string().min(1).max(80).optional(),
  assetRole: z.string().min(1).max(80).optional(),
  assemblyPort: z.object({ node: identifier, port: identifier }).optional(),
  label: z.string().max(48).optional(),
  detail: z.string().max(300).optional(),
  surface: z.object({
    pattern: z.enum(['granite', 'strata', 'brushed', 'cellular', 'bands']),
    secondary: color,
    scale: z.number().finite().min(1).max(20).default(5),
    contrast: z.number().finite().min(0).max(1).default(0.6),
    bump: z.number().finite().min(0).max(0.2).default(0.025),
    seed: z.number().int().min(0).max(4095).default(1),
  }).strict().optional(),
  surfaceText: z
    .object({
      lines: z
        .array(
          z
            .string()
            .trim()
            .min(1)
            .max(48)
            .regex(/^[^\u0000-\u001f\u007f-\u009f]+$/),
        )
        .min(1)
        .max(4),
      color: color.default('#e7f2fa'),
      chapterTitle: z.boolean().optional(),
    })
    .strict()
    .optional(),
  position: vec3.default([0, 0, 0]),
  rotation: vec3.default([0, 0, 0]),
  scale: vec3.default([1, 1, 1]),
  color: color.default('#8ea6bd'),
  emissive: z.number().min(0).max(4).default(0),
  metalness: z.number().min(0).max(1).default(0.5),
  roughness: z.number().min(0.05).max(1).default(0.3),
  opacity: z.number().min(0).max(1).default(1),
  params: z
    .record(
      z.string().max(40),
      z.union([z.number().finite().min(-2000).max(2000), z.string().max(80), z.boolean()]),
    )
    .default({}),
  points: z.array(vec3).max(128).optional(),
  curve: cinematicCurveSchema.optional(),
  connectionPath: identifier.optional(),
  followConnection: z.object({
    connection: identifier,
    start: z.number().finite().min(0).max(180),
    end: z.number().finite().min(0).max(180),
  }).strict().optional(),
}).transform(value => value.curve ? { ...value, points: cinematicCurvePoints(value.curve) } : value);
const keyframe = z.object({
  at: z.number().min(0).max(180),
  value: z.union([z.number().finite().min(-1000).max(1000), vec3]),
});
const learnerFeedback = z.object({
  min: z.number().finite().min(-100000).max(100000),
  max: z.number().finite().min(-100000).max(100000),
  label: z.string().min(1).max(48),
  detail: z.string().min(1).max(180),
  tone: z.enum(['info', 'success', 'warning', 'danger']).default('info'),
}).strict().refine(value => value.min <= value.max, '反馈区间最小值不能大于最大值');
const learnerControl = z.union([
  z.object({
    id: identifier,
    type: z.literal('range'),
    label: z.string().min(1).max(48),
    min: z.number().finite().min(-100000).max(100000),
    max: z.number().finite().min(-100000).max(100000),
    step: z.number().finite().positive().max(10000),
    defaultValue: z.number().finite().min(-100000).max(100000),
    unit: z.string().max(16).optional(),
    timeRange: z.tuple([z.number().finite().min(0).max(180), z.number().finite().min(0).max(180)]),
    feedback: z.array(learnerFeedback).min(2).max(8),
  }).strict().superRefine((value, context) => {
    if (value.min >= value.max) context.addIssue({code: 'custom', path: ['min'], message: '实验控制范围必须递增'});
    if (value.defaultValue < value.min || value.defaultValue > value.max)
      context.addIssue({code: 'custom', path: ['defaultValue'], message: '实验控制默认值必须在范围内'});
    if (value.defaultValue !== value.min)
      context.addIssue({code: 'custom', path: ['defaultValue'], message: '实验控制默认值必须等于最小值，才能与时间线初态和复位状态一致'});
    if (value.timeRange[0] >= value.timeRange[1])
      context.addIssue({code: 'custom', path: ['timeRange'], message: '实验控制时间映射必须递增'});
    const rawSteps = Math.floor((value.max - value.min) / value.step);
    const samples = Number.isSafeInteger(rawSteps) && rawSteps <= 2000
      ? Array.from({length: rawSteps + 1}, (_, index) => Number((value.min + index * value.step).toPrecision(12)))
      : Array.from({length: 257}, (_, index) => Number((value.min + (value.max - value.min) * index / 256).toPrecision(12)));
    if (samples.some(sample => value.feedback.filter(item => sample >= item.min && sample <= item.max).length !== 1))
      context.addIssue({code: 'custom', path: ['feedback'], message: '每个可达实验值必须恰好落入一个反馈区间，不能遗漏或重叠'});
  }),
  z.object({
    id: identifier,
    type: z.literal('button'),
    label: z.string().min(1).max(48),
    action: z.enum(['play', 'pause', 'reset', 'seek', 'play-from']),
    at: z.number().finite().min(0).max(180).optional(),
  }).strict().superRefine((value, context) => {
    if (['seek', 'play-from'].includes(value.action) !== (value.at !== undefined))
      context.addIssue({code: 'custom', path: ['at'], message: 'seek/play-from必须提供at，其他按钮不得提供at'});
  }),
]);
export const cinematicAssemblySchema = z
  .object({
    version: z.literal('assembly-v1'),
    placements: z
      .array(
        z.discriminatedUnion('mode', [
          z
            .object({
              mode: z.literal('relative'),
              node: identifier,
              reference: identifier,
              side: z.enum(['left', 'right', 'above', 'below', 'front', 'behind', 'offset']),
              gap: z.number().min(0).max(30).default(0.15),
              offset: vec3.default([0, 0, 0]),
            })
            .strict(),
          z
            .object({
              mode: z.literal('port'),
              node: identifier,
              reference: identifier,
              port: identifier,
              referencePort: identifier,
              gap: z.number().min(0).max(10).default(0),
              offset: vec3.default([0, 0, 0]),
            })
            .strict(),
          z
            .object({
              mode: z.literal('floor'),
              node: identifier,
              y: z.number().min(-100).max(100).default(-2.1),
            })
            .strict(),
        ]),
      )
      .max(60),
  })
  .strict();
export const cinematicSceneSchema = z
  .object({
    schemaVersion: z.literal('cinematic-v1'),
    title: z.string().min(2).max(100),
    subtitle: z.string().max(160),
    modelNote: z.string().max(160).optional(),
    duration: z.number().min(20).max(180),
    objectives: z
      .array(z.string().max(CINEMATIC_MAX_OBJECTIVE_LENGTH))
      .min(1)
      .max(CINEMATIC_MAX_OBJECTIVES),
    theme: z.object({
      background: color.default('#060b15'),
      accent: color.default('#5bdded'),
      secondary: color.default('#f6a755'),
      environment: z.enum(['studio', 'laboratory', 'space', 'circuit']).default('studio'),
    }),
    nodes: z.array(node).min(1).max(100),
    assembly: cinematicAssemblySchema.optional(),
    coverage: z
      .object({
        presentation: z.array(cinematicPresentationRequirementSchema).max(8).optional(),
        objects: z
          .array(
            z.object({
              name: z.string().min(1).max(180),
              nodes: z.array(identifier).min(1).max(12),
            }),
          )
          .max(24),
        interactions: z
          .array(
            z.object({
              description: z.string().min(1).max(180),
              chapter: z.number().int().min(0).max(9),
              targets: z.array(identifier).min(1).max(12),
              connections: z.array(identifier).max(12).optional(),
              controls: z.array(z.enum(cinematicPlayerControlNames)).min(1).max(8).optional(),
              properties: z
                .array(
                  z.enum([
                    'position',
                    'rotation',
                    'scale',
                    'opacity',
                    'emissive',
                    'explode',
                    'explore',
                    'transport',
                    'controls',
                    'domain',
                  ]),
                )
                .min(1)
                .max(8),
            }),
          )
          .max(CINEMATIC_MAX_INTERACTIONS),
      })
      .optional(),
    learnerControls: z.array(learnerControl).max(8).default([]),
    lab: z.object({
      model: processPackageSchema,
      bindings: z.array(z.object({node:identifier,property:z.enum(['opacity','emissive','colorMix','positionY','rotationY','rotationSpeedY','scale']),value:processExpressionSchema}).strict()).min(1).max(32),
      picks: z.array(z.object({node:identifier,view:z.string(),index:z.number().int().min(0).max(127)}).strict()).max(24).optional(),
    }).strict().optional(),
    connections: z
      .array(
        z.object({
          id: identifier,
          from: identifier,
          to: identifier,
          fromPort: identifier.optional(),
          toPort: identifier.optional(),
          via: z.array(vec3).max(12).default([]),
          color: color.default('#5bdded'),
          particles: z.number().int().min(0).max(40).default(10),
          speed: z.number().min(0.01).max(1).default(0.12),
          radius: z.number().min(0.006).max(0.1).default(0.018),
          label: z.string().max(48).optional(),
        }),
      )
      .max(60)
      .default([]),
    tracks: z
      .array(
        z.object({
          target: identifier,
          property: z.enum(['position', 'rotation', 'scale', 'opacity', 'emissive', 'explode']),
          easing: z.enum(['linear', 'smooth']).default('smooth'),
          keyframes: z.array(keyframe).min(2).max(24),
        }),
      )
      .max(100),
    shots: z
      .array(
        z.object({
          at: z.number().min(0).max(180),
          position: vec3,
          target: vec3,
          fov: z.number().min(20).max(80).default(42),
          frame: z
            .object({
              nodes: z.array(identifier).min(1).max(12),
              padding: z.number().finite().min(1.05).max(2).default(1.2),
              region: frameRegion.optional(),
            })
            .strict()
            .optional(),
        }),
      )
      .min(4)
      .max(20),
    chapters: z
      .array(
        z.object({
          at: z.number().min(0).max(180),
          title: z.string().min(2).max(40),
          caption: z.string().min(8).max(2000),
          kind: z.enum(['action', 'inspection', 'summary']).optional(),
          focus: z.array(identifier).max(8).default([]),
          question: z.string().max(160).optional(),
        }),
      )
      .min(4)
      .max(10),
  });

export const cinematicSchema = cinematicSceneSchema.superRefine((scene, context) => {
    const fail = (
      reason: CinematicSchemaIssueReason,
      path: (string | number)[],
      message: string,
      details: { parameterCode?: z.ZodIssue['code']; minimum?: number; maximum?: number } = {},
    ) => context.addIssue({ code: 'custom', message, path, params: { reason, ...details } });
    const duplicateIndex = (values: string[]) => {
      const seen = new Set<string>();
      return values.findIndex((value) => {
        if (seen.has(value)) return true;
        seen.add(value);
        return false;
      });
    };
    const ids = new Set(scene.nodes.map((item) => item.id));
    if (scene.lab) {
      try {
        const model = parseProcessScene(scene.lab.model.scene);
        if (!model.decisions?.length) throw Error('三维领域实验必须有学生决策，播放和相机控制不能代替');
        validateProcessExpressions(scene.lab.bindings,model);
        if (scene.lab.bindings.some(binding => !ids.has(binding.node))) throw Error('实验绑定引用未知三维对象');
        const keys = scene.lab.bindings.map(binding => binding.node + ':' + binding.property);
        if (new Set(keys).size !== keys.length) throw Error('同一对象属性的实验绑定不能重复');
        for (const pick of scene.lab.picks ?? [])
          if (!ids.has(pick.node) || !model.views.some(view => view.id === pick.view && view.pick)) throw Error('三维对象选择必须绑定真实可操作视图');
      } catch (error) {
        context.addIssue({code:'custom',path:['lab'],message:error instanceof Error ? error.message : String(error)});
      }
    }
    if (ids.size !== scene.nodes.length)
      fail(
        'node-id-duplicate',
        ['nodes', duplicateIndex(scene.nodes.map((item) => item.id)), 'id'],
        '节点 id 必须唯一',
      );
    const controlIds = scene.learnerControls.map(control => control.id);
    if (new Set(controlIds).size !== controlIds.length)
      fail('coverage-controls-invalid', ['learnerControls', duplicateIndex(controlIds), 'id'], '实验控制 id 必须唯一');
    for (const [index, control] of scene.learnerControls.entries()) {
      if (control.type === 'range' && control.timeRange[1] > scene.duration)
        fail('timeline-time-invalid', ['learnerControls', index, 'timeRange'], '实验控制时间映射不能超过场景时长');
      if (control.type === 'button' && control.at !== undefined && control.at > scene.duration)
        fail('timeline-time-invalid', ['learnerControls', index, 'at'], '实验控制按钮时间不能超过场景时长');
    }
    for (const [index, object] of (scene.coverage?.objects ?? []).entries()) {
      const missing = object.nodes.findIndex((id) => !ids.has(id));
      if (missing !== -1)
        fail(
          'coverage-object-node-missing',
          ['coverage', 'objects', index, 'nodes', missing],
          `需求实体 ${object.name} 的映射节点不存在`,
        );
    }
    for (const [index, requirement] of (scene.coverage?.presentation ?? []).entries()) {
      if (!hasCinematicPresentationContent(scene, requirement.surface))
        fail(
          'coverage-presentation-empty',
          ['coverage', 'presentation', index, 'surface'],
          `讲解区域 ${requirement.surface} 必须有真实内容，不能只声明已覆盖`,
        );
    }
    for (const [index, interaction] of (scene.coverage?.interactions ?? []).entries()) {
      const path = ['coverage', 'interactions', index];
      const missingTarget = interaction.targets.findIndex((id) => !ids.has(id));
      if (!scene.chapters[interaction.chapter] || missingTarget !== -1)
        fail(
          'coverage-interaction-reference-invalid',
          [
            ...path,
            ...(!scene.chapters[interaction.chapter] ? ['chapter'] : ['targets', missingTarget]),
          ],
          `需求交互 ${interaction.description} 的章节或节点不存在`,
        );
      const missingConnection =
        interaction.connections?.findIndex(
          (id) => !scene.connections.some((link) => link.id === id),
        ) ?? -1;
      if (missingConnection !== -1)
        fail(
          'coverage-interaction-connection-missing',
          [...path, 'connections', missingConnection],
          `需求交互 ${interaction.description} 的连接不存在`,
        );
      if (interaction.properties.includes('controls')) {
        const duplicateControl = duplicateIndex(interaction.controls ?? []);
        if (
          interaction.properties.length !== 1 ||
          !interaction.controls?.length ||
          duplicateControl !== -1
        )
          fail(
            'coverage-controls-invalid',
            [
              ...path,
              ...(interaction.properties.length !== 1
                ? ['properties']
                : ['controls', ...(duplicateControl === -1 ? [] : [duplicateControl])]),
            ],
            `播放器控件映射 ${interaction.description} 必须单独使用 properties:["controls"] 和不重复的真实 controls`,
          );
      } else if (interaction.controls) {
        fail(
          'coverage-controls-unexpected',
          [...path, 'controls'],
          `播放器 controls 只能用于独立的 controls 映射，不能代替模型动作：${interaction.description}`,
        );
      }
    }
    const placed = new Set<string>();
    for (const [index, placement] of (scene.assembly?.placements ?? []).entries()) {
      const path = ['assembly', 'placements', index];
      if (!ids.has(placement.node))
        fail('assembly-node-missing', [...path, 'node'], `装配节点 ${placement.node} 不存在`);
      if (placed.has(placement.node))
        fail(
          'assembly-node-duplicate',
          [...path, 'node'],
          `节点 ${placement.node} 只能声明一个装配位置`,
        );
      placed.add(placement.node);
      if (
        'reference' in placement &&
        (!ids.has(placement.reference) || placement.reference === placement.node)
      )
        fail(
          'assembly-reference-invalid',
          [...path, 'reference'],
          `装配参照 ${placement.reference} 必须存在且不同于自身`,
        );
    }
    for (const [index, item] of scene.nodes.entries()) {
      const path = ['nodes', index];
      if (item.surface && (!['box', 'sphere', 'cylinder', 'torus', 'plane', 'tube'].includes(item.kind) || item.surfaceText))
        fail('node-surface-invalid', [...path, 'surface'], '程序纹理仅支持基础网格，不能覆盖精细资产、点群或表面文字');
      if (item.surfaceText) {
        const aspect =
          Number(item.params.width ?? (item.kind === 'plane' ? 6 : 1)) /
          Number(item.params.height ?? (item.kind === 'plane' ? 6 : 1));
        if (
          !['box', 'plane'].includes(item.kind) ||
          aspect < 0.125 ||
          aspect > 8 ||
          (item.surfaceText.chapterTitle && item.surfaceText.lines.length > 3) ||
          scene.nodes.slice(0, index + 1).filter((value) => value.surfaceText).length > 8
        )
          fail(
            'node-surface-text-invalid',
            [...path, 'surfaceText'],
            '表面文字仅用于 box/plane；宽高比须在 0.125..8，每场最多八块；显示当前章节时最多三行固定文字',
          );
      }
      if (item.kind === 'model' && !item.model)
        fail('node-model-missing', [...path, 'model'], `模型 ${item.id} 缺少 model`);
      if (
        item.model &&
        item.assetRole &&
        !assetDefinition(item.model).roles.includes(item.assetRole)
      )
        fail(
          'node-asset-role-invalid',
          [...path, 'assetRole'],
          `模型 ${item.id} 的 assetRole 与真实资产能力不符`,
        );
      const paramsSchema =
        item.kind === 'model'
          ? item.model
            ? modelParams[item.model]
            : null
          : primitiveParams[item.kind];
      if (paramsSchema) {
        const checked = paramsSchema.safeParse(item.params);
        if (!checked.success)
          for (const issue of checked.error.issues)
            fail(
              'node-params-invalid',
              [
                ...path,
                'params',
                ...issue.path.filter(
                  (part): part is string | number =>
                    typeof part === 'string' || typeof part === 'number',
                ),
              ],
              `节点 ${item.id} 参数无效：${issue.message}`,
              {
                parameterCode: issue.code,
                ...('minimum' in issue &&
                typeof issue.minimum === 'number' &&
                Number.isFinite(issue.minimum)
                  ? { minimum: issue.minimum }
                  : {}),
                ...('maximum' in issue &&
                typeof issue.maximum === 'number' &&
                Number.isFinite(issue.maximum)
                  ? { maximum: issue.maximum }
                  : {}),
              },
            );
      }
      if (item.parent && !ids.has(item.parent))
        fail('node-parent-missing', [...path, 'parent'], `节点 ${item.id} 的父节点不存在`);
      const visited = new Set([item.id]);
      let parent = item.parent;
      while (parent) {
        if (visited.has(parent)) {
          fail('node-parent-cycle', [...path, 'parent'], `节点 ${item.id} 的层级形成循环`);
          break;
        }
        visited.add(parent);
        parent = scene.nodes.find((candidate) => candidate.id === parent)?.parent;
      }
      const scaleAxis = item.scale.findIndex((value) => value <= 0 || value > 25);
      if (scaleAxis !== -1)
        fail(
          'node-scale-invalid',
          [...path, 'scale', scaleAxis],
          `节点 ${item.id} 缩放必须为正且不超过25`,
        );
      if (item.kind === 'tube' && !item.connectionPath && (!item.points || item.points.length < 2))
        fail('tube-points-missing', [...path, 'points'], 'tube 需要至少两个路径点');
      if (item.curve && !['tube', 'points'].includes(item.kind))
        fail('node-curve-kind-invalid', [...path, 'curve'], '参数化曲线仅支持 tube 或 points 节点');
      const binding = item.connectionPath ?? item.followConnection?.connection;
      if (binding) {
        const field = item.connectionPath ? 'connectionPath' : 'followConnection';
        if (!scene.connections.some(connection => connection.id === binding))
          fail('node-path-binding-invalid', [...path, field], '路径绑定必须引用真实 connection id');
        if (item.parent || (item.connectionPath && (item.kind !== 'tube' || item.curve || item.followConnection || item.rotation.some(value => value !== 0) || item.scale.some(value => value !== 1))) ||
          (item.followConnection && ['tube', 'group', 'plane', 'points'].includes(item.kind)))
          fail('node-path-binding-invalid', [...path, field], '连接路径使用无 parent 的世界坐标；connectionPath 仅支持无 curve、无运动绑定、单位旋转缩放的 tube，followConnection 仅支持独立实体网格');
        if (item.followConnection && (item.followConnection.end <= item.followConnection.start || item.followConnection.end > scene.duration))
          fail('node-path-binding-invalid', [...path, field], '路径运动必须 start < end <= duration');
        if (scene.assembly?.placements.some(placement => placement.node === item.id))
          fail('node-path-binding-invalid', [...path, field], '路径绑定拥有自身位置，不可同时给该节点设置 assembly placement');
      }
    }
    if (new Set(scene.connections.map((item) => item.id)).size !== scene.connections.length)
      fail(
        'connection-id-duplicate',
        ['connections', duplicateIndex(scene.connections.map((item) => item.id)), 'id'],
        '连接 id 必须唯一',
      );
    for (const [index, connection] of scene.connections.entries())
      if (!ids.has(connection.from) || !ids.has(connection.to) || connection.from === connection.to)
        fail(
          'connection-endpoint-invalid',
          ['connections', index, !ids.has(connection.from) ? 'from' : 'to'],
          '连接端点必须存在且不同',
        );
    if (
      new Set(scene.tracks.map((item) => item.target + ':' + item.property)).size !==
      scene.tracks.length
    )
      fail(
        'track-property-duplicate',
        [
          'tracks',
          duplicateIndex(scene.tracks.map((item) => item.target + ':' + item.property)),
          'property',
        ],
        '同一对象的属性只能有一条轨道',
      );
    for (const [index, track] of scene.tracks.entries()) {
      const path = ['tracks', index];
      if (!ids.has(track.target))
        fail('track-target-missing', [...path, 'target'], `轨道目标 ${track.target} 不存在`);
      const target = scene.nodes.find((item) => item.id === track.target);
      if (track.property === 'explode' && target?.kind !== 'model')
        fail(
          'track-explode-target-invalid',
          [...path, 'property'],
          '拆解轨道只能用于支持拆解的精细模型',
        );
      if (track.property === 'emissive' && target?.kind === 'points')
        fail(
          'track-emissive-target-invalid',
          [...path, 'property'],
          '粒子点使用color和opacity，不支持emissive轨道',
        );
      const vectors = ['position', 'rotation', 'scale'].includes(track.property);
      const wrongDimension = track.keyframes.findIndex(
        (key) => Array.isArray(key.value) !== vectors,
      );
      if (wrongDimension !== -1)
        fail(
          'track-value-dimension',
          [...path, 'keyframes', wrongDimension, 'value'],
          `轨道 ${track.property} 数值维度错误`,
        );
      const invalidTime = track.keyframes.findIndex(
        (key, index) =>
          key.at > scene.duration || (index > 0 && key.at <= track.keyframes[index - 1].at),
      );
      if (invalidTime !== -1)
        fail(
          'track-time-invalid',
          [...path, 'keyframes', invalidTime, 'at'],
          '轨道关键帧必须按时间严格递增且在时长内',
        );
      const invalidScale =
        track.property === 'scale'
          ? track.keyframes.findIndex(
              (key) =>
                Array.isArray(key.value) && key.value.some((value) => value <= 0 || value > 25),
            )
          : -1;
      if (invalidScale !== -1) {
        const value = track.keyframes[invalidScale].value as number[];
        fail(
          'track-scale-invalid',
          [
            ...path,
            'keyframes',
            invalidScale,
            'value',
            value.findIndex((axis) => axis <= 0 || axis > 25),
          ],
          '缩放轨道必须为正且不超过25',
        );
      }
      const invalidUnit = ['opacity', 'explode'].includes(track.property)
        ? track.keyframes.findIndex(
            (key) => typeof key.value === 'number' && (key.value < 0 || key.value > 1),
          )
        : -1;
      if (invalidUnit !== -1)
        fail(
          'track-unit-value-invalid',
          [...path, 'keyframes', invalidUnit, 'value'],
          '透明度与拆解轨道必须在0至1之间',
        );
      const invalidEmissive =
        track.property === 'emissive'
          ? track.keyframes.findIndex(
              (key) => typeof key.value === 'number' && (key.value < 0 || key.value > 4),
            )
          : -1;
      if (invalidEmissive !== -1)
        fail(
          'track-emissive-value-invalid',
          [...path, 'keyframes', invalidEmissive, 'value'],
          '亮度轨道必须在0至4之间',
        );
    }
    for (const field of ['shots', 'chapters'] as const) {
      const entries = scene[field];
      if (entries.length && entries[0].at !== 0)
        fail('timeline-start-invalid', [field, 0, 'at'], '第一镜头和章节必须从0开始');
      const invalidTime = entries.findIndex(
        (item, index) =>
          item.at > scene.duration || (index > 0 && item.at <= entries[index - 1].at),
      );
      if (invalidTime !== -1)
        fail('timeline-time-invalid', [field, invalidTime, 'at'], '镜头和章节必须按时间严格递增');
    }
    for (const [index, chapter] of scene.chapters.entries()) {
      const missing = chapter.focus.findIndex((id) => !ids.has(id));
      if (missing !== -1)
        fail(
          'chapter-focus-missing',
          ['chapters', index, 'focus', missing],
          '章节聚焦节点必须存在',
        );
    }
    for (const [index, shot] of scene.shots.entries())
      if (shot.frame) {
        const duplicate = duplicateIndex(shot.frame.nodes);
        if (duplicate !== -1)
          fail(
            'frame-node-duplicate',
            ['shots', index, 'frame', 'nodes', duplicate],
            '取景主体不能重复',
          );
        for (const [nodeIndex, id] of shot.frame.nodes.entries()) {
          const subject = scene.nodes.find((node) => node.id === id);
          if (
            !subject ||
            ['group', 'plane', 'points'].includes(subject.kind) ||
            subject.role === 'decoration'
          )
            fail(
              'frame-node-invalid',
              ['shots', index, 'frame', 'nodes', nodeIndex],
              `取景主体 ${id} 必须是具体教学实体，不得包含地板、背景或装饰`,
            );
        }
      }
    const customParts = scene.nodes.filter(item => ['box', 'sphere', 'cylinder', 'torus', 'tube'].includes(item.kind) && item.role !== 'decoration' && item.represents && Object.keys(item.params).length);
    const customRelations = customParts.filter(item => item.parent).length + (scene.assembly?.placements.filter(item => item.mode !== 'floor').length ?? 0);
    const customDetail = customParts.some(item => item.surface || (item.points?.length ?? 0) >= 8 || item.params.phiLength || item.params.thetaLength || item.params.arc);
    if (scene.nodes.filter((item) => item.kind === 'model').length < 1 && !(customParts.length >= 5 && customRelations >= 2 && customDetail))
      fail('model-count-minimum', ['nodes'], '使用合适的精细模型，或至少五个有尺寸与教学含义的自定义部件、两条结构关系和真实纹理/剖面/曲线细节；不能只有简单几何拓扑或强塞无关资产');
    if (scene.nodes.filter((item) => item.kind === 'model').length > 12)
      fail(
        'model-count-maximum',
        ['nodes'],
        '单场景精细模型上限12，重复小部件请使用基础几何或points',
      );
    if (new Set(scene.shots.map((shot) => JSON.stringify(shot.position))).size < 3)
      fail('camera-position-diversity', ['shots'], '至少需要三种实质不同的镜头位置');
    const closeShot = scene.shots.findIndex(
      (shot) => Math.hypot(...shot.position.map((value, index) => value - shot.target[index])) < (shot.frame ? 1e-4 : 3),
    );
    if (closeShot !== -1)
      fail('camera-distance-minimum', ['shots', closeShot, 'position'], scene.shots[closeShot].frame
        ? '自动取景镜头必须提供明确观察方向，机位不能与目标重合' : '镜头离目标必须至少3单位');
    for (let i = 1; i < scene.shots.length; i++) {
      const a = scene.shots[i - 1].position.map(
        (value, index) => value - scene.shots[i - 1].target[index],
      );
      const b = scene.shots[i].position.map((value, index) => value - scene.shots[i].target[index]);
      const delta = b.map((value, index) => value - a[index]),
        square = delta.reduce((sum, value) => sum + value * value, 0);
      const closest = square
        ? Math.min(
            1,
            Math.max(0, -a.reduce((sum, value, index) => sum + value * delta[index], 0) / square),
          )
        : 0;
      if (Math.hypot(...a.map((value, index) => value + delta[index] * closest)) < (scene.shots[i - 1].frame && scene.shots[i].frame ? 1e-4 : 3))
        fail(
          'camera-transition-distance-minimum',
          ['shots', i, 'position'],
          `镜头 ${i - 1} 到 ${i} 的过渡穿过目标，请增加中间机位`,
        );
    }
    if (
      scene.tracks.filter(
        (track) => new Set(track.keyframes.map((key) => JSON.stringify(key.value))).size > 1,
      ).length < (scene.chapters.some((chapter) => chapter.kind) ? 1 : 2) &&
      !scene.connections.some((connection) => connection.particles > 0) &&
      !scene.nodes.some(node => node.followConnection) &&
      // Experiment consequences are executed by the domain quality gate and
      // real browser. The protocol must not demand a second authored movie
      // to duplicate that independent source of geometric state.
      !scene.lab
    )
      fail(
        'scene-motion-missing',
        ['tracks'],
        '至少两条轨道必须包含真实状态变化；显式章节阶段允许一条真实过程轨道，运输场景也可用真实光点连接',
      );
  });

export type CinematicScene = z.infer<typeof cinematicSchema>;
export type CinematicNode = CinematicScene['nodes'][number];

/** Accept rounded spellings of a full turn. Twelve-digit checkpoint
 * stabilization can turn 2π into 6.28318530718; that harmless tail must not
 * trigger another model call or make an otherwise valid saved scene fail. */
export function normalizeCinematicAngleParameters(value:unknown):unknown{
  if(!value||typeof value!=='object')return value;
  const normalized=structuredClone(value) as Record<string,unknown>;
  if(!Array.isArray(normalized.nodes))return normalized;
  for(const node of normalized.nodes){
    if(!node||typeof node!=='object'||!node.params||typeof node.params!=='object'||Array.isArray(node.params))continue;
    const maxima:Record<string,number>=node.kind==='sphere'
      ?{phiStart:2*Math.PI,phiLength:2*Math.PI,thetaStart:Math.PI,thetaLength:Math.PI}
      :node.kind==='cylinder'?{thetaStart:2*Math.PI,thetaLength:2*Math.PI}
      :node.kind==='torus'?{arc:2*Math.PI}:{};
    for(const [field,maximum] of Object.entries(maxima)){
      const actual=node.params[field];
      if(typeof actual==='number'&&actual>maximum&&actual-maximum<=1e-4)node.params[field]=maximum;
    }
    if(node.kind==='sphere'){
      const start=node.params.thetaStart??0,length=node.params.thetaLength??Math.PI;
      if(typeof start==='number'&&typeof length==='number'&&start<Math.PI&&
        start+length>Math.PI&&start+length-Math.PI<=1e-4)node.params.thetaLength=Math.PI-start;
    }
  }
  return normalized;
}

export function parseCinematicScene(value: unknown): CinematicScene {
  if (!value || typeof value !== 'object') return cinematicSchema.parse(value);
  const normalized = normalizeCinematicAngleParameters(value) as Record<string, unknown>;
  if (Array.isArray(normalized.nodes))
    for (const item of normalized.nodes) {
      if (
        !item ||
        typeof item !== 'object' ||
        !item.params ||
        typeof item.params !== 'object' ||
        Array.isArray(item.params)
      )
        continue;
      for (const field of ['position', 'rotation', 'scale', 'color'])
        if (item[field] === undefined && Object.hasOwn(item.params, field)) {
          item[field] = item.params[field];
          delete item.params[field];
        }
      if (item.kind === 'tube' && item.points === undefined && Array.isArray(item.params.points)) {
        item.points = item.params.points;
        delete item.params.points;
      }
    }
  return cinematicSchema.parse(normalized);
}

export function extractCinematicScene(html: string): CinematicScene | null {
  const match = html.match(
    /<script\b(?=[^>]*\btype\s*=\s*["']application\/json["'])(?=[^>]*\bid\s*=\s*["']cinematic-scene["'])[^>]*>([\s\S]*?)<\/script\s*>/i,
  );
  if (!match) return null;
  try {
    return parseCinematicScene(JSON.parse(match[1]));
  } catch {
    return null;
  }
}
