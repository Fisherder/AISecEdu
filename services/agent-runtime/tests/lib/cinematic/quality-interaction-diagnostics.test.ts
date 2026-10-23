import { describe, expect, it } from 'vitest';
import {
  checkCinematicQuality,
  type CinematicInteractionRequirement,
} from '@/lib/cinematic/quality';
import { parseCinematicScene, type CinematicScene } from '@/lib/cinematic/schema';
import { sceneFixture } from '../../fixtures/cinematic';

const description = '帧标记进入逻辑分区';
const fixture = () =>
  parseCinematicScene({
    ...sceneFixture(),
    nodes: [
      {
        id: 'frame-marker',
        kind: 'box',
        role: 'logic',
        represents: '帧标记',
        params: { width: 0.4, height: 0.4, depth: 0.4 },
      },
      {
        id: 'local-info-marker',
        kind: 'box',
        role: 'logic',
        represents: '局部信息标记',
        position: [3, 0, 0],
      },
      {
        id: 'support',
        kind: 'model',
        model: 'processor',
        role: 'support',
        represents: '支撑结构',
        position: [0, -4, 0],
      },
    ],
    tracks: [
      {
        target: 'frame-marker',
        property: 'position',
        easing: 'linear',
        keyframes: [
          { at: 0, value: [0, 0, 0] },
          { at: 15, value: [0, 0, 0] },
          { at: 30, value: [2, 0, 0] },
          { at: 60, value: [2, 0, 0] },
        ],
      },
    ],
    shots: sceneFixture().shots.map((shot) => ({
      ...shot,
      frame: { nodes: ['frame-marker', 'local-info-marker', 'support'], padding: 1.2 },
    })),
    chapters: [0, 15, 30, 45].map((at) => ({
      at,
      title: '结构观察',
      caption: '观察帧标记和逻辑分区的对应关系',
      kind: 'inspection',
      focus: ['frame-marker'],
    })),
    coverage: {
      objects: [],
      interactions: [
        { description, chapter: 0, targets: ['frame-marker'], properties: ['position'] },
      ],
    },
  });
const check = (
  scene: CinematicScene,
  kind: CinematicInteractionRequirement['kind'] = 'state-change',
) =>
  checkCinematicQuality(scene, {
    requireComposition: false,
    interactionRequirements: [{ description, kind }],
  });
const failure = (scene: CinematicScene, kind?: CinematicInteractionRequirement['kind']) => {
  const original = structuredClone(scene),
    report = check(scene, kind);
  expect(report.status).toBe('FAIL');
  expect(scene).toEqual(original);
  const evidence = report.interactionEvidence.find((item) => item.description === description)!;
  expect(evidence.status).toBe('FAIL');
  expect(evidence.kind).toBe(kind ?? 'state-change');
  expect(evidence.tracks).toEqual([]);
  expect(evidence.diagnostics).toBeDefined();
  return evidence.diagnostics!;
};

describe('additive bounded cinematic interaction failure diagnostics', () => {
  it('reports every failed coverage mapping and the actual other chapter without repairing it', () => {
    const scene = fixture();
    scene.coverage!.interactions.unshift({
      description: '观察已有结构',
      chapter: 0,
      targets: ['support'],
      properties: ['explore'],
    });
    scene.coverage!.interactions.push({
      description,
      chapter: 2,
      targets: ['frame-marker'],
      properties: ['position'],
    });
    const diagnostic = failure(scene);
    expect(diagnostic).toMatchObject({
      chapterIndexBase: 0,
      motionSource: 'scene-tracks-only',
      visibilityBasis: 'existing-quality-samples-not-raster',
      omittedMappings: 0,
    });
    expect(
      diagnostic.mappings.map((mapping) => [
        mapping.coverageIndex,
        mapping.chapter,
        mapping.start,
        mapping.end,
      ]),
    ).toEqual([
      [1, 0, 0, 15],
      [2, 2, 30, 45],
    ]);
    for (const mapping of diagnostic.mappings) {
      expect(mapping).toMatchObject({
        targets: ['frame-marker'],
        properties: ['position'],
        associatedTrackCount: 1,
        mappedTrackCount: 1,
        visibleMappedTrackCount: 0,
      });
      expect(mapping.tracks[0]).toMatchObject({
        trackIndex: 0,
        target: 'frame-marker',
        property: 'position',
        magnitude: 0,
        visibleMagnitude: 0,
        visibleChangeAccepted: false,
        otherVisibleChangeChapters: [1],
      });
      expect(mapping.tracks[0].reasons).toContain('no-change-in-chapter');
    }
  });

  it('preserves PASS and omits failure diagnostics when the original predicate accepts the mapping', () => {
    const scene = fixture();
    scene.coverage!.interactions[0].chapter = 1;
    const report = check(scene);
    expect(report.status).toBe('PASS');
    expect(report.interactionEvidence[0]).toEqual({
      description,
      kind: 'state-change',
      status: 'PASS',
      chapter: 1,
      tracks: ['frame-marker:position'],
      connections: [],
    });
  });

  it('distinguishes missing coverage, missing related tracks and an unmapped property', () => {
    const scene = fixture();
    scene.coverage!.interactions = [];
    expect(failure(scene)).toMatchObject({ reasons: ['coverage-missing'], mappings: [] });
    const missing = fixture();
    missing.tracks[0].target = 'local-info-marker';
    expect(failure(missing).mappings[0]).toMatchObject({
      associatedTrackCount: 0,
      tracks: [],
      reasons: expect.arrayContaining(['no-associated-track']),
    });
    const property = fixture();
    property.coverage!.interactions[0].properties = ['opacity'];
    expect(failure(property).mappings[0]).toMatchObject({
      associatedTrackCount: 1,
      mappedTrackCount: 0,
      reasons: expect.arrayContaining(['no-mapped-track']),
    });
    expect(failure(property).mappings[0].tracks[0]).toMatchObject({
      property: 'position',
      propertyMapped: false,
      reasons: expect.arrayContaining(['property-not-mapped']),
    });
  });

  it('reports ancestor-hidden movement without calling it visible action', () => {
    const scene = fixture();
    scene.coverage!.interactions[0].chapter = 1;
    scene.nodes.push({
      ...scene.nodes[0],
      id: 'hidden-parent',
      kind: 'group',
      params: {},
      opacity: 0,
    });
    scene.nodes[0].parent = 'hidden-parent';
    const track = failure(scene).mappings[0].tracks[0];
    expect(track).toMatchObject({
      magnitude: 2,
      meetsChangeThreshold: true,
      visibleMagnitude: 0,
      visibleSampleCount: 0,
      opacityEligibleSampleCount: 0,
      visibleChangeAccepted: false,
      otherVisibleChangeChapters: [],
    });
    expect(track.reasons).toEqual(
      expect.arrayContaining(['hidden-at-all-samples', 'not-visible-in-chapter']),
    );
  });

  it('distinguishes an opaque offscreen target from one hidden by opacity', () => {
    const scene = fixture();
    scene.coverage!.interactions[0].chapter = 1;
    scene.shots.forEach((shot) => {
      delete shot.frame;
    });
    scene.tracks[0].keyframes = [
      { at: 0, value: [190, 0, 0] },
      { at: 60, value: [195, 0, 0] },
    ];
    const track = failure(scene).mappings[0].tracks[0];
    expect(track.opacityEligibleSampleCount).toBe(track.sampleCount);
    expect(track.reasons).toContain('not-visible-in-chapter');
    expect(track.reasons).not.toContain('hidden-at-all-samples');
  });

  it('rejects movement completed while hidden even if the marker becomes visible later', () => {
    const scene = fixture();
    scene.tracks[0].keyframes = [
      { at: 0, value: [0, 0, 0] },
      { at: 4, value: [2, 0, 0] },
      { at: 60, value: [2, 0, 0] },
    ];
    scene.tracks.push({
      target: 'frame-marker',
      property: 'opacity',
      easing: 'linear',
      keyframes: [
        { at: 0, value: 0 },
        { at: 8, value: 0 },
        { at: 9, value: 1 },
        { at: 60, value: 1 },
      ],
    });
    const track = failure(scene).mappings[0].tracks.find((track) => track.property === 'position')!;
    expect(track).toMatchObject({
      magnitude: 2,
      visibleMagnitude: 0,
      meetsChangeThreshold: true,
      visibleChangeAccepted: false,
    });
    expect(track.visibleSampleCount).toBeGreaterThanOrEqual(2);
    expect(track.reasons).toContain('no-change-while-visible');
  });

  it('reports insufficient visible samples rather than crediting a final reveal', () => {
    const scene = fixture();
    scene.tracks[0].keyframes = [
      { at: 0, value: [0, 0, 0] },
      { at: 15, value: [1, 0, 0] },
    ];
    scene.tracks.push({
      target: 'frame-marker',
      property: 'opacity',
      easing: 'linear',
      keyframes: [
        { at: 0, value: 0 },
        { at: 14.99, value: 0 },
        { at: 15, value: 1 },
      ],
    });
    const track = failure(scene).mappings[0].tracks[0];
    expect(track.visibleSampleCount).toBe(1);
    expect(track.reasons).toContain('insufficient-visible-samples');
  });

  it.each([0, 0.119999, 0.12, 0.120001])(
    'keeps the original position threshold at displacement %s',
    (delta) => {
      const scene = fixture();
      scene.tracks[0].keyframes = [
        { at: 0, value: [0, 0, 0] },
        { at: 15, value: [delta, 0, 0] },
      ];
      const evidence = check(scene).interactionEvidence[0];
      expect(evidence.status).toBe(delta >= 0.12 ? 'PASS' : 'FAIL');
      if (delta < 0.12) {
        const track = failure(scene).mappings[0].tracks[0];
        expect(track.threshold).toBe(0.12);
        expect(track.magnitude).toBe(delta);
        expect(track.reasons).toContain(
          delta === 0 ? 'no-change-in-chapter' : 'change-below-threshold',
        );
      }
    },
  );

  it('keeps unsupported PCB explode separate from a missing timeline track on a supported asset', () => {
    const scene = fixture();
    Object.assign(scene.nodes[0], { kind: 'model', model: 'circuit-board', params: {} });
    scene.tracks[0] = {
      target: 'frame-marker',
      property: 'explode',
      easing: 'linear',
      keyframes: [
        { at: 0, value: 0 },
        { at: 15, value: 1 },
      ],
    };
    scene.coverage!.interactions[0].properties = ['explode'];
    expect(check(scene, 'structural-change').issues.map((issue) => issue.code)).toContain(
      'unsupported-asset-action',
    );
    expect(failure(scene, 'structural-change').mappings[0].tracks[0]).toMatchObject({
      supported: false,
      magnitude: 1,
      meetsChangeThreshold: true,
      visibleChangeAccepted: false,
      otherVisibleChangeChapters: [],
      reasons: expect.arrayContaining(['unsupported-action']),
    });
    scene.nodes[0].model = 'processor';
    scene.tracks = [];
    expect(failure(scene, 'structural-change').mappings[0]).toMatchObject({
      tracks: [],
      reasons: expect.arrayContaining(['no-associated-track']),
    });
  });

  it.each(['emissive', 'explore'] as const)(
    'still rejects %s as structural-change evidence',
    (property) => {
      const scene = fixture();
      scene.tracks[0] = {
        target: 'frame-marker',
        property: 'emissive',
        easing: 'linear',
        keyframes: [
          { at: 0, value: 0 },
          { at: 15, value: 1 },
        ],
      };
      scene.coverage!.interactions[0].properties = [property];
      const mapping = failure(scene, 'structural-change').mappings[0];
      expect(mapping.reasons).toContain(
        property === 'explore' ? 'explore-not-process' : 'no-kind-compatible-track',
      );
      expect(mapping.tracks[0].kindCompatible).toBe(false);
    },
  );

  it('reports only bounded structural fields, not original text or malformed identifiers', () => {
    const scene = fixture(),
      privateText = 'PRIVATE_SENTINEL credential=https://example.invalid/?token=secret';
    scene.title = scene.subtitle = privateText;
    scene.nodes.forEach((node) => {
      node.detail = node.label = node.represents = privateText;
    });
    scene.chapters.forEach((chapter) => {
      chapter.title = chapter.caption = privateText;
    });
    scene.coverage!.interactions[0].description = privateText;
    const report = checkCinematicQuality(scene, {
      requireComposition: false,
      interactionRequirements: [{ description: privateText, kind: 'state-change' }],
    });
    const serialized = JSON.stringify(report.interactionEvidence[0].diagnostics);
    expect(serialized).not.toContain('PRIVATE_SENTINEL');
    expect(serialized).not.toContain('credential');
    scene.nodes[0].id = 'invalid/id?token=secret';
    scene.tracks[0].target = scene.nodes[0].id;
    scene.coverage!.interactions[0].targets = [scene.nodes[0].id];
    scene.shots.forEach((shot) => {
      shot.frame!.nodes[0] = scene.nodes[0].id;
    });
    scene.chapters.forEach((chapter) => {
      chapter.focus = [scene.nodes[0].id];
    });
    const redacted = checkCinematicQuality(scene, {
      requireComposition: false,
      interactionRequirements: [{ description: privateText, kind: 'state-change' }],
    }).interactionEvidence[0].diagnostics!;
    expect(redacted.mappings[0].targets).toEqual([]);
    expect(redacted.mappings[0].tracks[0].target).toBeNull();
    expect(JSON.stringify(redacted)).not.toContain('secret');
  });

  it('caps detail while preserving all schema-valid mappings and explicit omitted counts', () => {
    const scene = fixture();
    scene.nodes.push({ ...scene.nodes[0], id: 'marker-root', kind: 'group', params: {} });
    scene.tracks = Array.from({ length: 12 }, (_, index) => {
      const id = 'marker-' + index;
      scene.nodes.push({ ...scene.nodes[0], id, parent: 'marker-root' });
      return {
        target: id,
        property: 'position',
        easing: 'linear',
        keyframes: [
          { at: 0, value: [0, 0, 0] },
          { at: 60, value: [0, 0, 0] },
        ],
      };
    });
    scene.coverage!.interactions = Array.from({ length: 24 }, (_, index) => ({
      description,
      chapter: index % 4,
      targets: ['marker-root'],
      properties: ['position'],
    }));
    const diagnostic = failure(scene);
    expect(diagnostic.mappings).toHaveLength(24);
    expect(diagnostic.omittedMappings).toBe(0);
    for (const mapping of diagnostic.mappings) {
      expect(mapping.associatedTrackCount).toBe(12);
      expect(mapping.tracks).toHaveLength(8);
      expect(mapping.omittedTracks).toBe(4);
      expect(mapping.tracks.every((track) => track.otherVisibleChangeChapters.length <= 9)).toBe(
        true,
      );
    }
    expect(JSON.stringify(diagnostic).length).toBeLessThan(150000);
  });
});
