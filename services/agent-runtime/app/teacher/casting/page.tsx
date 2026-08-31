'use client';

import { useState } from 'react';
import Link from 'next/link';

interface AgentDef {
  name: string;
  role: 'teacher' | 'student';
  persona: string;
}

const PRESETS: AgentDef[] = [
  {
    name: 'AI 安全教授',
    role: 'teacher',
    persona: '你是网络安全教授，讲解严谨，善于用威胁模型拆解问题。强调防御与伦理。',
  },
  {
    name: '杠精同学',
    role: 'student',
    persona: '你专门在圆桌辩论环节反驳 AI 老师的观点，用批判性思维挑漏洞。说话简短犀利。',
  },
  {
    name: '小白同学',
    role: 'student',
    persona: '你基础薄弱，专门问一些基础问题替不敢提问的学生扫清盲区。用日常语言。',
  },
  {
    name: '学霸助教',
    role: 'student',
    persona: '你擅长在白板上画出复杂的推导公式和攻击链路图，补充老师的讲解。',
  },
];

export default function CastingPage() {
  const [agents, setAgents] = useState<AgentDef[]>(PRESETS);
  const [topic, setTopic] = useState('');
  const [jobId, setJobId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  function update(i: number, field: keyof AgentDef, val: string) {
    const next = [...agents];
    next[i] = { ...next[i]!, [field]: val };
    setAgents(next);
  }
  function add() {
    setAgents([...agents, { name: '新角色', role: 'student', persona: '描述人设…' }]);
  }
  function remove(i: number) {
    setAgents(agents.filter((_, j) => j !== i));
  }
  function loadPreset() {
    setAgents(PRESETS);
  }

  async function createClassroom() {
    if (!topic.trim() || busy) return;
    setBusy(true);
    setResult('');
    try {
      const r = await fetch('/api/security/roleplay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'roleplay', topic: topic.trim(), customAgents: agents }),
      }).then((r) => r.json());
      if (r.jobId) {
        setJobId(r.jobId);
        setResult('课堂生成中… jobId=' + r.jobId + '\n轮询: /api/generate-classroom/' + r.jobId);
      } else setResult('失败: ' + (r.error || '未知'));
    } catch {
      setResult('网络错误');
    }
    setBusy(false);
  }

  return (
    <div>
      <Link href="/teacher" style={{ fontSize: 13, color: '#64748b' }}>
        ← 工作台
      </Link>
      <h1 style={{ fontSize: 20, margin: '12px 0 4px' }}>🎭 选角中心</h1>
      <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 20px' }}>
        为课堂配置 AI 角色人设，创建互动场景
      </p>

      {/* Agent editor */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <h3 style={{ fontSize: 15, margin: 0 }}>角色阵容（{agents.length}）</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={loadPreset} style={btnGhost}>
              重置为预设
            </button>
            <button onClick={add} style={btnGhost}>
              + 添加角色
            </button>
          </div>
        </div>

        {agents.map((a, i) => (
          <div
            key={i}
            style={{
              background: '#1e293b',
              borderRadius: 10,
              padding: 14,
              border: '1px solid #334155',
              marginBottom: 10,
            }}
          >
            <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
              <input
                value={a.name}
                onChange={(e) => update(i, 'name', e.target.value)}
                placeholder="角色名"
                style={{ ...inp, flex: 1 }}
              />
              <select
                value={a.role}
                onChange={(e) => update(i, 'role', e.target.value)}
                style={{ ...inp, width: 100 }}
              >
                <option value="teacher">教师</option>
                <option value="student">学生</option>
              </select>
              <button onClick={() => remove(i)} style={{ ...miniBtn, color: '#f87171' }}>
                ✕
              </button>
            </div>
            <textarea
              value={a.persona}
              onChange={(e) => update(i, 'persona', e.target.value)}
              placeholder="详细人设描述（性格/说话风格/专业倾向）"
              style={{ ...inp, minHeight: 50 }}
            />
          </div>
        ))}
      </div>

      {/* Create classroom */}
      <div
        style={{
          background: '#1e293b',
          borderRadius: 12,
          padding: 16,
          border: '1px solid #334155',
        }}
      >
        <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>创建角色扮演课堂</h3>
        <input
          placeholder="场景主题，如「佛罗里达水厂投毒事件应急响应」"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          style={inp}
        />
        <button onClick={createClassroom} disabled={!topic.trim() || busy} style={btnPrimary}>
          {busy ? '⏳ 创建中…' : '🎬 创建课堂'}
        </button>
        {result && (
          <pre style={{ fontSize: 12, color: '#94a3b8', marginTop: 8, whiteSpace: 'pre-wrap' }}>
            {result}
          </pre>
        )}
        {jobId && (
          <button
            onClick={async () => {
              const s = await fetch(`/api/generate-classroom/${jobId}`).then((r) => r.json());
              setResult(
                'status: ' +
                  s.status +
                  ' | scenes: ' +
                  (s.scenesGenerated || 0) +
                  '/' +
                  (s.totalScenes || 0),
              );
            }}
            style={{ ...miniBtn, marginTop: 8 }}
          >
            刷新状态
          </button>
        )}
      </div>
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
