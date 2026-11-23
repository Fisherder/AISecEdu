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
  Layers,
  GitBranch,
  Ellipsis,
  Activity,
  ThumbsUp,
  ThumbsDown,
  Volume2,
  Square,
  Play,
  Pencil,
  ShieldCheck,
  Sparkles,
  Terminal,
  Workflow,
  SlidersHorizontal,
} from 'lucide-react';
import { useWorkbench } from '../core/context';
import { api, id, key, safeLink, ApiError } from '../core/api';
import { projectActivity, streamedAnswer } from '../core/events';
import { classroomDashboardLink, classroomPreparation } from '../core/classroom-preparation';
import { dateLabel, terminal, type Message, type Data } from '../core/types';
import { useReplySpeech } from '../core/reply-speech';
import { conversationDate, conversationTimeLabel, messageClock, startsTimeGroup } from '../core/conversation-time';
import { Button, IconButton, Status, Code } from './ui';
import { CandidateSet } from './CandidateSet';
import { Composer } from './Composer';
import { GenerationConfirmation } from './GenerationConfirmation';
import { readLocal, writeLocal } from '../core/storage';
import { FileGlyph } from '../panels/FilePreview';
import { asConversationFile, conversationFiles, fileFormatLabel, fileSize, fileUrl } from '../core/conversation-files';
import { canStartTeachingProject, displayTeachingReply, teachingProjects } from '../core/teaching-projects';

export function RichText({ text }: { text: string }) {
  const { controller: c, state } = useWorkbench();
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
                if (event.button || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
                const linkedFile = href && conversationFiles(state.thread?.messages).find(file => href === fileUrl(file));
                if (linkedFile) {
                  event.preventDefault();
                  c.openFile(linkedFile);
                  return;
                }
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
  const [active, setActive] = useState(0);
  const [custom, setCustom] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const questions: Data[] = message.metadata.questions || [];
  useEffect(() => { writeLocal(answerKey, answers); }, [answerKey, answers]);
  useEffect(() => { if (custom) input.current?.focus(); }, [custom]);
  if (!questions.length || message.metadata.pending) return null;
  if (message.metadata.questionReplyJobId) return <span className="question-complete"><Check size={14} />需求已答复</span>;
  const question = questions[active];
  if (!question) return null;
  const choices: string[] = question.choices || [];
  const selected = answers[question.id] || '';
  const customOpen = custom || !choices.length || Boolean(selected && !choices.includes(selected));
  const move = (index: number) => { setActive(index); setCustom(false); };
  const last = active === questions.length - 1;
  return (
    <form
      className="question-block"
      onSubmit={(event) => {
        event.preventDefault();
        if (!selected.trim()) return;
        if (!last) { move(active + 1); return; }
        const unanswered = questions.findIndex((item) => !answers[item.id]?.trim());
        if (unanswered >= 0) { move(unanswered); return; }
        void c.send({
          content: questions.map((item) => answers[item.id].trim()).join('\n'),
          questionReply: { sourceMessageId: message.id, answers },
        });
      }}
    >
      <header className="question-header">
        <strong>确认教学需求</strong>
        {questions.length > 1 && <span>{active + 1} / {questions.length}</span>}
      </header>
      <fieldset key={question.id}>
        <legend>{question.text}</legend>
        {choices.length > 0 && (
          <div className="choice-list">
            {choices.map((choice, index) => (
              <button
                key={choice}
                className={selected === choice ? 'selected' : ''}
                type="button"
                aria-pressed={selected === choice}
                onClick={() => { setAnswers({ ...answers, [question.id]: choice }); setCustom(false); }}
              >
                <span className="choice-indicator" aria-hidden="true">{selected === choice && <Check size={13} />}</span>
                <span><strong>{choice}</strong>{question.descriptions?.[index] &&
                  <small>{question.descriptions[index]}</small>}</span>
              </button>
            ))}
          </div>
        )}
        {customOpen ? (
          <textarea
            ref={input}
            aria-label={question.text}
            placeholder="填写你的回答"
            value={choices.includes(selected) ? '' : selected}
            onChange={(event) => setAnswers({ ...answers, [question.id]: event.target.value })}
            maxLength={750}
            required
            rows={2}
          />
        ) : <button type="button" className="question-custom" onClick={() => { setAnswers({ ...answers, [question.id]: '' }); setCustom(true); }}>自己填写</button>}
      </fieldset>
      <footer>
        {active > 0 && <button type="button" className="button" onClick={() => move(active - 1)}>上一个</button>}
        <button type="submit" className="button primary" disabled={state.busy || !selected.trim()}>
          {last ? '提交并继续' : '下一个'}
        </button>
      </footer>
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
        if (proposal.tool === 'classroom.prepare') {
          const thread = state.thread;
          if (!thread) return null;
          const preparation = classroomPreparation(thread, message, index);
          const disabled = state.busy || state.loadingThread;
          return (
            <section className="approval-block" key={index}>
              <h3><ShieldCheck size={17} />准备课堂</h3>
              <p>{proposal.reason || '使用已发布的静态课件准备课堂。'}</p>
              {!preparation ? (
                <p>请返回原课程和章节并核对提案及批准记录。</p>
              ) : preparation.sessionId ? (
                <>
                  <p role="status">课堂已准备。开始上课需要教师确认。</p>
                  <a href={classroomDashboardLink(thread.id, preparation.sessionId)}>查看已准备的课堂</a>
                </>
              ) : preparation.decision === 'REJECTED' ? (
                <p role="status">已拒绝课堂准备。</p>
              ) : preparation.decision === 'APPROVED' ? (
                <Button className="primary" disabled={disabled}
                  onClick={() => void c.run(() => c.prepareClassroom(thread.id, message.id, index))}>
                  继续准备课堂
                </Button>
              ) : (
                <>
                  <details>
                    <summary>查看操作详情</summary>
                    <Code value={{ tool: proposal.tool, arguments: proposal.arguments }} />
                  </details>
                  <div className="button-row">
                    <Button disabled={disabled}
                      onClick={() => void c.run(() => c.prepareClassroom(thread.id, message.id, index, 'REJECTED'))}>
                      拒绝
                    </Button>
                    <Button className="primary" disabled={disabled}
                      onClick={() => void c.run(() => c.prepareClassroom(thread.id, message.id, index, 'APPROVED'))}>
                      批准并准备课堂
                    </Button>
                  </div>
                </>
              )}
            </section>
          );
        }
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
function ReplyActions({ message, jobId, readText, speech }: {
  message: Message;
  jobId?: string;
  readText?: () => string;
  speech: ReturnType<typeof useReplySpeech>;
}) {
  const { state, controller: c } = useWorkbench();
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const metadata = message.metadata || {};
  const feedback = metadata.replyFeedback;
  const speaking = speech.speakingId === message.id;
  const canFork = !metadata.failed && !['FAILED', 'CANCELED'].includes(metadata.jobStatus);
  const menuId = `reply-more-${message.id}`;
  const setFeedback = async (value: 'positive' | 'negative') => {
    if (!state.thread || saving) return;
    setSaving(true);
    try {
      await c.setReplyFeedback(state.thread.id, message.id, feedback === value ? null : value);
    } catch (error) {
      c.error(error);
    } finally {
      setSaving(false);
    }
  };
  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: Event) => {
      if (menu.current && !event.composedPath().includes(menu.current)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside, true);
    document.addEventListener('focusin', closeOutside, true);
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true);
      document.removeEventListener('focusin', closeOutside, true);
    };
  }, [menuOpen]);
  return (
    <>
      <IconButton label="有帮助" aria-pressed={feedback === 'positive'} disabled={saving}
        onClick={() => void setFeedback('positive')}><ThumbsUp size={15} /></IconButton>
      <IconButton label="需改进" aria-pressed={feedback === 'negative'} disabled={saving}
        onClick={() => void setFeedback('negative')}><ThumbsDown size={15} /></IconButton>
      {readText && <IconButton label={speaking ? '停止朗读' : '朗读回复'}
        title={speech.supported ? (speaking ? '停止朗读' : '朗读回复') : '此浏览器不支持朗读'}
        disabled={!speech.supported}
        onClick={() => speech.toggle(message.id, readText())}>
        {speaking ? <Square size={14} /> : <Volume2 size={15} />}
      </IconButton>}
      {(canFork || jobId) && <div className="reply-more" ref={menu}
        onKeyDown={event => {
          if (event.key !== 'Escape' || !menuOpen) return;
          event.preventDefault();
          setMenuOpen(false);
          menuTrigger.current?.focus();
        }}>
        <button type="button" className="button icon-button" aria-label="更多回复操作" title="更多回复操作"
          ref={menuTrigger} aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined}
          onClick={() => setMenuOpen(open => !open)}><Ellipsis size={16} /></button>
        {menuOpen && <div className="reply-menu" id={menuId} role="group" aria-label="更多回复操作">
          {canFork && <Button disabled={state.busy} onClick={() => {
            setMenuOpen(false);
            const threadId = state.thread?.id;
            if (threadId) void c.run(() => c.fork(threadId, message.id));
          }}><GitBranch size={14} />从此回复创建分支</Button>}
          {jobId && <Button onClick={() => {
            setMenuOpen(false);
            menuTrigger.current?.focus();
            c.selectJob(jobId);
          }}><Activity size={14} />查看执行记录</Button>}
        </div>}
      </div>}
    </>
  );
}

function MessageView({ message, onResent, speech }: {
  message: Message;
  onResent: () => void;
  speech: ReturnType<typeof useReplySpeech>;
}) {
  const { state, controller: c } = useWorkbench();
  const [copied, setCopied] = useState(false);
  const [touchActions, setTouchActions] = useState(false);
  const [editor, setEditor] = useState<{ content: string; last: number } | null>(null);
  const [editError, setEditError] = useState('');
  const [resending, setResending] = useState(false);
  const messageBody = useRef<HTMLDivElement>(null);
  const editField = useRef<HTMLTextAreaElement>(null);
  const editTrigger = useRef<HTMLButtonElement>(null);
  const editing = editor !== null;
  useEffect(() => {
    if (editing) editField.current?.focus({ preventScroll: true });
  }, [editing]);
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
  const content = pending && streamed ? streamed : pending ? '' : message.content;
  const scoped = document.getElementById('cocreation-workbench')?.dataset.scopedTeaching === 'true';
  const text = metadata.questions?.length && content === '我需要确认一个会影响成品的选择。'
    ? '' : scoped && message.role === 'assistant' ? displayTeachingReply(content) : content;
  const latest = [...activity]
    .reverse()
    .find((item) => item.kind !== 'message' && item.kind !== 'reasoning');
  const user = message.role === 'user';
  const time = conversationDate(job && terminal(job) ? job.completed : undefined) || conversationDate(message.created);
  const timestamp = time && <time dateTime={time.toISOString()} title={conversationTimeLabel(time)}>{messageClock(time)}</time>;
  const canEdit = user && state.thread?.status === 'ACTIVE' && !metadata.hidden && Boolean(message.content.trim());
  const validEdit = Boolean(editor?.content.trim() && editor.content.trim() !== message.content.trim());
  const cancelEdit = () => {
    setEditor(null);
    requestAnimationFrame(() => editTrigger.current?.focus({ preventScroll: true }));
  };
  const submitEdit = async () => {
    const thread = state.thread;
    if (!thread || !editor || !validEdit || resending) return;
    setResending(true);
    setEditError('');
    try {
      await c.replaceMessage(thread.id, message.id, editor.content.trim(), editor.last);
      setEditor(null);
      onResent();
    } catch (error) {
      setEditError(error instanceof ApiError ? error.message : '消息暂时无法重发，请重试。');
    } finally {
      setResending(false);
    }
  };
  return (
    <article
      className={`message ${user ? 'user-message' : 'assistant-message'}`}
      data-message-id={message.id}
      data-editing={editing || undefined}
      data-show-actions={touchActions || undefined}
      aria-label={user ? '你的消息' : '玄甲回复'}
    >
      <div className="message-body" ref={messageBody} onPointerUp={event => {
        if (!editing && event.pointerType === 'touch' &&
            event.target instanceof Element && !event.target.closest('a,button,input,textarea,summary'))
          setTouchActions(value => !value);
      }}>
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
        {job && (pending || waitingForAnswers || job.status === 'FAILED' || job.status === 'CANCELED') && (
          <button className="run-summary" onClick={() => c.selectJob(job.id)}>
            <Status status={waitingForAnswers ? 'WAITING_INPUT' : job.status} />
            {!waitingForAnswers && <span>{latest?.title || job.message || job.stage || '查看执行记录'}</span>}
            <ArrowUpRight size={14} />
          </button>
        )}
        {editor ? (
          <form className="message-editor" onSubmit={event => { event.preventDefault(); void submitEdit(); }}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Escape' && !resending) { event.preventDefault(); cancelEdit(); }
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void submitEdit(); }
            }}>
            <textarea ref={editField} aria-label="编辑消息" value={editor.content} maxLength={16000}
              disabled={resending} rows={Math.max(3, Math.min(9, editor.content.split('\n').length + 1))}
              onChange={event => setEditor({ ...editor, content: event.target.value })} />
            <p className="message-editor-note">重发会替换这条消息及之后的对话。</p>
            {editError && <p className="message-editor-error" role="alert">{editError}</p>}
            <div className="message-editor-actions">
              <Button type="button" disabled={resending} onClick={cancelEdit}>取消</Button>
              <Button type="submit" className="primary" disabled={!validEdit || resending}>
                {resending ? '正在重发' : '重发'}
              </Button>
            </div>
          </form>
        ) : text && <RichText text={text} />}
        {pending && !job && <p className="quiet pending-text" role="status">正在接收要求…</p>}
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
              <span className="result-glyph" aria-hidden="true">{card.state?.artifactType === 'simulation' ? <Play size={18} /> : <FileText size={19} />}</span>
              <span>
                <small>
                  {artifactId ? (card.state?.artifactType === 'simulation' ? '动态仿真' : card.state?.artifactType === 'slide-deck' ? '课件' : '生成成品') : candidateId ? (card.state?.kind === 'slide-deck' ? '课件方案' : '生成结果') : card.title || '任务结果'}
                </small>
                <strong>{card.title || card.state?.title || '查看内容'}</strong>
                <span>{card.subtitle || (artifactId && card.state?.status === 'READY' ? '打开预览' : card.state?.status || '')}</span>
              </span>
              <ArrowUpRight size={16} />
            </button>
          );
        })}
        {(metadata.files || []).map((value: Data) => {
          const file = asConversationFile(value);
          if (!file) {
            const href = safeLink(value.downloadUrl);
            return href && <a className="file-result" key={value.id || href} href={href}
              download={value.filename}><Download size={16} />{value.filename}</a>;
          }
          const active = state.panel === 'files' && state.panelOpen && state.selectedFile?.id === file.id;
          return (
            <div className="conversation-file" key={file.id} data-active={active}>
              <button type="button" className="conversation-file-open" aria-label={`预览 ${file.filename}`}
                aria-expanded={active} aria-controls={active ? "workbench-file-preview" : undefined} onClick={() => c.openFile(file)}>
                <span className="conversation-file-icon"><FileGlyph format={file.format} /></span>
                <span className="conversation-file-name">
                  <strong title={file.filename}>{file.filename}</strong>
                  <small>{fileFormatLabel(file.format)}{file.size > 0 ? ` · ${fileSize(file.size)}` : ''}</small>
                </span>
              </button>
              <a className="button icon-button" href={fileUrl(file)} download={file.filename}
                aria-label={`下载 ${file.filename}`} title="下载原文件"><Download size={16} /></a>
            </div>
          );
        })}
        {!pending && (
          <div className="message-actions" hidden={editing} role="group"
            aria-label={user ? '消息操作' : '回复操作'}>
            {user && timestamp}
            <IconButton
              label={copied ? '已复制' : '复制消息'}
              onClick={() => {
                void navigator.clipboard
                  .writeText(text)
                  .then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  })
                  .catch(c.error);
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </IconButton>
            {canEdit && <IconButton label="编辑并重发消息" onClick={event => {
              editTrigger.current = event.currentTarget;
              const last = state.thread?.messages?.at(-1)?.id;
              if (last === undefined) return;
              setEditError('');
              setEditor({ content: message.content, last });
            }}><Pencil size={14} /></IconButton>}
            {!user && <>
              <ReplyActions message={message} jobId={job?.id} speech={speech}
                readText={text ? () => messageBody.current?.querySelector<HTMLElement>(':scope > .markdown')?.innerText || '' : undefined} />
              {timestamp}
            </>}
          </div>
        )}
      </div>
      {candidates && <CandidateSet candidateSetId={candidates} close={() => setCandidates(null)} />}
    </article>
  );
}
export function Welcome() {
  const { state, controller: c } = useWorkbench();
  const productionStarters = [
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
  const scoped = document.getElementById('cocreation-workbench')?.dataset.scopedTeaching === 'true';
  const starters = !scoped ? productionStarters : canStartTeachingProject(state)
    ? teachingProjects.map((item, index) => ({ ...item, type: 'auto', icon: [Layers, SlidersHorizontal, FileText][index] }))
    : [
        {
          title: '教案与讲义', subtitle: '生成可下载的 Word 草稿', icon: FileText, type: 'auto',
          prompt: '请生成一份 Word 教案，包含教学目标、课堂活动和小结。主题：',
        },
        {
          title: '课堂练习', subtitle: '编写题目、答案和讲解', icon: SlidersHorizontal, type: 'auto',
          prompt: '请生成一份 Markdown 课堂练习文档，包含三道题、参考答案和讲解。主题：',
        },
        {
          title: '课件提纲', subtitle: '组织各页重点和讲授顺序', icon: Layers, type: 'auto',
          prompt: '请制作一份 Word 教学讲义，按五张幻灯片的顺序编排标题、要点和讲解提示。主题：',
        },
      ];
  return (
    <div className="conversation">
      <div className="transcript-scroll">
        <div className="welcome">
        <div className="welcome-heading">
          <span className="welcome-symbol">
            <Sparkles size={24} />
          </span>
          <h1>今天，一起做出什么？</h1>
          <p>从一个教学想法，到可以直接使用的课堂成品。</p>
        </div>
        <div className="starter-grid">
          {starters.map((item) => (
            <Button
              key={item.title}
              onClick={() => {
                c.setDraft({ text: item.prompt, artifactType: item.type, ...(scoped ? { learningPattern: '' } : {}) });
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
      </div>
      <Composer welcome />
    </div>
  );
}
export function Transcript() {
  const { state, controller: c } = useWorkbench();
  const speech = useReplySpeech(state.thread?.id, c.error);
  const scroll = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const [away, setAway] = useState(false);
  const messages = state.thread?.messages || [];
  const visible = messages.filter(message => !message.metadata?.hidden);
  const playingMessageStillVisible = visible.some(message => message.id === speech.speakingId);
  useEffect(() => {
    if (speech.speakingId !== null && !playingMessageStillVisible) speech.stop();
  }, [playingMessageStillVisible, speech.speakingId, speech.stop]);
  let previous: Date | undefined;
  let previousCompleted: Date | undefined;
  const completedByJob = new Map(state.jobs.map(job => [job.id, job.completed]));
  const groups = visible.map(message => {
    const date = conversationDate(message.created);
    const divider = date && startsTimeGroup(date, previous, previousCompleted) ? date : undefined;
    if (date) {
      previous = date;
      previousCompleted = message.role === 'assistant'
        ? conversationDate(completedByJob.get(message.metadata?.jobId)) : undefined;
    }
    return { message, divider };
  });
  const showLatest = () => {
    stuck.current = true;
    setAway(false);
    bottom.current?.scrollIntoView({ block: 'end' });
  };
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
          {groups.map(({ message, divider }) => (
            <div key={message.id}>
              {divider && <div className="conversation-time-divider">
                <time dateTime={divider.toISOString()}>{conversationTimeLabel(divider)}</time>
              </div>}
              <MessageView message={message} onResent={showLatest} speech={speech} />
            </div>
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
