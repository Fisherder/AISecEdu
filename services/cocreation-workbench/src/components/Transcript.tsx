import { useEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  Copy,
  Download,
  FileText,
  GitBranch,
  Play,
  ShieldCheck,
  Sparkles,
  Terminal,
  Workflow,
  SlidersHorizontal,
} from 'lucide-react';
import { useWorkbench } from '../core/context';
import { api, id, key, safeLink } from '../core/api';
import { projectActivity, streamedAnswer } from '../core/events';
import { dateLabel, terminal, type Message, type Data } from '../core/types';
import { Button, IconButton, Status, Code, Dialog } from './ui';
import { Composer } from './Composer';
import { GenerationConfirmation } from './GenerationConfirmation';
import { readLocal, writeLocal } from '../core/storage';

export function RichText({ text }: { text: string }) {
  const { controller: c } = useWorkbench();
  return (
    <div className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) => (
            <a
              href={safeLink(href)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => {
                const match = href?.match(/^\/teacher\/artifacts\/([^?#/]+)/);
                if (match) {
                  event.preventDefault();
                  void c.openArtifact(decodeURIComponent(match[1])).catch(c.error);
                }
              }}
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <span className="image-link">
              {safeLink(src) ? (
                <a href={safeLink(src)} target="_blank" rel="noopener noreferrer">
                  {alt || '查看图片'}
                </a>
              ) : (
                alt
              )}
            </span>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
function Questions({ message }: { message: Message }) {
  const { state, controller: c } = useWorkbench();
  const answerKey = `aisecedu:requirements:${state.thread?.id}:${message.id}`;
  const [answers, setAnswers] = useState<Record<string, string>>(() => readLocal(answerKey, {}));
  const questions: Data[] = message.metadata.questions || [];
  useEffect(() => { writeLocal(answerKey, answers); }, [answerKey, answers]);
  if (!questions.length || message.metadata.questionReplyJobId || message.metadata.pending)
    return null;
  return (
    <form
      className="question-block"
      onSubmit={(event) => {
        event.preventDefault();
        void c.send({
          content: questions
            .map((question) => `${question.text}：${answers[question.id]}`)
            .join('\n'),
          questionReply: { sourceMessageId: message.id, answers },
        });
      }}
    >
      <h3>先明确需求</h3>
      <p>选择适合的答案，也可以直接填写你的想法。回答后将继续同一项任务。</p>
      {questions.map((question) => (
        <fieldset key={question.id}>
          <legend>{question.text}</legend>
          <div className="choice-list">
            {(question.choices || []).map((choice: string) => (
              <Button
                key={choice}
                className={answers[question.id] === choice ? 'selected' : ''}
                aria-pressed={answers[question.id] === choice}
                onClick={() => setAnswers({ ...answers, [question.id]: choice })}
              >
                {choice}
              </Button>
            ))}
          </div>
          <textarea
            aria-label={question.text}
            placeholder="选择一个选项，或输入你的回答"
            value={answers[question.id] || ''}
            onChange={(event) => setAnswers({ ...answers, [question.id]: event.target.value })}
            maxLength={2000}
            required
            rows={2}
          />
        </fieldset>
      ))}
      <button
        className="button primary"
        disabled={state.busy || questions.some((question) => !answers[question.id]?.trim())}
      >
        提交并继续
      </button>
    </form>
  );
}
function Options({ message }: { message: Message }) {
  const { state, controller: c } = useWorkbench();
  const bundle = message.metadata.generationOptions;
  const [selected, setSelected] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [feedback, setFeedback] = useState('');
  if (!bundle?.options?.length) return null;
  const option = bundle.options[Math.min(selected, bundle.options.length - 1)];
  const selection = message.metadata.generationSelection;
  const started = selection?.status === 'STARTED';
  const superseded = Boolean(message.metadata.generationRefinement);
  return (
    <section className="options-block">
      <header>
        <Workflow size={16} />
        <strong>生成方案</strong>
        <span className="quiet">审阅后开始制作</span>
      </header>
      <div className="option-tabs" role="tablist" aria-label="生成方案">
        {bundle.options.map((item: Data, index: number) => (
          <button
            role="tab"
            aria-selected={selected === index}
            key={item.id}
            onClick={() => setSelected(index)}
          >
            方案 {index + 1}
            {selection?.optionId === item.id && <Check size={12} />}
          </button>
        ))}
      </div>
      <div className="option-content" role="tabpanel">
        <h3>{option.title}</h3>
        <p>{option.description}</p>
        <ul>
          {(option.highlights || []).map((line: string) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <details>
          <summary>查看完整生成要求</summary>
          <RichText text={option.rewrittenPrompt || option.prompt || ''} />
        </details>
        <Button
          className="primary"
          disabled={state.busy || started || superseded}
          onClick={() =>
            bundle.artifactType === 'ctf-challenge'
              ? setConfirm(true)
              : void c.run(() => c.selectOption(message.id, option.id))
          }
        >
          <Play size={14} />
          {started ? '已开始生成' : superseded ? '已有新方案' : '采用此方案'}
        </Button>
      </div>
      {!started && !superseded && (
        <details className="refine-options">
          <summary>调整方案要求</summary>
          <textarea
            aria-label="方案修改要求"
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="说明需要保留和调整的部分"
            rows={2}
          />
          <Button
            disabled={!feedback.trim() || state.busy}
            onClick={() =>
              void c.run(async () => {
                await api(
                  `/threads/${id(state.thread!.id)}/messages/${message.id}/generation-options/refine`,
                  { method: 'POST', key: key(), body: { content: feedback } },
                );
                await c.refreshThread();
              })
            }
          >
            更新方案
          </Button>
        </details>
      )}
      {confirm && (
        <GenerationConfirmation
          bundle={bundle}
          option={option}
          messageId={message.id}
          onClose={() => setConfirm(false)}
        />
      )}
    </section>
  );
}
function Approvals({ message }: { message: Message }) {
  const { state, controller: c } = useWorkbench();
  const proposals: Data[] = message.metadata.toolProposals || [];
  if (message.metadata.pending !== false) return null;
  return (
    <>
      {proposals.map((proposal, index) => {
        const decision = message.metadata.toolProposalDecisions?.[String(index)];
        const result = message.metadata.toolExecutionResults?.[String(index)];
        if (!proposal.requiresConfirmation || decision || result?.status === 'SUCCEEDED')
          return null;
        return (
          <section className="approval-block" key={index}>
            <h3>
              <ShieldCheck size={17} />
              需要你批准
            </h3>
            <p>{proposal.reason || proposal.tool}</p>
            <details>
              <summary>查看操作详情</summary>
              <Code value={{ tool: proposal.tool, arguments: proposal.arguments }} />
            </details>
            <div className="button-row">
              <Button
                disabled={state.busy}
                onClick={() => void c.run(() => c.approve(message.id, index, 'REJECTED'))}
              >
                拒绝
              </Button>
              <Button
                className="primary"
                disabled={state.busy}
                onClick={() => void c.run(() => c.approve(message.id, index, 'APPROVED'))}
              >
                批准并继续
              </Button>
            </div>
          </section>
        );
      })}
    </>
  );
}
function CandidateSet({ candidateSetId, close }: { candidateSetId: string; close: () => void }) {
  const { state, controller: c } = useWorkbench();
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    let alive = true;
    void api(`/candidate-sets/${id(candidateSetId)}`)
      .then((result) => {
        if (alive) setData(result.candidateSet);
      })
      .catch(c.error);
    return () => {
      alive = false;
    };
  }, [candidateSetId, c]);
  return (
    <Dialog title="审阅生成成品" onClose={close} wide>
      <div className="dialog-body">
        {!data ? (
          <p>正在读取…</p>
        ) : (
          (data.candidates || []).map((candidate: Data) => (
            <section key={candidate.id} className="candidate">
              <h3>{candidate.title || candidate.content?.title || '生成成品'}</h3>
              <p>{candidate.summary || candidate.content?.summary}</p>
              {candidate.validation?.status && <Status status={candidate.validation.status} />}
              <details>
                <summary>检查生成内容</summary>
                <Code value={candidate.content} />
              </details>
              <Button
                className="primary"
                disabled={state.busy}
                onClick={() =>
                  void c.run(async () => {
                    const result = await api(`/candidates/${id(candidate.id)}/materialize`, {
                      method: 'POST',
                      body: {},
                    });
                    await c.loadArtifacts();
                    if (result.artifact?.id) {
                      await c.openArtifact(result.artifact.id);
                      close();
                    }
                  })
                }
              >
                打开成品工作区
              </Button>
            </section>
          ))
        )}
      </div>
    </Dialog>
  );
}
function MessageView({ message }: { message: Message }) {
  const { state, controller: c } = useWorkbench();
  const [copied, setCopied] = useState(false);
  const [candidates, setCandidates] = useState<string | null>(null);
  const metadata = message.metadata || {};
  const job = state.jobs.find((item) => item.id === metadata.jobId);
  const activity = useMemo(
    () => (job ? projectActivity(job.id, state.events[job.id] || [], terminal(job)) : []),
    [job?.id, job?.status, state.events],
  );
  const streamed = activity
    .filter((item) => item.kind === 'message')
    .map((item) => streamedAnswer(item.content || ''))
    .filter(Boolean)
    .at(-1);
  const plan: any[] = Array.isArray(metadata.plan) ? metadata.plan : [];
  const pending = metadata.pending === true;
  const waitingForAnswers = Boolean(metadata.questions?.length && !metadata.questionReplyJobId && !pending);
  const text = pending && streamed ? streamed : pending ? '' : message.content;
  const latest = [...activity]
    .reverse()
    .find((item) => item.kind !== 'message' && item.kind !== 'reasoning');
  const user = message.role === 'user';
  return (
    <article
      className={`message ${user ? 'user-message' : 'assistant-message'}`}
      data-message-id={message.id}
    >
      <div className="message-meta">
        {user ? (
          <span className="avatar user">
            {String(state.context.user?.name || '我').slice(0, 1)}
          </span>
        ) : (
          <span className="avatar">
            <Sparkles size={15} />
          </span>
        )}
        <strong>{user ? '你' : '玄甲'}</strong>
        <time>{dateLabel(message.created)}</time>
        {['ask', 'plan'].includes(metadata.executionMode) && (
          <span className="tag">{metadata.executionMode === 'plan' ? '规划' : '问答'}</span>
        )}
      </div>
      <div className="message-body">
        {plan.length > 0 && (
          <details className="plan-block" open={pending || metadata.executionMode === 'plan'}>
            <summary>
              <Workflow size={15} />
              任务计划<span>{plan.length} 项</span>
            </summary>
            <ol>
              {plan.map((step, index) => (
                <li key={index}>
                  {typeof step === 'string'
                    ? step
                    : step.title || step.description || step.step || JSON.stringify(step)}
                </li>
              ))}
            </ol>
          </details>
        )}
        {job && (
          <button className="run-summary" onClick={() => c.selectJob(job.id)}>
            <Status status={waitingForAnswers ? 'WAITING_INPUT' : job.status} />
            <span>{waitingForAnswers ? '等待你回答需求问题' : latest?.title || job.message || job.stage || '查看执行记录'}</span>
            <ArrowUpRight size={14} />
          </button>
        )}
        {text && <RichText text={text} />}
        {pending && !streamed && (
          <p className="quiet pending-text">
            {latest?.title ||
              (job?.status === 'QUEUED'
                ? '要求已保存，等待执行。'
                : '正在处理，执行记录会实时更新。')}
          </p>
        )}
        {metadata.executionMode === 'plan' && !pending && !metadata.failed && !metadata.questions?.length && (
          <Button
            className="primary"
            disabled={state.busy}
            onClick={() =>
              void c.send({
                content: '按这份计划执行。',
                planSourceMessageId: message.id,
              })
            }
          >
            <Play size={14} />
            按此计划制作
          </Button>
        )}
        <Questions message={message} />
        <Options message={message} />
        <Approvals message={message} />
        {(message.cards || []).map((card) => {
          const artifactId =
            card.type === 'artifact' || card.objectType === 'artifact' ? card.objectId : null;
          const candidateId =
            card.type === 'candidate-set' ||
            card.objectType === 'candidate-set' ||
            card.objectType === 'candidate_set'
              ? card.objectId
              : null;
          const jobId = card.type === 'job' || card.objectType === 'job' ? card.objectId : null;
          const href = safeLink(card.state?.href);
          return (
            <button
              className="result-card"
              key={card.id || card.objectId}
              disabled={!artifactId && !candidateId && !jobId && !href}
              onClick={() =>
                artifactId
                  ? void c.openArtifact(artifactId).catch(c.error)
                  : candidateId
                    ? setCandidates(candidateId)
                    : jobId
                      ? c.selectJob(jobId)
                      : href && window.open(href, '_blank', 'noopener')
              }
            >
              <FileText size={23} />
              <span>
                <small>
                  {artifactId ? '生成成品' : candidateId ? '生成结果' : card.title || '任务结果'}
                </small>
                <strong>{card.title || card.state?.title || '查看内容'}</strong>
                <span>{card.subtitle || card.state?.status || ''}</span>
              </span>
              <ArrowUpRight size={16} />
            </button>
          );
        })}
        {(metadata.files || []).map(
          (file: Data) =>
            safeLink(file.downloadUrl) && (
              <a
                className="file-result"
                key={file.id || file.downloadUrl}
                href={safeLink(file.downloadUrl)}
                download={file.filename}
              >
                <Download size={16} />
                {file.filename}
              </a>
            ),
        )}
        {!pending && (
          <div className="message-actions">
            <IconButton
              label={copied ? '已复制' : '复制消息'}
              onClick={() => {
                void navigator.clipboard
                  .writeText(message.content)
                  .then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  })
                  .catch(c.error);
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </IconButton>
            {!user && (
              <IconButton
                label="从当前会话创建分支"
                onClick={() => void c.run(() => c.fork(state.thread!.id))}
              >
                <GitBranch size={14} />
              </IconButton>
            )}
          </div>
        )}
      </div>
      {candidates && <CandidateSet candidateSetId={candidates} close={() => setCandidates(null)} />}
    </article>
  );
}
export function Welcome() {
  const { state, controller: c } = useWorkbench();
  const starters = [
    {
      title: '交互演示',
      subtitle: '让学生操作、决策与观察',
      icon: SlidersHorizontal,
      type: 'simulation',
      prompt:
        '制作一个可以直接用于课堂的交互演示。学生需要通过调整参数、做出决策并观察后果来掌握知识。主题：',
    },
    {
      title: '教学课件',
      subtitle: '内容、讲稿与课堂互动',
      icon: FileText,
      type: 'slide-deck',
      prompt: '帮我制作一份可以直接授课的课件，包含讲稿与课堂互动。主题：',
    },
    {
      title: 'CTF 实践题',
      subtitle: '独立环境与真实练习',
      icon: Terminal,
      type: 'auto',
      prompt: '设计一组 CTF 实践题，包含可运行环境、分层提示和验证。主题：',
    },
  ];
  return (
    <div className="welcome">
      <div className="welcome-heading">
        <span className="welcome-symbol">
          <Sparkles size={24} />
        </span>
        <h1>今天，一起做出什么？</h1>
        <p>从一个教学想法，到可以直接使用的课堂成品。</p>
      </div>
      <Composer welcome />
      <div className="starter-grid">
        {starters.map((item) => (
          <Button
            key={item.title}
            onClick={() => {
              c.setDraft({ text: item.prompt, artifactType: item.type });
              window.dispatchEvent(new Event('workbench-focus-composer'));
            }}
          >
            <item.icon size={18} />
            <span>
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
            </span>
          </Button>
        ))}
      </div>
      <section className="recent-work">
        <header>
          <h2>继续创作</h2>
          <Button onClick={() => c.setPanel('artifacts')}>
            全部成品
            <ArrowUpRight size={13} />
          </Button>
        </header>
        {state.artifacts.slice(0, 4).map((artifact) => (
          <button key={artifact.id} onClick={() => void c.openArtifact(artifact.id).catch(c.error)}>
            <FileText size={16} />
            <strong>{artifact.title}</strong>
            <span>V{artifact.currentRevision}</span>
            <small>{dateLabel(artifact.updated)}</small>
            <ArrowUpRight size={14} />
          </button>
        ))}
        {!state.artifacts.length && (
          <p className="quiet">生成的课件、演示和题目会保存在这里，随时继续修改。</p>
        )}
      </section>
    </div>
  );
}
export function Transcript() {
  const { state } = useWorkbench();
  const scroll = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const [away, setAway] = useState(false);
  const messages = state.thread?.messages || [];
  useEffect(() => {
    if (stuck.current) bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages, state.events]);
  useEffect(() => {
    stuck.current = true;
    setAway(false);
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [state.thread?.id]);
  if (!state.thread || !messages.length) return <Welcome />;
  return (
    <div className="conversation">
      <div
        ref={scroll}
        className="transcript-scroll"
        onScroll={() => {
          const element = scroll.current!;
          stuck.current = element.scrollHeight - element.scrollTop - element.clientHeight < 140;
          setAway(!stuck.current);
        }}
      >
        <div className="transcript">
          {messages
            .filter((message) => !message.metadata?.hidden)
            .map((message) => (
              <MessageView key={message.id} message={message} />
            ))}
          <div ref={bottom} />
        </div>
      </div>
      {away && (
        <Button
          className="jump-latest"
          onClick={() => {
            stuck.current = true;
            bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }}
        >
          <ArrowDown size={14} />
          回到最新
        </Button>
      )}
      <Composer />
    </div>
  );
}
