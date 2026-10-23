import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Square,
  Plus,
  Paperclip,
  BookOpen,
  WandSparkles,
  X,
  CornerDownLeft,
  Clock3,
  Pencil,
  Check,
  LoaderCircle,
} from 'lucide-react';
import { useWorkbench } from '../core/context';
import { modeLabels, terminal, type Mode, type PendingTurn } from '../core/types';
import { Button, IconButton } from './ui';

function QueueRow({ turn }: { turn: PendingTurn }) {
  const { state, controller: c } = useWorkbench();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(turn.content);
  return (
    <div className="queue-row">
      <Clock3 size={14} />
      <div>
        <small>
          {turn.delivery === 'next-step'
            ? turn.acknowledgedAtBoundary
              ? '补充已接收'
              : '下一步补充'
            : '当前任务后执行'}
        </small>
        {editing ? (
          <textarea
            aria-label="修改排队要求"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={3}
          />
        ) : (
          <p>{turn.content}</p>
        )}
      </div>
      {editing ? (
        <>
          <IconButton
            label="保存排队要求"
            disabled={state.busy || !text.trim()}
            onClick={() =>
              void c.run(async () => {
                await c.editQueue(turn.jobId, text, turn.revision);
                setEditing(false);
              })
            }
          >
            <Check size={15} />
          </IconButton>
          <IconButton label="取消编辑" onClick={() => setEditing(false)}>
            <X size={15} />
          </IconButton>
        </>
      ) : (
        <>
          <IconButton
            label="编辑排队要求"
            onClick={() => {
              setText(turn.content);
              setEditing(true);
            }}
          >
            <Pencil size={14} />
          </IconButton>
          <IconButton
            label="撤回排队要求"
            disabled={state.busy}
            onClick={() => void c.run(() => c.cancel(turn.jobId))}
          >
            <X size={15} />
          </IconButton>
        </>
      )}
    </div>
  );
}
export function Composer({ welcome = false }: { welcome?: boolean }) {
  const { state, controller: c } = useWorkbench();
  const input = useRef<HTMLTextAreaElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const [plus, setPlus] = useState(false);
  const [drag, setDrag] = useState(false);
  const draft = state.draft;
  const active = state.jobs.find((job) => job.threadId === state.thread?.id && !terminal(job));
  const archived = state.thread?.status === 'ARCHIVED';
  const canSend =
    Boolean(draft.text.trim()) &&
    !state.busy &&
    !state.loadingThread &&
    !state.uploads.length &&
    !archived;
  useEffect(() => {
    if (input.current) {
      input.current.style.height = 'auto';
      input.current.style.height = Math.min(200, input.current.scrollHeight) + 'px';
    }
  }, [draft.text]);
  useEffect(() => {
    const focus = () => input.current?.focus();
    window.addEventListener('workbench-focus-composer', focus);
    return () => window.removeEventListener('workbench-focus-composer', focus);
  }, []);
  return (
    <div className={`composer-area ${welcome ? 'welcome-composer' : ''}`}>
      {(state.thread?.pendingTurns || []).length > 0 && (
        <div className="queue-dock" aria-label="待处理要求">
          {state.thread?.pendingTurns?.map((turn) => (
            <QueueRow key={turn.jobId} turn={turn} />
          ))}
        </div>
      )}
      {archived ? (
        <div className="archive-notice">
          此会话已归档。
          <Button
            onClick={() => void c.run(() => c.updateThread(state.thread!.id, { archived: false }))}
          >
            恢复会话
          </Button>
        </div>
      ) : (
        <div
          className={`composer ${drag ? 'dragging' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDrag(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDrag(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDrag(false);
            if (event.dataTransfer.files.length)
              void c.upload([...event.dataTransfer.files]).catch(c.error);
          }}
        >
          {(draft.sources.length > 0 || draft.skills.length > 0 || state.uploads.length > 0) && (
            <div className="context-chips">
              {draft.sources.map((source) => (
                <span className="chip" key={source.id}>
                  <Paperclip size={12} />
                  <span>{source.name}</span>
                  <IconButton
                    label={`移除引用 ${source.name}`}
                    onClick={() =>
                      c.setDraft({ sources: draft.sources.filter((item) => item.id !== source.id) })
                    }
                  >
                    <X size={12} />
                  </IconButton>
                </span>
              ))}
              {draft.skills.map((skill) => (
                <span className="chip" key={skill}>
                  <WandSparkles size={12} />/{skill}
                  <IconButton
                    label={`移除技能 ${skill}`}
                    onClick={() =>
                      c.setDraft({ skills: draft.skills.filter((item) => item !== skill) })
                    }
                  >
                    <X size={12} />
                  </IconButton>
                </span>
              ))}
              {state.uploads.map((item) => (
                <span className={`chip ${item.state}`} key={item.id} title={item.error}>
                  {item.state === 'uploading' && <LoaderCircle size={12} className="spin" />}
                  <span>
                    {item.name}
                    {item.state === 'error' ? ' · 上传失败' : ' · 上传中'}
                  </span>
                  {item.state === 'error' && (
                    <IconButton
                      label="移除失败上传"
                      onClick={() =>
                        c.patch({
                          uploads: state.uploads.filter((upload) => upload.id !== item.id),
                        })
                      }
                    >
                      <X size={12} />
                    </IconButton>
                  )}
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={input}
            id="workbench-prompt"
            aria-label="输入教学要求"
            placeholder={
              drag
                ? '松开以添加文件'
                : draft.mode === 'plan'
                  ? '描述目标，先一起审阅计划…'
                  : draft.mode === 'ask'
                    ? '询问教学内容、原理或已有资料…'
                    : '描述想制作的内容，或继续修改成品…'
            }
            value={draft.text}
            rows={welcome ? 3 : 2}
            onChange={(event) => c.setDraft({ text: event.target.value })}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (canSend)
                  void c.send(
                    active && (event.metaKey || event.ctrlKey)
                      ? {
                          delivery:
                            draft.delivery === 'after-current' ? 'next-step' : 'after-current',
                        }
                      : {},
                  );
              }
            }}
          />
          <div className="composer-toolbar">
            <div className="add-context">
              <IconButton label="添加上下文" aria-expanded={plus} onClick={() => setPlus(!plus)}>
                <Plus size={18} />
              </IconButton>
              {plus && (
                <div className="composer-menu">
                  <Button
                    onClick={() => {
                      setPlus(false);
                      upload.current?.click();
                    }}
                  >
                    <Paperclip size={15} />
                    上传文件
                  </Button>
                  <Button
                    onClick={() => {
                      setPlus(false);
                      c.openCatalog('sources');
                    }}
                  >
                    <BookOpen size={15} />
                    引用资料库
                  </Button>
                  <Button
                    onClick={() => {
                      setPlus(false);
                      c.openCatalog('skills');
                    }}
                  >
                    <WandSparkles size={15} />
                    选择技能
                  </Button>
                </div>
              )}
            </div>
            <input
              ref={upload}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                if (event.target.files) void c.upload([...event.target.files]).catch(c.error);
                event.target.value = '';
              }}
            />
            <select
              aria-label="智能体模式"
              value={draft.mode}
              onChange={(event) => c.setDraft({ mode: event.target.value as Mode })}
            >
              {Object.entries(modeLabels).map(([mode, label]) => (
                <option key={mode} value={mode}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="学习模式"
              value={draft.learningPattern}
              onChange={(event) => c.setDraft({ learningPattern: event.target.value as '' | 'process-inquiry' })}
            >
              <option value="">通用创作</option>
              <option value="process-inquiry">流程探究 · AES-128</option>
            </select>
            <span className="model-label" title="全局智能体模型">
              DeepSeek v4.1 Flash
            </span>
            <div className="push" />
            {active && (
              <select
                aria-label="发送时机"
                value={draft.delivery}
                onChange={(event) =>
                  c.setDraft({ delivery: event.target.value as 'after-current' | 'next-step' })
                }
              >
                <option value="after-current">排队</option>
                <option value="next-step">下一步补充</option>
              </select>
            )}
            {active && (
              <IconButton
                label="停止当前任务"
                className="stop-button"
                disabled={state.busy}
                onClick={() => void c.run(() => c.cancel(active.id))}
              >
                <Square size={14} fill="currentColor" />
              </IconButton>
            )}
            <IconButton
              label={
                state.busy
                  ? '正在提交'
                  : active
                    ? draft.delivery === 'next-step'
                      ? '下一步补充'
                      : '加入队列'
                    : '发送要求'
              }
              className="send-button"
              disabled={!canSend}
              onClick={() => void c.send()}
            >
              {state.busy ? <LoaderCircle size={17} className="spin" /> : <ArrowUp size={19} />}
            </IconButton>
          </div>
        </div>
      )}
      <div className="composer-footnote">
        <span>
          {draft.mode === 'plan'
            ? '先规划，审阅后再执行'
            : draft.mode === 'ask'
              ? '只读问答，不修改教学内容'
              : active
                ? '关闭页面后，任务仍在后台执行'
                : '生成的教学内容可继续审阅和修改'}
        </span>
        <span>
          <CornerDownLeft size={11} /> 发送{' '}
          <span className="desktop-only"> · Shift Enter 换行</span>
        </span>
      </div>
    </div>
  );
}
