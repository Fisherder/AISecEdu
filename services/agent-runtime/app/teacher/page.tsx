'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface LessonSummary {
  id: string;
  title: string;
  artifactCount: number;
  publishedClassroomId?: string;
  updatedAt: number;
}

const MODES = [
  { id: 'vulnerable-lab', label: '攻防靶标', icon: '🎯', quality: 'rich' },
  { id: 'simulation', label: '模拟实验', icon: '🔬', quality: 'rich' },
  { id: 'slide', label: '课件', icon: '📊', quality: 'fast' },
  { id: 'quiz', label: '测验', icon: '❓', quality: 'fast' },
  { id: 'diagram', label: '示意图', icon: '🗺️', quality: 'fast' },
  { id: 'code', label: '编程', icon: '💻', quality: 'rich' },
] as const;

export default function TeacherDashboard() {
  const router = useRouter();
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<string>('vulnerable-lab');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fileName, setFileName] = useState('');
  const [pdfText, setPdfText] = useState('');

  useEffect(() => {
    fetch('/api/lessons')
      .then((r) => r.json())
      .then((d) => setLessons(d.lessons ?? []));
  }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setErr('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const r = await fetch('/api/extract-document', { method: 'POST', body: formData }).then((r) =>
        r.json(),
      );
      if (r.text) {
        setPdfText(r.text.slice(0, 8000));
        setErr('');
      } else if (r.error) setErr('解析失败: ' + r.error);
    } catch {
      setErr('上传失败');
    }
  }

  async function generate() {
    if (!input.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      const selectedMode = MODES.find((m) => m.id === mode)!;

      // Build the full context: user input + uploaded document text
      const docContext = pdfText
        ? `\n\n参考教材内容（必须围绕此教材生成）:\n${pdfText.slice(0, 6000)}`
        : '';
      const fullTopic = input.trim() + docContext;

      // 1. Create lesson
      const lr = await fetch('/api/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: input.trim().slice(0, 40), subjectProfile: 'cybersecurity' }),
      }).then((r) => r.json());
      if (!lr.id) throw new Error('创建失败');

      // 2. Design scenarios first (for labs) — PASS DOCUMENT CONTEXT
      if (mode === 'vulnerable-lab' || mode === 'simulation') {
        const dr = await fetch('/api/security/design', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: input.trim(), description: fullTopic }),
        }).then((r) => r.json());

        if (dr.proposals?.length > 0) {
          // Use the first proposal's description + append document text
          const best = dr.proposals[0];
          await fetch(`/api/lessons/${lr.id}/artifacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: 'single',
              type: mode,
              title: best.title,
              description: best.description + docContext,
              quality: selectedMode.quality,
            }),
          });
        } else {
          await fetch(`/api/lessons/${lr.id}/artifacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: 'single',
              type: mode,
              title: input.trim().slice(0, 60),
              description: fullTopic,
              quality: selectedMode.quality,
            }),
          });
        }
      } else {
        // Direct generation for slides/quizzes/diagrams — include document context
        await fetch(`/api/lessons/${lr.id}/artifacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'single',
            type: mode,
            title: input.trim().slice(0, 60),
            description: fullTopic,
            quality: selectedMode.quality,
          }),
        });
      }

      router.push(`/teacher/prep/${lr.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '生成失败');
    }
    setBusy(false);
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>教师工作台</h1>
      <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 24px' }}>
        从教学目标出发，完成设计、生成、验证、发布与学情回流
      </p>

      {/* ── Dialog Input ── */}
      <div
        style={{
          background: '#1e293b',
          borderRadius: 16,
          padding: 20,
          border: '1px solid #334155',
          marginBottom: 24,
        }}
      >
        {/* Mode chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              style={{
                background: mode === m.id ? '#3b82f6' : '#334155',
                color: mode === m.id ? '#fff' : '#94a3b8',
                border: 0,
                borderRadius: 20,
                padding: '6px 14px',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>

        {/* Textarea */}
        <textarea
          placeholder={`描述你想生成的${MODES.find((m) => m.id === mode)?.label || '内容'}… 例如：「SQL注入登录绕过靶标，学生输入 payload 看到SQL拼接过程」`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate();
          }}
          style={{
            width: '100%',
            minHeight: 80,
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 10,
            color: '#e2e8f0',
            fontSize: 14,
            padding: '12px 14px',
            boxSizing: 'border-box',
            outline: 'none',
            resize: 'vertical',
          }}
        />

        {/* File upload */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 4 }}
        >
          <label
            style={{
              background: '#334155',
              color: '#94a3b8',
              border: '1px solid #475569',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            📎 上传教材
            <input
              type="file"
              accept=".pdf,.docx,.pptx,.txt,.md"
              onChange={handleUpload}
              style={{ display: 'none' }}
            />
          </label>
          {fileName && (
            <span style={{ fontSize: 12, color: pdfText ? '#10b981' : '#f59e0b' }}>
              {pdfText ? '✓ ' : '⏳ '}
              {fileName}
            </span>
          )}
        </div>

        {err && <div style={{ color: '#f87171', fontSize: 12, marginTop: 8 }}>{err}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-end', marginTop: 12 }}>
          <button
            onClick={generate}
            disabled={!input.trim() || busy}
            style={{
              background: busy ? '#1e3a5f' : '#3b82f6',
              color: '#fff',
              border: 0,
              borderRadius: 10,
              padding: '10px 24px',
              fontSize: 14,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? '⏳ AI 生成中…' : '✨ 生成'}
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#475569', marginTop: 8 }}>
          {mode === 'vulnerable-lab' || mode === 'simulation'
            ? 'AI 先设计方案→选最优→精细生成（1-3分钟）'
            : '快速生成（约20-60秒）'}{' '}
          · Ctrl+Enter 快捷生成
        </p>
      </div>

      {/* ── Quick modules ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        {[
          { href: '/teacher/prep', icon: '📚', title: 'AI 备课', desc: '大纲→编辑→批量生成' },
          {
            href: '/teacher/agents',
            icon: '◎',
            title: '智能体中枢',
            desc: '角色、工作流与安全边界',
          },
          { href: '/teacher/casting', icon: '🎭', title: '选角中心', desc: 'AI 同学人设配置' },
          { href: '/teacher/sandbox', icon: '🔧', title: '沙箱构建', desc: '靶标预览调试' },
          { href: '/teacher/analytics', icon: '📊', title: '学情雷达', desc: '知识盲点分析' },
        ].map((m) => (
          <Link key={m.href} href={m.href} style={{ textDecoration: 'none' }}>
            <div
              style={{
                background: '#1e293b',
                borderRadius: 10,
                padding: 14,
                border: '1px solid #334155',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 22, marginBottom: 4 }}>{m.icon}</div>
              <div style={{ fontSize: 13, color: '#e2e8f0' }}>{m.title}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{m.desc}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Recent lessons ── */}
      <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>📋 最近备课</h2>
      {lessons.length === 0 ? (
        <div
          style={{
            background: '#1e293b',
            borderRadius: 12,
            padding: 24,
            textAlign: 'center',
            color: '#475569',
            fontSize: 13,
          }}
        >
          在上方对话框输入内容，开始第一次生成
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lessons.slice(0, 8).map((l) => (
            <Link key={l.id} href={`/teacher/prep/${l.id}`} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: '#1e293b',
                  borderRadius: 8,
                  padding: '8px 12px',
                  border: '1px solid #334155',
                }}
              >
                <span style={{ flex: 1, fontSize: 13, color: '#e2e8f0' }}>{l.title}</span>
                <span style={{ fontSize: 11, color: '#64748b' }}>{l.artifactCount} 产物</span>
                {l.publishedClassroomId && (
                  <span style={{ fontSize: 10, color: '#10b981' }}>●已发布</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
