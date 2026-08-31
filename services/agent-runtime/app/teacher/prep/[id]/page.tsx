'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Lesson } from '@/lib/types/lesson';
import {
  ArtifactPreview,
  ArtifactStructuredEditor,
  type ArtifactStructuredUpdate,
} from '@/components/teacher/artifact-workbench';

export default function TeacherPrepEditorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [title, setTitle] = useState('');
  const [genType, setGenType] = useState('vulnerable-lab');
  const [genTitle, setGenTitle] = useState('');
  const [genDesc, setGenDesc] = useState('');
  const [quality, setQuality] = useState<'fast' | 'rich'>('rich');
  const [busy, setBusy] = useState(false);
  const [structuredEditId, setStructuredEditId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [collapsedPreviewIds, setCollapsedPreviewIds] = useState<Set<string>>(() => new Set());
  const initializedPreviewLessonId = useRef<string | null>(null);
  const [publishUrl, setPublishUrl] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/lessons/${id}`).then((r) => r.json());
    if (r.lesson) {
      setLesson(r.lesson);
      setTitle(r.lesson.title);
      if (initializedPreviewLessonId.current !== r.lesson.id) {
        const interactiveArtifactIds = r.lesson.artifacts
          .filter((artifact: Lesson['artifacts'][number]) => {
            const content = artifact.content as unknown as Record<string, unknown>;
            return typeof content.html === 'string';
          })
          .map((artifact: Lesson['artifacts'][number]) => artifact.id);
        setCollapsedPreviewIds(new Set(interactiveArtifactIds));
        initializedPreviewLessonId.current = r.lesson.id;
      }
      if (r.lesson.publishedClassroomId)
        setPublishUrl(`/classroom/${r.lesson.publishedClassroomId}`);
    } else {
      setLesson(null);
      setErr('找不到此备课（可能已删除或服务器重启后数据丢失）');
    }
  }, [id]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveTitle() {
    if (!lesson || title === lesson.title) return;
    await fetch(`/api/lessons/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    refresh();
  }

  async function generate() {
    if (!genTitle.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      const r = await fetch(`/api/lessons/${id}/artifacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'single',
          type: genType,
          title: genTitle.trim(),
          description: genDesc.trim(),
          quality,
        }),
      }).then((r) => r.json());
      if (r.error) setErr(r.error);
      else {
        setGenTitle('');
        setGenDesc('');
        refresh();
      }
    } catch {
      setErr('生成失败');
    }
    setBusy(false);
  }

  async function editArtifact(aid: string) {
    if (!editText.trim()) return;
    setBusy(true);
    setErr('');
    setNotice('');
    try {
      const response = await fetch(`/api/lessons/${id}/artifacts/${aid}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: editText.trim() }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || '修改失败');
      setEditText('');
      setEditId(null);
      setNotice('交互产物已修改。若要同步学生端，请重新发布。');
      await refresh();
    } catch (reason) {
      setErr(reason instanceof Error ? reason.message : '修改失败');
    } finally {
      setBusy(false);
    }
  }

  async function saveStructuredArtifact(aid: string, update: ArtifactStructuredUpdate) {
    setBusy(true);
    setErr('');
    setNotice('');
    try {
      const response = await fetch(`/api/lessons/${id}/artifacts/${aid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || '保存失败');
      setStructuredEditId(null);
      setNotice('产物已保存，预览已更新。若要同步学生端，请重新发布。');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function togglePreview(aid: string) {
    setCollapsedPreviewIds((current) => {
      const next = new Set(current);
      if (next.has(aid)) next.delete(aid);
      else next.add(aid);
      return next;
    });
  }

  async function del(aid: string) {
    await fetch(`/api/lessons/${id}/artifacts/${aid}`, { method: 'DELETE' });
    refresh();
  }

  async function publish() {
    const r = await fetch(`/api/lessons/${id}/publish`, { method: 'POST' }).then((r) => r.json());
    if (r.url) setPublishUrl(r.url);
    else setErr(r.error || '发布失败');
  }

  const TYPES = [
    { id: 'vulnerable-lab', l: '靶标' },
    { id: 'debate', l: '辩论' },
    { id: 'simulation', l: '模拟' },
    { id: 'slide', l: '课件' },
    { id: 'quiz', l: '测验' },
    { id: 'diagram', l: '图示' },
    { id: 'code', l: '编程' },
  ];
  if (!lesson)
    return (
      <div>
        <Link href="/teacher" style={{ fontSize: 13, color: '#64748b' }}>
          ← 工作台
        </Link>
        <div style={{ textAlign: 'center', padding: 60 }}>
          {err ? (
            <>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
              <p style={{ color: '#94a3b8' }}>{err}</p>
              <Link href="/teacher" style={{ color: '#60a5fa' }}>
                返回工作台重新生成 →
              </Link>
            </>
          ) : (
            <p style={{ color: '#64748b' }}>加载中…</p>
          )}
        </div>
      </div>
    );
  const sorted = [...lesson.artifacts].sort((a, b) => a.order - b.order);

  return (
    <div>
      <Link href="/teacher" style={{ fontSize: 13, color: '#64748b' }}>
        ← 工作台
      </Link>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        style={{
          fontSize: 20,
          fontWeight: 700,
          background: 'transparent',
          border: 0,
          borderBottom: '1px solid #334155',
          color: '#e2e8f0',
          width: '100%',
          padding: '8px 0',
          outline: 'none',
          marginTop: 8,
        }}
      />
      <div style={{ color: '#64748b', fontSize: 12, margin: '4px 0 16px' }}>
        {sorted.length} 个产物
      </div>

      {err && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}>{err}</div>}
      {notice && <div style={{ color: '#67e8f9', fontSize: 12, marginBottom: 12 }}>{notice}</div>}

      {/* Generate panel */}
      <div
        style={{
          background: '#1e293b',
          borderRadius: 12,
          padding: 16,
          border: '1px solid #334155',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setGenType(t.id)}
              style={{
                background: genType === t.id ? '#3b82f6' : '#334155',
                color: '#fff',
                border: 0,
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {t.l}
            </button>
          ))}
          <button
            onClick={() => setQuality(quality === 'fast' ? 'rich' : 'fast')}
            style={{
              background: '#475569',
              color: '#cbd5e1',
              border: 0,
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 12,
            }}
          >
            {quality === 'rich' ? '⏳ 精细' : '⚡ 快速'}
          </button>
        </div>
        <input
          placeholder="产物标题"
          value={genTitle}
          onChange={(e) => setGenTitle(e.target.value)}
          style={inp}
        />
        <textarea
          placeholder="详细描述（越具体质量越高）"
          value={genDesc}
          onChange={(e) => setGenDesc(e.target.value)}
          style={{ ...inp, minHeight: 50 }}
        />
        <button
          onClick={generate}
          disabled={!genTitle.trim() || busy}
          style={{
            background: '#3b82f6',
            color: '#fff',
            border: 0,
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {busy ? '⏳ 生成中…' : '✨ 生成'}
        </button>
      </div>

      {/* Artifacts */}
      {sorted.map((a, i) => {
        const c = a.content as unknown as Record<string, unknown>;
        const isWidget = 'html' in c;
        const canStructuredEdit = a.type === 'slide' || a.type === 'quiz';
        const previewOpen = !collapsedPreviewIds.has(a.id);
        return (
          <div
            key={a.id}
            data-testid="artifact-card"
            data-artifact-id={a.id}
            data-artifact-type={a.type}
            style={{
              background: '#1e293b',
              borderRadius: 10,
              padding: 12,
              border: '1px solid #334155',
              marginBottom: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <b style={{ fontSize: 14, color: '#e2e8f0' }}>
                {i + 1}. {a.title}
              </b>
              <span
                style={{
                  fontSize: 10,
                  color: '#64748b',
                  background: '#334155',
                  padding: '2px 6px',
                  borderRadius: 4,
                }}
              >
                {a.type}
              </span>
              <span style={{ flex: 1 }} />
              <button onClick={() => togglePreview(a.id)} style={miniBtn}>
                {previewOpen ? '收起预览' : '预览'}
              </button>
              {canStructuredEdit && (
                <button
                  onClick={() => {
                    setStructuredEditId(structuredEditId === a.id ? null : a.id);
                    setEditId(null);
                    setCollapsedPreviewIds((current) => {
                      const next = new Set(current);
                      next.delete(a.id);
                      return next;
                    });
                  }}
                  style={{ ...miniBtn, color: '#67e8f9', borderColor: '#155e75' }}
                >
                  ✏️ 编辑内容
                </button>
              )}
              {isWidget && (
                <button onClick={() => setEditId(editId === a.id ? null : a.id)} style={miniBtn}>
                  ✏️ AI 修改
                </button>
              )}
              <button onClick={() => del(a.id)} style={{ ...miniBtn, color: '#f87171' }}>
                删除
              </button>
            </div>
            {previewOpen && <ArtifactPreview artifact={a} />}
            {structuredEditId === a.id && canStructuredEdit && (
              <ArtifactStructuredEditor
                key={a.id}
                artifact={a}
                saving={busy}
                onCancel={() => setStructuredEditId(null)}
                onSave={(update) => saveStructuredArtifact(a.id, update)}
              />
            )}
            {editId === a.id && (
              <div style={{ marginTop: 8 }}>
                <textarea
                  placeholder="描述你要修改的内容…"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  style={{ ...inp, minHeight: 40 }}
                />
                <button
                  onClick={() => editArtifact(a.id)}
                  disabled={busy || !editText.trim()}
                  style={{
                    background: '#475569',
                    color: '#fff',
                    border: 0,
                    borderRadius: 6,
                    padding: '4px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                    marginTop: 4,
                  }}
                >
                  {busy ? '修改中…' : '提交修改'}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Publish */}
      <button
        onClick={publish}
        disabled={sorted.length === 0}
        style={{
          background: '#10b981',
          color: '#fff',
          border: 0,
          borderRadius: 8,
          padding: '10px 20px',
          fontSize: 14,
          cursor: 'pointer',
          marginTop: 8,
        }}
      >
        📤 发布给学生
      </button>
      {publishUrl && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <span style={{ color: '#10b981' }}>✅ </span>
          <Link href={publishUrl} style={{ color: '#60a5fa' }}>
            {publishUrl}
          </Link>
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#e2e8f0',
  fontSize: 13,
  marginBottom: 8,
  boxSizing: 'border-box',
  outline: 'none',
};
const miniBtn: React.CSSProperties = {
  background: '#334155',
  color: '#cbd5e1',
  border: '1px solid #475569',
  borderRadius: 6,
  padding: '2px 8px',
  fontSize: 11,
  cursor: 'pointer',
};
