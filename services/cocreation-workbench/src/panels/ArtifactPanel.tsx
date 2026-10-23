import { useEffect, useMemo, useRef, useState } from 'react';
import { diffLines } from 'diff';
import {
  Code2,
  Eye,
  History,
  FileText,
  X,
  ExternalLink,
  Play,
  Search,
  RotateCcw,
  ArrowUp,
  Maximize2,
  Minimize2,
  MousePointer2,
  RefreshCw,
  LoaderCircle,
} from 'lucide-react';
import { useWorkbench } from '../core/context';
import { api, id } from '../core/api';
import { dateLabel, type Artifact, type Data, typeLabels } from '../core/types';
import { Button, IconButton, Empty, Status, Dialog } from '../components/ui';

function contentSource(artifact: Artifact): string {
  const content = artifact.revision?.content;
  if (typeof content === 'string') return content;
  return JSON.stringify(content || {}, null, 2);
}
function Diff({ before, after }: { before: string; after: string }) {
  const changes = useMemo(() => diffLines(before, after, { timeout: 500 }), [before, after]);
  return (
    <div className="diff-view">
      {changes ? (
        changes.map((part, index) => (
          <pre
            key={index}
            className={part.added ? 'diff-added' : part.removed ? 'diff-removed' : 'diff-same'}
          >
            <span aria-hidden="true">{part.added ? '+' : part.removed ? '−' : ' '}</span>
            <code>{part.value}</code>
          </pre>
        ))
      ) : (
        <div className="diff-large">
          <p>文件较大，请对照两版完整源码。</p>
          <pre>{before}</pre>
          <pre>{after}</pre>
        </div>
      )}
    </div>
  );
}
function ArtifactWorkspace({ artifact }: { artifact: Artifact }) {
  const { state, controller: c } = useWorkbench();
  const [tab, setTab] = useState<'preview' | 'source' | 'history'>('preview');
  const [instruction, setInstruction] = useState('');
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(
    null,
  );
  const [revision, setRevision] = useState<Data | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [launching, setLaunching] = useState(false);
  const [frameError, setFrameError] = useState(false);
  const source = contentSource(artifact);
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const preview = state.previews[artifact.id];
  const launch = async () => {
    setLaunching(true);
    setFrameError(false);
    try {
      await c.launchPreview(artifact);
    } catch (error) {
      c.error(error);
      setFrameError(true);
    } finally {
      setLaunching(false);
    }
  };
  useEffect(() => {
    setSelection(null);
    setRevision(null);
  }, [artifact.currentRevision]);
  useEffect(() => {
    const element = codeRef.current;
    if (!element || tab !== 'source') return;
    const readSelection = () => {
      const start = element.selectionStart,
        end = element.selectionEnd;
      if (end > start)
        setSelection({
          start: source.slice(0, start).split('\n').length,
          end: source.slice(0, end).split('\n').length,
          text: source.slice(start, end),
        });
    };
    element.addEventListener('select', readSelection);
    element.addEventListener('pointerup', readSelection);
    element.addEventListener('keyup', readSelection);
    return () => {
      element.removeEventListener('select', readSelection);
      element.removeEventListener('pointerup', readSelection);
      element.removeEventListener('keyup', readSelection);
    };
  }, [tab, source]);
  const generating =
    artifact.status === 'GENERATING' ||
    state.jobs.some(
      (job) => job.result?.artifactId === artifact.id && ['QUEUED', 'RUNNING'].includes(job.status),
    );
  return (
    <div className="artifact-workspace">
      <div className="artifact-title">
        <FileText size={17} />
        <div>
          <strong>{artifact.title}</strong>
          <small>
            {typeLabels[artifact.type] || artifact.type} · V{artifact.currentRevision}
          </small>
        </div>
        <Status status={artifact.status} />
        <a
          className="button icon-button"
          href={`/teacher/artifacts/${id(artifact.id)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="在完整成品页打开"
          title="在完整成品页打开"
        >
          <ExternalLink size={15} />
        </a>
      </div>
      <div className="artifact-subtabs" role="tablist" aria-label="成品工作区">
        {(
          [
            { key: 'preview', label: '预览', icon: Eye },
            { key: 'source', label: artifact.type === 'learning-flow' ? '学习规格' : '源码', icon: Code2 },
            { key: 'history', label: '版本', icon: History },
          ] as const
        ).map((item) => (
          <button
            role="tab"
            key={item.key}
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
          >
            <item.icon size={14} />
            {item.label}
          </button>
        ))}
        {tab === 'preview' && (
          <IconButton
            label="重新加载预览"
            disabled={launching || generating}
            onClick={() => void launch()}
          >
            <RefreshCw size={13} />
          </IconButton>
        )}
      </div>
      <div className="artifact-content">
        <div className="preview-area" hidden={tab !== 'preview'}>
          {preview && !frameError ? (
            <iframe
              title={`交互预览：${artifact.title}`}
              src={preview}
              allow="fullscreen; clipboard-write"
              referrerPolicy="same-origin"
            />
          ) : (
            <Empty
              icon={<Eye size={28} />}
              title={
                generating ? '成品正在生成' : frameError ? '预览未能加载' : '在这里直接体验成品'
              }
            >
              <p>
                {generating
                  ? '原版本会保留，完成后可以继续审阅。'
                  : '课件、交互演示与三维场景会在工作区中打开。'}
              </p>
              <Button
                className="primary"
                disabled={launching || generating}
                onClick={() => void launch()}
              >
                {launching ? <LoaderCircle className="spin" size={15} /> : <Play size={15} />}
                {launching ? '正在连接预览' : '打开交互预览'}
              </Button>
            </Empty>
          )}
        </div>
        {tab === 'source' && (
          <div className="source-area">
            <div className="source-hint">
              <MousePointer2 size={14} />
              选中需要修改的源码，添加到下方修改要求
            </div>
            <textarea
              ref={codeRef}
              className="source-editor"
              readOnly
              aria-label="成品完整源码"
              spellCheck={false}
              value={source}
              onSelect={(event) => {
                const { selectionStart: start, selectionEnd: end } = event.currentTarget;
                if (end > start)
                  setSelection({
                    start: source.slice(0, start).split('\n').length,
                    end: source.slice(0, end).split('\n').length,
                    text: source.slice(start, end),
                  });
              }}
            />
          </div>
        )}
        {tab === 'history' && (
          <div className="history-area">
            {(artifact.history || []).map((row: Data) => (
              <div className="revision-row" key={row.revision}>
                <span className="revision-badge">V{row.revision}</span>
                <div>
                  <strong>
                    {row.revision === artifact.currentRevision
                      ? '当前版本'
                      : row.instruction || '历史版本'}
                  </strong>
                  <small>
                    {dateLabel(row.created)} {row.author}
                  </small>
                </div>
                <Button
                  onClick={() =>
                    void api(`/artifacts/${id(artifact.id)}/revisions/${row.revision}`)
                      .then((data) => setRevision(data.revision))
                      .catch(c.error)
                  }
                >
                  比较
                </Button>
                {row.revision !== artifact.currentRevision && artifact.capabilities?.edit && (
                  <IconButton
                    label={`恢复版本 ${row.revision}`}
                    onClick={() => setRestoring(row.revision)}
                  >
                    <RotateCcw size={14} />
                  </IconButton>
                )}
              </div>
            ))}
            {revision && (
              <section className="revision-compare">
                <header>
                  <strong>
                    V{revision.revision} → V{artifact.currentRevision}
                  </strong>
                  <IconButton label="关闭差异" onClick={() => setRevision(null)}>
                    <X size={14} />
                  </IconButton>
                </header>
                <Diff
                  before={
                    typeof revision.content === 'string'
                      ? revision.content
                      : JSON.stringify(revision.content, null, 2)
                  }
                  after={source}
                />
              </section>
            )}
          </div>
        )}
      </div>
      {artifact.type === 'learning-flow' && <div className="source-hint">教学说明、审核发布和学生证据可在预览内的“内容与审核”中处理。</div>}
      {artifact.capabilities?.edit && artifact.type !== 'learning-flow' && (
        <form
          className="revision-composer"
          onSubmit={(event) => {
            event.preventDefault();
            const request = selection
              ? `${instruction}\n\n仅修改当前版本 V${artifact.currentRevision} 中所选范围（源码第 ${selection.start}–${selection.end} 行），保留其余内容与交互：\n${selection.text}`
              : instruction;
            void c.run(async () => {
              await c.revise(artifact, request);
              setInstruction('');
              setSelection(null);
            });
          }}
        >
          <div className="revision-context">
            <strong>局部修改</strong>
            <span>基于 V{artifact.currentRevision}</span>
            {selection && (
              <span className="chip">
                第 {selection.start}–{selection.end} 行
                <IconButton label="取消源码选区" onClick={() => setSelection(null)}>
                  <X size={12} />
                </IconButton>
              </span>
            )}
          </div>
          <div className="revision-input">
            <textarea
              aria-label="成品局部修改要求"
              placeholder="例如：为这个场景增加一个决策分支，保留其他交互…"
              rows={2}
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
            />
            <button
              className="button send-button"
              aria-label="提交局部修改"
              disabled={!instruction.trim() || state.busy || generating}
            >
              <ArrowUp size={17} />
            </button>
          </div>
          <small>修改会保存为新版本，可以比较或恢复。</small>
        </form>
      )}
      {restoring !== null && (
        <Dialog title={`恢复版本 V${restoring}`} onClose={() => setRestoring(null)}>
          <div className="dialog-body">
            <p>从所选版本创建新草稿。当前版本和历史记录都会保留。</p>
          </div>
          <div className="dialog-actions">
            <Button onClick={() => setRestoring(null)}>取消</Button>
            <Button
              className="primary"
              disabled={state.busy}
              onClick={() =>
                void c.run(async () => {
                  await c.restore(artifact, restoring);
                  setRestoring(null);
                })
              }
            >
              创建新草稿
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
export function ArtifactPanel() {
  const { state, controller: c } = useWorkbench();
  const [query, setQuery] = useState('');
  const artifact = state.selectedArtifact ? state.artifactDetails[state.selectedArtifact] : null;
  return (
    <div className="artifact-panel">
      <div className="artifact-tabs" role="tablist" aria-label="打开的成品">
        <button
          role="tab"
          aria-selected={!state.selectedArtifact}
          onClick={() => c.patch({ selectedArtifact: null })}
        >
          <FileText size={14} />
          成品库
        </button>
        {state.openArtifacts.map((artifactId) => (
          <div className={state.selectedArtifact === artifactId ? 'active' : ''} key={artifactId}>
            <button
              role="tab"
              aria-selected={state.selectedArtifact === artifactId}
              onClick={() => c.patch({ selectedArtifact: artifactId })}
            >
              {state.artifactDetails[artifactId]?.title || '读取中…'}
            </button>
            <IconButton
              label={`关闭成品 ${state.artifactDetails[artifactId]?.title || ''}`}
              onClick={() => c.closeArtifact(artifactId)}
            >
              <X size={12} />
            </IconButton>
          </div>
        ))}
      </div>
      {state.selectedArtifact ? (
        artifact ? (
          <ArtifactWorkspace key={artifact.id} artifact={artifact} />
        ) : (
          <Empty title="正在读取成品…" />
        )
      ) : (
        <div className="artifact-library">
          <label className="search-field">
            <Search size={15} />
            <input
              aria-label="搜索成品"
              placeholder="搜索成品…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="panel-scroll">
            {state.artifacts
              .filter((item) => !query || item.title.toLowerCase().includes(query.toLowerCase()))
              .map((item) => (
                <button
                  className="artifact-list-row"
                  key={item.id}
                  onClick={() => void c.openArtifact(item.id).catch(c.error)}
                >
                  <span className="file-icon">
                    <FileText size={20} />
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {typeLabels[item.type] || item.type} · V{item.currentRevision}
                    </small>
                  </span>
                  <Status status={item.status} />
                </button>
              ))}
            {!state.artifacts.length && (
              <Empty icon={<FileText size={28} />} title="你的教学成品工作区">
                <p>生成完成后，在这里预览、比较版本和继续修改。</p>
              </Empty>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
