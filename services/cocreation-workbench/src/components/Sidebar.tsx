import { useState } from 'react';
import {
  SquarePen,
  Search,
  PanelLeftClose,
  ListTodo,
  ArrowUpRight,
  Pin,
  Ellipsis,
  Archive,
  GitBranch,
  Pencil,
  FolderOpen,
  Settings2,
  ChevronDown,
  MessageSquare,
  GraduationCap,
  Sparkles,
} from 'lucide-react';
import { useWorkbench } from '../core/context';
import { Button, IconButton, Dialog } from './ui';
import { terminal, type Thread } from '../core/types';

export function Sidebar() {
  const { state, controller: c } = useWorkbench();
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Thread | null>(null);
  const [title, setTitle] = useState('');
  const [grouping, setGrouping] = useState(c.storage.value('groupByCourse', false));
  const running = state.jobs.filter((job) => !terminal(job)).length;
  const groups = new Map<string, Thread[]>();
  for (const thread of state.threads) {
    const course = state.context.teacherDojos?.find((item: any) => item.id === thread.dojoId);
    const name = thread.pinned ? '置顶' : grouping ? course?.name || '独立创作' : '最近会话';
    groups.set(name, [...(groups.get(name) || []), thread]);
  }
  return (
    <>
      {state.sidebarOpen && (
        <button
          className="drawer-backdrop"
          aria-label="关闭导航"
          onClick={() => c.patch({ sidebarOpen: false })}
        />
      )}
      <aside className={`sidebar ${state.sidebarOpen ? 'open' : ''}`} aria-label="会话导航">
        <header className="brand">
          <strong><Sparkles size={17} />AI 共创</strong>
          <IconButton
            className="mobile-only"
            label="关闭导航"
            onClick={() => c.patch({ sidebarOpen: false })}
          >
            <PanelLeftClose size={17} />
          </IconButton>
        </header>
        <div className="sidebar-actions">
          <Button className="new-thread" onClick={() => c.newThread()}>
            <SquarePen size={17} />
            新建会话<kbd>Alt N</kbd>
          </Button>
          <Button onClick={() => c.patch({ modal: 'search' })}>
            <Search size={17} />
            搜索与命令<kbd>⌘ K</kbd>
          </Button>
          <Button
            className={state.taskCenter ? 'selected' : ''}
            onClick={() => c.patch({ taskCenter: true, sidebarOpen: false })}
          >
            <ListTodo size={17} />
            任务中心{running > 0 && <span className="count">{running}</span>}
          </Button>
          <a className="button" href="/teacher/projects">
            <FolderOpen size={17} />
            全部成品
            <ArrowUpRight size={14} className="push" />
          </a>
        </div>
        <div className="sidebar-section-heading">
          <Button onClick={() => c.filterThreads('', !state.archived)}>
            {state.archived ? '已归档' : '会话'}
            <ChevronDown size={13} />
          </Button>
          <IconButton
            label={grouping ? '按时间排列' : '按课程分组'}
            onClick={() => {
              setGrouping(!grouping);
              c.storage.set('groupByCourse', !grouping);
            }}
          >
            <GraduationCap size={16} />
          </IconButton>
        </div>
        <nav className="thread-list">
          {!state.threads.length && (
            <p className="quiet sidebar-empty">
              {state.archived ? '没有归档会话' : '开始一次新的教学创作。'}
            </p>
          )}
          {[...groups].map(([name, threads]) => (
            <section key={name}>
              <h3>{name}</h3>
              {threads.map((thread) => (
                <div
                  className={`thread-row ${state.thread?.id === thread.id && !state.taskCenter ? 'selected' : ''}`}
                  key={thread.id}
                >
                  <button
                    className="thread-link"
                    onClick={() => {
                      setMenu(null);
                      void c.activate(thread.id).catch(c.error);
                    }}
                    title={thread.title}
                  >
                    {thread.pinned ? <Pin size={13} /> : <MessageSquare size={13} />}
                    <span>{thread.title || '新会话'}</span>
                    {state.jobs.some((job) => job.threadId === thread.id && !terminal(job)) && (
                      <i className="live-dot" />
                    )}
                  </button>
                  <IconButton
                    label={`管理会话：${thread.title}`}
                    className="thread-more"
                    onClick={() => setMenu(menu === thread.id ? null : thread.id)}
                  >
                    <Ellipsis size={16} />
                  </IconButton>
                  {menu === thread.id && (
                    <div className="thread-menu" role="menu">
                      <Button
                        onClick={() => {
                          setRenaming(thread);
                          setTitle(thread.title);
                          setMenu(null);
                        }}
                      >
                        <Pencil size={14} />
                        重命名
                      </Button>
                      <Button
                        onClick={() => {
                          setMenu(null);
                          void c.run(() => c.updateThread(thread.id, { pinned: !thread.pinned }));
                        }}
                      >
                        <Pin size={14} />
                        {thread.pinned ? '取消置顶' : '置顶'}
                      </Button>
                      <Button
                        onClick={() => {
                          setMenu(null);
                          void c.run(() => c.fork(thread.id));
                        }}
                      >
                        <GitBranch size={14} />
                        创建分支
                      </Button>
                      <Button
                        onClick={() => {
                          setMenu(null);
                          void c.run(() =>
                            c.updateThread(thread.id, { archived: thread.status !== 'ARCHIVED' }),
                          );
                        }}
                      >
                        <Archive size={14} />
                        {thread.status === 'ARCHIVED' ? '恢复会话' : '归档'}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </section>
          ))}
        </nav>
        <footer>
          <Button onClick={() => c.patch({ modal: 'settings' })}>
            <Settings2 size={17} />
            设置
            <span className="user-initial">
              {String(state.context.user?.name || '教').slice(0, 1)}
            </span>
          </Button>
        </footer>
      </aside>
      {renaming && (
        <Dialog title="重命名会话" onClose={() => setRenaming(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void c.run(async () => {
                await c.updateThread(renaming.id, { title: title.trim() });
                setRenaming(null);
              });
            }}
          >
            <label className="field">
              名称
              <input
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                required
              />
            </label>
            <div className="dialog-actions">
              <Button onClick={() => setRenaming(null)}>取消</Button>
              <button className="button primary" disabled={!title.trim() || state.busy}>
                保存名称
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
