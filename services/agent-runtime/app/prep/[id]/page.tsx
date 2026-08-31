'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  IntegratedLessonPreview,
  LessonSlidePreview,
} from '@/components/integrated-lesson-preview';
import type { Lesson, LessonArtifact } from '@/lib/types/lesson';
import { patchHtmlForIframe } from '@/lib/utils/iframe';

const INTEGRATED = process.env.NEXT_PUBLIC_AISECEDU_INTEGRATED === 'true';

const TYPES: { id: string; label: string }[] = [
  { id: 'slide', label: '课件' },
  { id: 'diagram', label: '示意图' },
  { id: 'simulation', label: '模拟实验' },
  { id: 'code', label: '编程练习' },
  { id: 'procedural-skill', label: '流程演练' },
  { id: 'quiz', label: '知识测验' },
  { id: 'game', label: '游戏测验' },
  { id: 'visualization3d', label: '3D 可视化' },
  { id: 'vulnerable-lab', label: '攻防靶标' },
  { id: 'debate', label: '多智能体辩论' },
];

type Outline = { id: string; type: string; title: string; widgetType?: string };

export default function LessonEditorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [title, setTitle] = useState('');
  const [loadError, setLoadError] = useState('');

  // single-gen form
  const [type, setType] = useState('slide');
  const [aTitle, setATitle] = useState('');
  const [keyPts, setKeyPts] = useState('');
  const [genBusy, setGenBusy] = useState(false);

  // batch
  const [req, setReq] = useState('');
  const [outlines, setOutlines] = useState<Outline[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  const [publish, setPublish] = useState<{ classroomId: string; url: string } | null>(null);
  const [err, setErr] = useState('');
  const [quality, setQuality] = useState<'fast' | 'rich'>('fast');
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError('');
    try {
      const response = await fetch(`/api/lessons/${id}`);
      const r = await response.json().catch(() => ({}));
      if (!response.ok || !r.lesson) {
        throw new Error(r.error || '预览内容暂时无法读取');
      }
      setLesson(r.lesson);
      setTitle(r.lesson.title);
      if (r.lesson.publishedClassroomId) {
        setPublish({
          classroomId: r.lesson.publishedClassroomId,
          url: `${location.origin}/classroom/${r.lesson.publishedClassroomId}`,
        });
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '预览内容暂时无法读取');
    }
  }, [id]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!INTEGRATED || window.parent === window || (!lesson && !loadError)) return;
    window.parent.postMessage(
      {
        type: 'aisecedu:artifact-preview',
        artifactId: id,
        state: lesson ? 'ready' : 'error',
        ...(loadError ? { message: loadError } : {}),
      },
      window.location.origin,
    );
  }, [id, lesson, loadError]);

  async function saveTitle() {
    if (!lesson || title === lesson.title) return;
    await fetch(`/api/lessons/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    refresh();
  }

  async function genSingle() {
    if (!aTitle.trim()) return;
    setGenBusy(true);
    setErr('');
    const r = await fetch(`/api/lessons/${id}/artifacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'single',
        type,
        title: aTitle.trim(),
        quality,
        keyPoints: keyPts
          .split(/[,，\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    }).then((r) => r.json());
    setGenBusy(false);
    if (r.artifact) {
      setATitle('');
      setKeyPts('');
      refresh();
    } else setErr(r.error || '生成失败');
  }

  async function proposeOutlines() {
    if (!req.trim()) return;
    setBatchBusy(true);
    setErr('');
    const r = await fetch(`/api/lessons/${id}/outlines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requirement: req.trim() }),
    }).then((r) => r.json());
    setBatchBusy(false);
    if (r.outlines) {
      setOutlines(r.outlines);
      setPicked(new Set(r.outlines.map((o: Outline) => o.id)));
    } else setErr(r.error || '大纲生成失败');
  }

  async function genBatch() {
    if (!outlines) return;
    const selected = outlines.filter((o) => picked.has(o.id));
    if (selected.length === 0) return;
    setBatchBusy(true);
    setErr('');
    const r = await fetch(`/api/lessons/${id}/artifacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'batch', outlines: selected, quality }),
    }).then((r) => r.json());
    setBatchBusy(false);
    if (r.artifacts) {
      setOutlines(null);
      setReq('');
      refresh();
    } else setErr(r.error || '批量生成失败');
  }

  async function removeArtifact(aid: string) {
    await fetch(`/api/lessons/${id}/artifacts/${aid}`, { method: 'DELETE' });
    refresh();
  }

  async function reorder(aid: string, dir: -1 | 1) {
    if (!lesson) return;
    const arts = [...lesson.artifacts].sort((a, b) => a.order - b.order);
    const i = arts.findIndex((a) => a.id === aid);
    const j = i + dir;
    if (j < 0 || j >= arts.length) return;
    [arts[i], arts[j]] = [arts[j], arts[i]];
    await fetch(`/api/lessons/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orders: arts.map((a, idx) => ({ id: a.id, order: idx + 1 })) }),
    });
    refresh();
  }

  async function editArtifact(aid: string, instruction: string) {
    setEditingId(aid);
    setErr('');
    const r = await fetch(`/api/lessons/${id}/artifacts/${aid}/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction }),
    }).then((r) => r.json());
    setEditingId(null);
    if (r.error) setErr(r.error);
    else refresh();
  }

  async function publishLesson() {
    setErr('');
    const r = await fetch(`/api/lessons/${id}/publish`, { method: 'POST' }).then((r) => r.json());
    if (r.classroomId) setPublish({ classroomId: r.classroomId, url: r.url });
    else setErr(r.error || '发布失败');
  }

  if (!lesson)
    return (
      <main
        data-aisecedu-preview-state={loadError ? 'error' : 'loading'}
        style={{
          minHeight: '100vh',
          padding: 24,
          color: 'var(--foreground)',
          background: 'var(--background)',
        }}
      >
        {loadError ? (
          <div role="alert" style={{ maxWidth: 520, margin: '12vh auto', textAlign: 'center' }}>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>预览暂时没有加载成功</h2>
            <p style={{ color: 'var(--muted-foreground)', marginBottom: 16 }}>{loadError}</p>
            <button type="button" onClick={() => void refresh()} style={btn}>
              重新加载
            </button>
          </div>
        ) : (
          '正在准备预览…'
        )}
      </main>
    );
  const sorted = [...lesson.artifacts].sort((a, b) => a.order - b.order);

  if (INTEGRATED) {
    return <IntegratedLessonPreview artifacts={sorted} title={lesson.title} />;
  }

  return (
    <main
      data-aisecedu-preview-state="ready"
      style={{
        maxWidth: 900,
        minHeight: '100vh',
        margin: '0 auto',
        padding: 24,
        color: 'var(--foreground)',
        background: 'var(--background)',
        fontFamily: 'system-ui, "PingFang SC", sans-serif',
      }}
    >
      <Link href="/prep" style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
        ← 返回列表
      </Link>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={INTEGRATED ? undefined : saveTitle}
        readOnly={INTEGRATED}
        style={{
          fontSize: 20,
          fontWeight: 700,
          border: 0,
          borderBottom: '1px solid var(--border)',
          width: '100%',
          padding: '8px 0',
          color: 'var(--foreground)',
          background: 'transparent',
          outline: 'none',
        }}
      />
      <div style={{ color: 'var(--muted-foreground)', fontSize: 12, margin: '4px 0 12px' }}>
        {lesson.subjectProfile === 'cybersecurity'
          ? `网安定制${lesson.courseId ? ' · ' + lesson.courseId : ''}`
          : '通用模式'}{' '}
        · {sorted.length} 个产物
      </div>

      {err && (
        <div
          style={{
            color: 'var(--destructive)',
            border: '1px solid var(--destructive)',
            background: 'var(--card)',
            padding: 8,
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {err}
        </div>
      )}

      {/* single generation */}
      {!INTEGRATED && (
        <section style={panel}>
          <h3 style={h3}>① 单产物生成</h3>
          <div style={{ display: 'flex', gap: 12, fontSize: 13, margin: '4px 0 10px' }}>
            <label>
              <input
                type="radio"
                checked={quality === 'fast'}
                onChange={() => setQuality('fast')}
              />{' '}
              快速（工作流+flash，秒级，模板化）
            </label>
            <label>
              <input
                type="radio"
                checked={quality === 'rich'}
                onChange={() => setQuality('rich')}
              />{' '}
              精细（原版定制+强模型，丰富，较慢）
            </label>
          </div>
          <select value={type} onChange={(e) => setType(e.target.value)} style={input}>
            {TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            placeholder="产物标题，如：AES 工作模式"
            value={aTitle}
            onChange={(e) => setATitle(e.target.value)}
            style={input}
          />
          <textarea
            placeholder="要点（逗号或换行分隔，可选）"
            value={keyPts}
            onChange={(e) => setKeyPts(e.target.value)}
            style={{ ...input, minHeight: 50 }}
          />
          <button onClick={genSingle} disabled={genBusy || !aTitle.trim()} style={btn}>
            {genBusy ? '生成中…' : '生成并加入'}
          </button>
        </section>
      )}

      {/* batch generation */}
      {!INTEGRATED && (
        <section style={panel}>
          <h3 style={h3}>② 批量生成（从主题）</h3>
          <input
            placeholder="主题，如：为现代密码学生成一节课"
            value={req}
            onChange={(e) => setReq(e.target.value)}
            style={input}
          />
          <button onClick={proposeOutlines} disabled={batchBusy || !req.trim()} style={ghostBtn}>
            {batchBusy && !outlines ? '提议中…' : '提议大纲'}
          </button>
          {outlines && (
            <div style={{ marginTop: 10 }}>
              {outlines.map((o) => (
                <label key={o.id} style={{ display: 'block', fontSize: 13, padding: '4px 0' }}>
                  <input
                    type="checkbox"
                    checked={picked.has(o.id)}
                    onChange={(e) => {
                      const n = new Set(picked);
                      if (e.target.checked) n.add(o.id);
                      else n.delete(o.id);
                      setPicked(n);
                    }}
                  />{' '}
                  [{o.widgetType || o.type}] {o.title}
                </label>
              ))}
              <button onClick={genBatch} disabled={batchBusy} style={{ ...btn, marginTop: 8 }}>
                {batchBusy ? '生成中…' : `生成选中 (${picked.size})`}
              </button>
            </div>
          )}
        </section>
      )}

      {/* artifact list */}
      <section style={panel}>
        <h3 style={h3}>③ 产物（{sorted.length}）</h3>
        {sorted.length === 0 && (
          <p style={{ color: 'var(--muted-foreground)' }}>还没有产物，用上面两种方式生成。</p>
        )}
        {sorted.map((a, i) => (
          <ArtifactCard
            key={a.id}
            a={a}
            i={i}
            last={sorted.length - 1}
            onDel={() => removeArtifact(a.id)}
            onReorder={(d) => reorder(a.id, d)}
            onEdit={editArtifact}
            editBusy={editingId === a.id}
            readOnly={INTEGRATED}
          />
        ))}
      </section>

      {/* publish */}
      {!INTEGRATED && (
        <section style={panel}>
          <h3 style={h3}>④ 发布给学生</h3>
          <button onClick={publishLesson} disabled={sorted.length === 0} style={btn}>
            发布为课堂
          </button>
          {publish && (
            <div style={{ marginTop: 10, fontSize: 13 }}>
              ✅ 已发布，分享链接（需 HTTPS 访问）：
              <Link
                href={`/classroom/${publish.classroomId}`}
                style={{ color: '#2563eb', display: 'block', wordBreak: 'break-all' }}
              >
                {publish.url}
              </Link>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function ArtifactCard({
  a,
  i,
  last,
  onDel,
  onReorder,
  onEdit,
  editBusy,
  readOnly,
}: {
  a: LessonArtifact;
  i: number;
  last: number;
  onDel: () => void;
  onReorder: (d: -1 | 1) => void;
  onEdit?: (id: string, instruction: string) => void;
  editBusy?: boolean;
  readOnly?: boolean;
}) {
  const c = a.content as unknown as Record<string, unknown>;
  const isSlide = 'elements' in c;
  const isWidget = 'html' in c;
  const isQuiz = 'questions' in c;
  const [showEdit, setShowEdit] = useState(false);
  const [editText, setEditText] = useState('');
  const widgetFrame = useRef<HTMLIFrameElement>(null);
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 10,
        marginBottom: 10,
        color: 'var(--card-foreground)',
        background: 'var(--card)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <b style={{ fontSize: 14 }}>
          {i + 1}. {a.title}
        </b>
        <span
          style={{
            fontSize: 11,
            color: 'var(--muted-foreground)',
            background: 'var(--muted)',
            padding: '2px 6px',
            borderRadius: 4,
          }}
        >
          {a.type}
        </span>
        <span style={{ flex: 1 }} />
        {!readOnly && (
          <button onClick={() => onReorder(-1)} disabled={i === 0} style={miniBtn}>
            ↑
          </button>
        )}
        {!readOnly && (
          <button onClick={() => onReorder(1)} disabled={i === last} style={miniBtn}>
            ↓
          </button>
        )}
        {!readOnly && isWidget && onEdit && (
          <button onClick={() => setShowEdit(!showEdit)} style={miniBtn} title="AI 修改">
            ✏️
          </button>
        )}
        {!readOnly && (
          <button onClick={onDel} style={{ ...miniBtn, color: '#b91c1c' }}>
            删除
          </button>
        )}
      </div>
      {isSlide && <LessonSlidePreview elements={c.elements} background={c.background} />}
      {isWidget && typeof c.html === 'string' && (
        <div>
          <iframe
            ref={widgetFrame}
            srcDoc={patchHtmlForIframe(c.html)}
            style={{
              width: '100%',
              height: 500,
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: '#fff',
            }}
            title={a.title}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
          />
          <button
            onClick={() => {
              void widgetFrame.current?.requestFullscreen();
            }}
            style={{ ...miniBtn, marginTop: 4 }}
          >
            🔍 全屏查看
          </button>
        </div>
      )}
      {isQuiz && Array.isArray(c.questions) && (
        <ol
          style={{
            fontSize: 12,
            color: 'var(--muted-foreground)',
            margin: '4px 0 0',
            paddingLeft: 18,
          }}
        >
          {(c.questions as Array<{ question?: string }>).slice(0, 5).map((q, idx) => (
            <li key={idx}>{q.question}</li>
          ))}
        </ol>
      )}
      {showEdit && isWidget && (
        <div style={{ marginTop: 8, borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
          <textarea
            placeholder="用自然语言描述修改，如：增加一个中间人攻击演示 / 让素数选择更直观 / 添加错误提示和计分"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            style={{
              width: '100%',
              minHeight: 50,
              padding: '6px 8px',
              border: '1px solid var(--input)',
              borderRadius: 6,
              color: 'var(--foreground)',
              background: 'var(--background)',
              fontSize: 12,
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              onClick={() => {
                if (onEdit && editText.trim()) {
                  onEdit(a.id, editText.trim());
                  setEditText('');
                  setShowEdit(false);
                }
              }}
              disabled={editBusy || !editText.trim()}
              style={{
                ...miniBtn,
                background: editBusy ? 'var(--muted)' : INTEGRATED ? '#67c23a' : 'var(--primary)',
                color: INTEGRATED ? '#101010' : 'var(--primary-foreground)',
                border: 0,
              }}
            >
              {editBusy ? '修改中…' : '提交修改'}
            </button>
            <button onClick={() => setShowEdit(false)} style={miniBtn}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const panel: React.CSSProperties = {
  color: 'var(--card-foreground)',
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 16,
  margin: '16px 0',
};
const h3: React.CSSProperties = { fontSize: 15, margin: '0 0 10px' };
const input: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--input)',
  borderRadius: 8,
  color: 'var(--foreground)',
  background: 'var(--background)',
  fontSize: 14,
  marginBottom: 8,
  boxSizing: 'border-box',
};
const btn: React.CSSProperties = {
  background: INTEGRATED ? '#67c23a' : 'var(--primary)',
  color: INTEGRATED ? '#101010' : 'var(--primary-foreground)',
  border: 0,
  borderRadius: 8,
  padding: '8px 16px',
  fontSize: 14,
  cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  background: 'var(--card)',
  color: INTEGRATED ? '#67c23a' : 'var(--primary)',
  border: `1px solid ${INTEGRATED ? '#67c23a' : 'var(--primary)'}`,
  borderRadius: 8,
  padding: '8px 16px',
  fontSize: 14,
  cursor: 'pointer',
};
const miniBtn: React.CSSProperties = {
  background: 'var(--muted)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '2px 8px',
  fontSize: 12,
  cursor: 'pointer',
  color: 'var(--foreground)',
};
