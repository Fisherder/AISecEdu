import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileCoursewareSlide } from '@/lib/courseware/compiler';
import { coursewareSlideDataSchema, type CoursewareAsset } from '@/lib/courseware/schema';

const legacy = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/lesson-publish', () => ({ lessonToScenes: legacy }));
vi.mock('@/lib/server/integration-metrics', () => ({ recordIntegrationRequest: vi.fn() }));
import { POST } from '@/app/api/integration/classrooms/render/route';

const token = 'synthetic-static-classroom-credential';
const classroomId = 'ordinary-fixture';
const notes = 'PRIVATE-SPEAKER-NOTES '.repeat(9);
const theme = {
  name: 'PRIVATE-THEME', background: '#ffffff', foreground: '#101010',
  muted: '#333333', accent: '#2356a8', secondary: '#376042', surface: '#eeeeee',
};
const comparison = {
  kind: 'comparison',
  columns: ['来源', '观察'],
  rows: [{ label: '根', values: ['土壤', '吸收水分'] }, { label: '茎', values: ['根', '向上运输'] }],
};
const chart = {
  kind: 'chart', chartType: 'bar', labels: ['第一组', '第二组'],
  series: [{ name: '观察次数', values: [2, 3] }], unit: '次数', basis: '课堂示例数据', illustrative: true,
};

function artifact(id: string, visual: unknown = comparison, assets: CoursewareAsset[] = []) {
  const studio = coursewareSlideDataSchema.parse({
    theme, assets,
    page: {
      id, schema: 'courseware-page-v2', title: '植物与水分', objective: '理解根和茎的作用',
      role: 'explanation', composition: 'wide', takeaway: '水分由根向茎运输', durationSeconds: 60,
      visual, speakerNotes: notes, evidence: [{ sourceId: 'PRIVATE-EVIDENCE', claim: 'PRIVATE-CLAIM' }],
      layout: {
        title: { box: { left: 30, top: 28, width: 940, height: 60 }, fontSize: 32 },
        takeaway: { box: { left: 30, top: 98, width: 940, height: 45 }, fontSize: 22 },
        supporting: [],
        visual: { left: 40, top: 155, width: 920, height: 360 },
      },
    },
  });
  const { elements, background } = compileCoursewareSlide(studio);
  return {
    type: 'slide', title: 'PRIVATE-ARTIFACT', actions: [{ type: 'PRIVATE-ACTION' }],
    outline: { title: 'PRIVATE-OUTLINE', type: 'interactive' },
    content: { elements, background, studio, remark: 'PRIVATE-REMARK', html: '<script>PRIVATE-HTML</script>' },
  };
}

function lesson(...artifacts: unknown[]) {
  return { title: '植物观察课', description: 'PRIVATE-DESCRIPTION', updatedAt: 15,
    generatedAgentConfigs: [{ name: 'PRIVATE-AGENT' }], artifacts };
}

function render(lesson: unknown, mode: unknown = 'ordinary-static', secret = token) {
  vi.stubEnv('AISECEDU_SERVICE_SECRET', token);
  return POST(new NextRequest('http://localhost/api/integration/classrooms/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-AISecEdu-Service-Token': secret },
    body: JSON.stringify({ classroomId, lesson, ...(mode === null ? {} : { mode }) }),
  }));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('ordinary static classroom rendering', () => {
  it('recompiles ordinary slides, preserves verified saved geometry and returns stable display-only data', async () => {
    const first = artifact('plant-a');
    first.content.elements.find(element => element.id === 'page-title')!.top = 36;
    const second = artifact('plant-b', chart);
    const payload = lesson(first, second);
    const response = await render(payload);
    expect(response.status).toBe(200);
    const output = await response.json();
    expect(output).toEqual(await (await render(payload)).json());
    const { stage, scenes } = output.result;
    expect(stage).toEqual({ id: classroomId, name: payload.title, createdAt: 15, updatedAt: 15 });
    expect(scenes).toHaveLength(2);
    expect(scenes.map((scene: any) => [scene.id, scene.stageId, scene.type, scene.order])).toEqual([
      ['ordinary-fixture-plant-a', classroomId, 'slide', 1],
      ['ordinary-fixture-plant-b', classroomId, 'slide', 2],
    ]);
    for (const scene of scenes) {
      expect(Object.keys(scene.content).sort()).toEqual(['canvas', 'type']);
      expect(scene).not.toHaveProperty('actions');
      expect(scene).not.toHaveProperty('multiAgent');
    }
    expect(scenes[0].content.canvas.elements.find((element: any) => element.id === 'page-title').top).toBe(36);
    expect(scenes[1].content.canvas.elements).toContainEqual(expect.objectContaining({ type: 'chart' }));
    expect(JSON.stringify(output)).not.toMatch(/PRIVATE-|<script>/);
    expect(legacy).not.toHaveBeenCalled();
  });

  it('accepts an embedded raster image and drops its private attribution metadata', async () => {
    const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#225544' } }).png().toBuffer();
    const visual = { kind: 'image', assetId: 'leaf', alt: '植物叶片的色块示意', caption: '观察颜色和形态' };
    const asset = {
      id: 'leaf', src: 'data:image/png;base64,' + bytes.toString('base64'),
      source: 'PRIVATE-SOURCE', alt: 'PRIVATE-ALT', width: 8, height: 8,
    };
    const response = await render(lesson(artifact('leaf', visual, [asset])));
    expect(response.status).toBe(200);
    const output = await response.json();
    expect(JSON.stringify(output)).not.toMatch(/PRIVATE-/);
    const element = output.result.scenes[0].content.canvas.elements.find((entry: any) => entry.type === 'image');
    expect(element.src).toMatch(/^data:image\/png;base64,/);
    expect((await sharp(Buffer.from(element.src.split(',')[1], 'base64')).metadata()).width).toBe(8);
    const forged = artifact('leaf', visual, [asset]);
    forged.content.studio.assets[0].src = 'https://outside.invalid/file.png';
    expect((await render(lesson(forged))).status).toBe(422);
    expect((await render(lesson(artifact('leaf', visual, [{ ...asset, src: 'data:image/png;base64,AA==' }])))).status).toBe(422);
  });

  it('fails the whole lesson when a page is active, unrelated, duplicated or has unsourced canvas edits', async () => {
    const active = artifact('animated');
    active.content.studio.page.beats = [{
      id: 'beat', title: '观察', explanation: '比较两张表格中的数据',
      focusIds: [], activeEdgeIds: [], nodeStates: [], codeLines: [], chartFocusIndexes: [],
      termFocusIndexes: [], comparisonRowIndexes: [], objectStates: [],
    }];
    const extra = artifact('extra');
    extra.content.elements.push({ ...extra.content.elements[0], id: 'fake' });
    const script = artifact('script');
    script.content.studio.page.title = '<script>alert(1)</script>';
    script.content.elements = compileCoursewareSlide(script.content.studio).elements;
    for (const invalid of [
      active, extra, script, { ...artifact('quiz'), type: 'quiz' }, artifact('original'),
      artifact('link', { ...chart, labels: ['https://outside.invalid', '第二组'] }),
    ]) {
      const response = await render(lesson(artifact('original'), invalid));
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ success: false, error: 'Unable to render classroom' });
    }
  });

  it('requires service credentials and retains the legacy no-mode renderer', async () => {
    expect((await render(lesson(artifact('plant')), 'ordinary-static', 'wrong')).status).toBe(401);
    expect((await render(lesson(artifact('plant')), 'unknown-mode')).status).toBe(400);
    const payload = lesson(artifact('plant'));
    legacy.mockReturnValue({ stage: { id: 'legacy' }, scenes: [] });
    expect((await render(payload, null)).status).toBe(200);
    expect(legacy).toHaveBeenCalledWith(payload, classroomId);
  });
});
