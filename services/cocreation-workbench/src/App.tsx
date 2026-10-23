import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  PanelLeft,
  PanelRight,
  FileText,
  Activity,
  Layers,
  X,
  Maximize2,
  Minimize2,
  WifiOff,
  GitBranch,
  ChevronRight,
  Sparkles,
  ListTodo,
} from 'lucide-react';
import { useWorkbench } from './core/context';
import { Sidebar } from './components/Sidebar';
import { Transcript } from './components/Transcript';
import { TaskCenter } from './components/TaskCenter';
import { Dialogs } from './components/Dialogs';
import { ArtifactPanel } from './panels/ArtifactPanel';
import { ActivityPanel } from './panels/ActivityPanel';
import { ContextPanel } from './panels/ContextPanel';
import { Button, IconButton } from './components/ui';

export function App() {
  const { state, controller: c } = useWorkbench();
  const [width, setWidth] = useState(c.storage.value('panelWidth', 520));
  const [expanded, setExpanded] = useState(false);
  const drag = useRef<{ x: number; width: number } | null>(null);
  useEffect(() => {
    void c.boot();
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (document.querySelector('#searchModal:not([hidden])[aria-hidden="false"]')) {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          event.stopPropagation();
          document.getElementById('searchInput')?.focus();
        }
        return;
      }
      if (event.target instanceof Element && event.target.closest('.product-navbar')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        event.stopPropagation();
        c.patch({ modal: c.snapshot().modal === 'search' ? null : 'search' });
      }
      if (event.altKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        c.newThread();
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'Backslash') {
        event.preventDefault();
        c.togglePanel();
      }
    };
    const onPop = () => {
      const thread = new URLSearchParams(location.search).get('thread');
      if (thread) void c.activate(thread, false).catch(c.error);
      else c.newThread();
    };
    const taskEntry = document.getElementById('global-teaching-tasks');
    const openTasks = (event: MouseEvent) => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      c.patch({ taskCenter: true, sidebarOpen: false });
      const toggle = document.getElementById('product-nav-toggle');
      if (toggle?.getAttribute('aria-expanded') === 'true') toggle.click();
    };
    taskEntry?.addEventListener('click', openTasks);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('popstate', onPop);
    return () => {
      c.dispose();
      window.removeEventListener('keydown', onKey, true);
      taskEntry?.removeEventListener('click', openTasks);
      window.removeEventListener('popstate', onPop);
    };
  }, [c]);
  const course = state.context.teacherDojos?.find((item: any) => item.id === state.thread?.dojoId);
  return (
    <div
      className={`workbench ${state.panelOpen ? 'has-panel' : ''} ${expanded ? 'expanded-panel' : ''}`}
      data-ready={!state.booting}
      style={{ '--panel-width': `${width}px` } as CSSProperties}
    >
      <Sidebar />
      <main className="main-pane">
        <header className="workspace-header">
          <IconButton
            className="mobile-only"
            label="打开会话导航"
            onClick={() => c.patch({ sidebarOpen: true })}
          >
            <PanelLeft size={18} />
          </IconButton>
          <div className="workspace-breadcrumb">
            <span>{course?.name || '独立创作'}</span>
            <ChevronRight size={12} />
            <strong>{state.taskCenter ? '任务中心' : state.thread?.title || '新会话'}</strong>
          </div>
          <div className="header-actions">
            {!state.online && (
              <span className="offline" title="正在重新连接，输入内容会保留">
                <WifiOff size={15} />
                重新连接
              </span>
            )}
            {state.thread && (
              <IconButton
                label="创建会话分支"
                disabled={state.busy}
                onClick={() => void c.run(() => c.fork(state.thread!.id))}
              >
                <GitBranch size={16} />
              </IconButton>
            )}
            <IconButton
              label={state.panelOpen ? '收起工作区' : '打开工作区'}
              aria-pressed={state.panelOpen}
              onClick={() => c.togglePanel()}
            >
              <PanelRight size={18} />
            </IconButton>
          </div>
        </header>
        {state.error && (
          <div className="notice error" role="alert">
            <span>{state.error}</span>
            <IconButton label="关闭错误提示" onClick={() => c.patch({ error: null })}>
              <X size={14} />
            </IconButton>
          </div>
        )}
        {state.notice && (
          <div className="notice" role="status">
            <span>{state.notice}</span>
            <IconButton label="关闭提示" onClick={() => c.patch({ notice: null })}>
              <X size={14} />
            </IconButton>
          </div>
        )}
        {state.booting || state.loadingThread ? (
          <div className="workspace-loading">
            <Sparkles size={25} />
            <p>{state.loadingThread ? '正在读取会话…' : '正在打开工作台…'}</p>
          </div>
        ) : state.taskCenter ? (
          <TaskCenter />
        ) : (
          <Transcript />
        )}
        <nav className="mobile-panel-nav" aria-label="移动工作区">
          <Button
            onClick={() => {
              c.patch({ panelOpen: false, taskCenter: false });
            }}
          >
            对话
          </Button>
          <Button onClick={() => c.setPanel('artifacts')}>
            <FileText size={15} />
            成品
          </Button>
          <Button onClick={() => c.setPanel('activity')}>
            <Activity size={15} />
            执行
          </Button>
          <Button onClick={() => c.setPanel('context')}>
            <Layers size={15} />
            上下文
          </Button>
        </nav>
      </main>
      {state.panelOpen && (
        <>
          <div
            className="panel-resizer"
            role="separator"
            aria-label="调整工作区宽度"
            aria-orientation="vertical"
            aria-valuenow={width}
            aria-valuemin={340}
            aria-valuemax={Math.max(340, window.innerWidth - 630)}
            tabIndex={0}
            onKeyDown={(event) => {
              if (['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) {
                event.preventDefault();
                const value =
                  event.key === 'Home'
                    ? 520
                    : Math.min(
                        window.innerWidth - 630,
                        Math.max(340, width + (event.key === 'ArrowLeft' ? 32 : -32)),
                      );
                setWidth(value);
                c.storage.set('panelWidth', value);
              }
            }}
            onPointerDown={(event) => {
              drag.current = { x: event.clientX, width };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (drag.current)
                setWidth(
                  Math.min(
                    Math.max(340, window.innerWidth - 630),
                    Math.max(340, drag.current.width + drag.current.x - event.clientX),
                  ),
                );
            }}
            onPointerUp={(event) => {
              drag.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
              c.storage.set('panelWidth', width);
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          />
          <aside className="work-area" aria-label="成品与执行工作区">
            <header className="panel-header">
              <div role="tablist" aria-label="工作区页面">
                {(
                  [
                    { key: 'artifacts', title: '成品', Icon: FileText },
                    { key: 'activity', title: '执行', Icon: Activity },
                    { key: 'context', title: '上下文', Icon: Layers },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    role="tab"
                    aria-selected={state.panel === item.key}
                    onClick={() => c.setPanel(item.key)}
                  >
                    <item.Icon size={15} />
                    {item.title}
                  </button>
                ))}
              </div>
              <IconButton
                className="desktop-only"
                label={expanded ? '恢复分栏' : '放大工作区'}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </IconButton>
              <IconButton
                label="关闭工作区"
                onClick={() => {
                  c.togglePanel();
                  setExpanded(false);
                }}
              >
                <X size={16} />
              </IconButton>
            </header>
            <div className="panel-content" hidden={state.panel !== 'artifacts'}>
              <ArtifactPanel />
            </div>
            <div className="panel-content" hidden={state.panel !== 'activity'}>
              <ActivityPanel />
            </div>
            <div className="panel-content" hidden={state.panel !== 'context'}>
              <ContextPanel />
            </div>
          </aside>
        </>
      )}
      <Dialogs />
    </div>
  );
}
