'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type AgentCategory = 'teaching' | 'adversarial' | 'assessment' | 'generation' | 'orchestration';
type AgentStatus = 'ready' | 'guarded' | 'adapter-required';

interface AgentDefinition {
  id: string;
  name: string;
  englishName: string;
  category: AgentCategory;
  responsibility: string;
  inputs: string[];
  outputs: string[];
  execution: string;
  autonomy: string;
  status: AgentStatus;
  guardrails: string[];
}

interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  trigger: string;
  stages: Array<{
    id: string;
    label: string;
    agentIds: string[];
    gate?: string;
    evidence?: string;
  }>;
}

interface AgentPlatformResponse {
  summary: {
    total: number;
    ready: number;
    guarded: number;
    adapterRequired: number;
    workflows: number;
    policy: Record<string, boolean>;
  };
  agents: AgentDefinition[];
  workflows: WorkflowDefinition[];
}

const CATEGORY_LABELS: Record<AgentCategory | 'all', string> = {
  all: '全部',
  orchestration: '智能编排',
  generation: '场景生成',
  teaching: '教学助手',
  adversarial: '攻防对手',
  assessment: '评估裁判',
};

const STATUS_META: Record<AgentStatus, { label: string; color: string; background: string }> = {
  ready: { label: '可用', color: '#34d399', background: 'rgba(16,185,129,.12)' },
  guarded: { label: '受控启用', color: '#fbbf24', background: 'rgba(245,158,11,.12)' },
  'adapter-required': {
    label: '待接运行时',
    color: '#94a3b8',
    background: 'rgba(100,116,139,.14)',
  },
};

export default function AgentControlPlanePage() {
  const [data, setData] = useState<AgentPlatformResponse | null>(null);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<AgentCategory | 'all'>('all');
  const [workflowId, setWorkflowId] = useState('lesson-design');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/security/agents')
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || '加载失败');
        if (!cancelled) setData(payload as AgentPlatformResponse);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const agents = useMemo(
    () => data?.agents.filter((agent) => category === 'all' || agent.category === category) ?? [],
    [category, data],
  );
  const workflow = data?.workflows.find((item) => item.id === workflowId) ?? data?.workflows[0];
  const nameById = useMemo(
    () => new Map(data?.agents.map((agent) => [agent.id, agent.name]) ?? []),
    [data],
  );

  if (error) return <StatePanel tone="error" title="智能体中枢暂不可用" detail={error} />;
  if (!data) return <StatePanel title="正在加载智能体目录…" detail="读取角色、工作流和策略边界" />;

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <Link href="/teacher" style={{ fontSize: 12, color: '#64748b', textDecoration: 'none' }}>
        ← 教学驾驶舱
      </Link>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 24,
          alignItems: 'flex-end',
          margin: '12px 0 22px',
        }}
      >
        <div>
          <div style={{ color: '#22d3ee', fontSize: 11, letterSpacing: '.16em', marginBottom: 6 }}>
            AGENT CONTROL PLANE
          </div>
          <h1 style={{ fontSize: 24, margin: 0 }}>智能体中枢</h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '7px 0 0' }}>
            统一管理专业角色、协同链路、发布门禁和证据边界。
          </p>
        </div>
        <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'right' }}>
          <div>
            {data.summary.total} 个专业智能体 · {data.summary.workflows} 条工作流
          </div>
          <div style={{ color: '#34d399', marginTop: 3 }}>
            {data.summary.ready} 可用 · {data.summary.guarded} 受控启用
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 10,
          marginBottom: 22,
        }}
      >
        <Metric label="智能体总数" value={data.summary.total} accent="#38bdf8" />
        <Metric label="当前可用" value={data.summary.ready} accent="#34d399" />
        <Metric label="策略门禁" value={data.summary.guarded} accent="#fbbf24" />
        <Metric label="待接靶场" value={data.summary.adapterRequired} accent="#94a3b8" />
      </div>

      <section style={panelStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <div>
            <h2 style={{ fontSize: 16, margin: 0 }}>协同工作流</h2>
            <p style={{ fontSize: 12, color: '#64748b', margin: '5px 0 0' }}>
              每一步都有责任主体、证据输出和人工/策略门禁。
            </p>
          </div>
          <select
            value={workflow?.id}
            onChange={(event) => setWorkflowId(event.target.value)}
            style={selectStyle}
          >
            {data.workflows.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        {workflow && (
          <>
            <div
              style={{
                padding: '11px 13px',
                borderRadius: 9,
                background: '#0f172a',
                color: '#94a3b8',
                fontSize: 12,
                marginBottom: 14,
              }}
            >
              <span style={{ color: '#e2e8f0' }}>{workflow.description}</span> · 触发：
              {workflow.trigger}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${workflow.stages.length}, minmax(0, 1fr))`,
                gap: 8,
              }}
            >
              {workflow.stages.map((stage, index) => (
                <div
                  key={stage.id}
                  style={{
                    position: 'relative',
                    border: '1px solid #334155',
                    borderRadius: 10,
                    padding: 13,
                    background: '#111c2e',
                  }}
                >
                  <div style={{ fontSize: 10, color: '#22d3ee', marginBottom: 6 }}>
                    0{index + 1}
                  </div>
                  <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
                    {stage.label}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 9 }}>
                    {stage.agentIds.map((id) => (
                      <span key={id} style={chipStyle}>
                        {nameById.get(id) ?? id}
                      </span>
                    ))}
                  </div>
                  {stage.gate && (
                    <div style={{ marginTop: 9, fontSize: 11, color: '#fbbf24' }}>
                      门禁 · {stage.gate}
                    </div>
                  )}
                  {stage.evidence && (
                    <div style={{ marginTop: 5, fontSize: 11, color: '#64748b' }}>
                      证据 · {stage.evidence}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section style={{ ...panelStyle, marginTop: 14 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 14,
            alignItems: 'center',
            marginBottom: 15,
          }}
        >
          <div>
            <h2 style={{ fontSize: 16, margin: 0 }}>Agent Zoo</h2>
            <p style={{ fontSize: 12, color: '#64748b', margin: '5px 0 0' }}>
              “可用”表示已接入全局智能体运行时；“待接运行时”不会伪装成已具备真实攻防能力。
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {(Object.keys(CATEGORY_LABELS) as Array<AgentCategory | 'all'>).map((item) => (
              <button
                key={item}
                onClick={() => setCategory(item)}
                style={{
                  border: `1px solid ${category === item ? '#22d3ee' : '#334155'}`,
                  background: category === item ? 'rgba(34,211,238,.1)' : '#0f172a',
                  color: category === item ? '#67e8f9' : '#94a3b8',
                  borderRadius: 999,
                  padding: '5px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                {CATEGORY_LABELS[item]}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(285px, 1fr))',
            gap: 10,
          }}
        >
          {agents.map((agent) => {
            const status = STATUS_META[agent.status];
            return (
              <article
                key={agent.id}
                style={{
                  border: '1px solid #334155',
                  background: '#111c2e',
                  borderRadius: 12,
                  padding: 15,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    alignItems: 'flex-start',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                      {agent.name}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: '#64748b',
                        marginTop: 3,
                        letterSpacing: '.08em',
                      }}
                    >
                      {agent.englishName}
                    </div>
                  </div>
                  <span
                    style={{
                      color: status.color,
                      background: status.background,
                      borderRadius: 999,
                      padding: '3px 8px',
                      fontSize: 10,
                    }}
                  >
                    {status.label}
                  </span>
                </div>
                <p
                  style={{
                    minHeight: 54,
                    color: '#94a3b8',
                    fontSize: 12,
                    lineHeight: 1.55,
                    margin: '12px 0',
                  }}
                >
                  {agent.responsibility}
                </p>
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    color: '#64748b',
                    fontSize: 10,
                    marginBottom: 10,
                  }}
                >
                  <span style={chipStyle}>{agent.execution}</span>
                  <span style={chipStyle}>{agent.autonomy}</span>
                </div>
                <div style={{ borderTop: '1px solid #263449', paddingTop: 10 }}>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 5 }}>
                    关键安全边界
                  </div>
                  <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.55 }}>
                    {agent.guardrails.slice(0, 2).join(' · ')}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section
        style={{
          marginTop: 14,
          border: '1px solid rgba(34,211,238,.25)',
          borderRadius: 12,
          padding: 15,
          background: 'rgba(8,145,178,.08)',
        }}
      >
        <div style={{ color: '#67e8f9', fontSize: 12, fontWeight: 600 }}>平台级不变量</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0,1fr))',
            gap: 10,
            marginTop: 9,
            color: '#cbd5e1',
            fontSize: 11,
          }}
        >
          <span>LLM 可以建议，不能自行发布</span>
          <span>LLM 不能直接决定正式成绩</span>
          <span>Agent 不持有基础设施凭据</span>
          <span>可执行动作必须经过策略门禁</span>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div style={{ ...panelStyle, padding: 15 }}>
      <div style={{ color: accent, fontSize: 24, fontWeight: 700 }}>{value}</div>
      <div style={{ color: '#64748b', fontSize: 11, marginTop: 3 }}>{label}</div>
    </div>
  );
}

function StatePanel({
  title,
  detail,
  tone = 'default',
}: {
  title: string;
  detail: string;
  tone?: 'default' | 'error';
}) {
  return (
    <div style={{ ...panelStyle, padding: 28, color: tone === 'error' ? '#f87171' : '#94a3b8' }}>
      <div style={{ fontSize: 15 }}>{title}</div>
      <div style={{ fontSize: 12, marginTop: 6 }}>{detail}</div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 14,
  padding: 18,
};
const selectStyle: React.CSSProperties = {
  background: '#0f172a',
  color: '#cbd5e1',
  border: '1px solid #334155',
  borderRadius: 8,
  padding: '7px 10px',
  fontSize: 12,
  outline: 'none',
};
const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#94a3b8',
  borderRadius: 999,
  padding: '2px 7px',
  fontSize: 10,
};
