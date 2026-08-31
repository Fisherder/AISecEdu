'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { LabSolvabilityReport } from '@/lib/security/lab-solvability';

export default function SandboxPage() {
  const [prompt, setPrompt] = useState('');
  const [html, setHtml] = useState('');
  const [busy, setBusy] = useState(false);
  const [editText, setEditText] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [checkBusy, setCheckBusy] = useState(false);
  const [err, setErr] = useState('');
  const [size, setSize] = useState(0);
  const [savedLesson, setSavedLesson] = useState('');
  const [solvability, setSolvability] = useState<LabSolvabilityReport | null>(null);

  function applyGeneratedArtifact(artifact: {
    content?: { html?: string };
    solvability?: LabSolvabilityReport;
  }) {
    const nextHtml = artifact.content?.html;
    if (!nextHtml) return false;
    setHtml(nextHtml);
    setSize(nextHtml.length);
    setSolvability(artifact.solvability ?? null);
    return true;
  }

  async function generate() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setErr('');
    setHtml('');
    setSolvability(null);
    try {
      const r = await fetch('/api/security/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'vulnerable-lab',
          title: prompt.trim().slice(0, 40),
          description: prompt.trim(),
          quality: 'rich',
        }),
      }).then((r) => r.json());
      if (r.artifact && applyGeneratedArtifact(r.artifact)) {
        // The generation endpoint already ran the same deterministic audit.
      } else setErr(r.error || '生成失败');
    } catch {
      setErr('网络错误');
    }
    setBusy(false);
  }

  async function checkAndRepair() {
    if (!html || checkBusy) return;
    setCheckBusy(true);
    setErr('');
    try {
      const response = await fetch('/api/security/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, repair: true }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || '可完成性检查失败');
      if (typeof payload.html === 'string') {
        setHtml(payload.html);
        setSize(payload.html.length);
      }
      setSolvability(payload.solvability ?? null);
    } catch (reason) {
      setErr(reason instanceof Error ? reason.message : '可完成性检查失败');
    } finally {
      setCheckBusy(false);
    }
  }

  async function applyEdit() {
    if (!editText.trim() || editBusy || !html) return;
    setEditBusy(true);
    try {
      // Use the edit API via a lesson — but sandbox doesn't have a lesson yet, so use direct approach
      // For now, regenerate with appended instruction
      const combined = prompt + '\n\n修改要求：' + editText;
      const r2 = await fetch('/api/security/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'vulnerable-lab',
          title: '修改版',
          description: combined,
          quality: 'rich',
        }),
      }).then((r) => r.json());
      if (r2.artifact && applyGeneratedArtifact(r2.artifact)) setEditText('');
    } catch {
      setErr('修改失败');
    }
    setEditBusy(false);
  }

  async function saveToLesson() {
    if (!html) return;
    setErr('');
    try {
      const lr = await fetch('/api/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: prompt.trim().slice(0, 40) || '沙箱产物',
          subjectProfile: 'cybersecurity',
        }),
      }).then((r) => r.json());
      if (!lr.id) throw new Error('创建失败');
      // Can't directly write HTML to artifact via API; redirect to editor for packaging
      setSavedLesson(lr.id);
    } catch {
      setErr('保存失败');
    }
  }

  const EXAMPLES = [
    'SQL 注入登录靶标：学生输入 payload 看到 SQL 拼接过程，成功绕过后显示数据库数据',
    'XSS 存储型攻击模拟：学生提交恶意评论，看到 Cookie 被窃取的过程',
    '栈溢出 3D 可视化：Three.js 栈内存模型，输入超长字符串覆盖返回地址',
    '勒索软件加密模拟：仿 Windows 桌面，点击恶意文件后图标逐个加密',
    'CAN 总线仪表盘劫持：hex 报文注入让车速表显示 200km/h',
  ];

  return (
    <div>
      <Link href="/teacher" style={{ fontSize: 13, color: '#64748b' }}>
        ← 工作台
      </Link>
      <h1 style={{ fontSize: 20, margin: '12px 0 4px' }}>🔧 沙箱构建器</h1>
      <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 20px' }}>
        自然语言 → 生成交互式靶标 → 预览 → 修改 → 打包进课程
      </p>

      {/* Prompt input */}
      <div
        style={{
          background: '#1e293b',
          borderRadius: 12,
          padding: 16,
          border: '1px solid #334155',
          marginBottom: 16,
        }}
      >
        <textarea
          placeholder="描述你想生成的靶标/模拟实验…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          style={{ ...inp, minHeight: 70 }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              onClick={() => setPrompt(ex)}
              style={{
                background: '#334155',
                color: '#94a3b8',
                border: 0,
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {ex.slice(0, 30)}…
            </button>
          ))}
        </div>
        <button onClick={generate} disabled={!prompt.trim() || busy} style={btnPrimary}>
          {busy ? '⏳ 生成中…（1-3 分钟）' : '✨ 生成靶标'}
        </button>
      </div>

      {err && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}>{err}</div>}

      {/* Preview */}
      {html && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <h3 style={{ fontSize: 15, margin: 0 }}>🔍 预览（{size} bytes）</h3>
            <button
              onClick={() => {
                const w = window.open();
                if (w) {
                  w.document.write(html);
                  w.document.close();
                }
              }}
              style={miniBtn}
            >
              全屏
            </button>
            <button onClick={checkAndRepair} disabled={checkBusy} style={miniBtn}>
              {checkBusy ? '检查中…' : '✓ 检查并修复可完成性'}
            </button>
          </div>
          {solvability && (
            <div
              data-testid="lab-solvability-status"
              style={{
                border: `1px solid ${solvability.passed ? (solvability.autoRepaired ? '#d97706' : '#15803d') : '#b91c1c'}`,
                background: solvability.passed
                  ? solvability.autoRepaired
                    ? '#451a03'
                    : '#052e16'
                  : '#450a0a',
                color: solvability.passed
                  ? solvability.autoRepaired
                    ? '#fde68a'
                    : '#bbf7d0'
                  : '#fecaca',
                borderRadius: 8,
                padding: '9px 12px',
                fontSize: 12,
                lineHeight: 1.6,
                marginBottom: 8,
              }}
            >
              <b>
                {solvability.passed
                  ? solvability.autoRepaired
                    ? '⚠️ 可完成性检查通过（已自动修复）'
                    : '✅ 可完成性检查通过'
                  : '❌ 可完成性检查未通过'}
              </b>
              <span style={{ marginLeft: 8, opacity: 0.8 }}>
                检查了 {solvability.stats.interactiveControls} 个交互控件、
                {solvability.stats.hashInputs} 个 Hash 输入。
              </span>
              {solvability.repairs.map((repair) => (
                <div key={repair}>• {repair}</div>
              ))}
              {solvability.issues
                .filter((issue) => !issue.repaired && issue.severity === 'error')
                .map((issue) => (
                  <div key={`${issue.code}-${issue.field || ''}`}>• {issue.message}</div>
                ))}
            </div>
          )}
          <iframe
            srcDoc={html}
            style={{
              width: '100%',
              height: 500,
              border: '1px solid #334155',
              borderRadius: 8,
              background: '#fff',
            }}
            sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
          />

          {/* AI Edit */}
          <div
            style={{
              background: '#1e293b',
              borderRadius: 10,
              padding: 14,
              border: '1px solid #334155',
              marginTop: 12,
            }}
          >
            <h4 style={{ fontSize: 13, margin: '0 0 8px' }}>✏️ AI 修改</h4>
            <textarea
              placeholder="描述修改需求，如「增加一个计时器」「让背景变浅色」「添加防御方案对比」"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              style={{ ...inp, minHeight: 40 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={applyEdit}
                disabled={!editText.trim() || editBusy}
                style={{ ...btnPrimary, fontSize: 12, padding: '6px 12px' }}
              >
                {editBusy ? '修改中…' : '应用修改'}
              </button>
              <button
                onClick={saveToLesson}
                style={{ ...btnGhost, fontSize: 12, padding: '6px 12px' }}
              >
                📦 打包进课程
              </button>
            </div>
            {savedLesson && (
              <div style={{ marginTop: 8, fontSize: 13 }}>
                <Link href={`/teacher/prep/${savedLesson}`} style={{ color: '#60a5fa' }}>
                  → 打开课程编辑器
                </Link>
              </div>
            )}
          </div>
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
const btnPrimary: React.CSSProperties = {
  background: '#3b82f6',
  color: '#fff',
  border: 0,
  borderRadius: 8,
  padding: '8px 16px',
  fontSize: 14,
  cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  background: '#334155',
  color: '#94a3b8',
  border: '1px solid #475569',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
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
