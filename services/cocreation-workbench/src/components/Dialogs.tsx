import { useState } from 'react';
import {
  Search,
  SquarePen,
  ListTodo,
  PanelRight,
  FileText,
  MessageSquare,
  Check,
  BookOpen,
  WandSparkles,
} from 'lucide-react';
import { useWorkbench } from '../core/context';
import { Button, Dialog, Empty } from './ui';
import type { Data } from '../core/types';

function SearchDialog() {
  const { state, controller: c } = useWorkbench();
  const [query, setQuery] = useState('');
  const close = () => c.patch({ modal: null });
  const commands = [
    { label: '新建会话', shortcut: 'Alt N', icon: SquarePen, action: () => c.newThread() },
    {
      label: '打开任务中心',
      shortcut: '',
      icon: ListTodo,
      action: () => c.patch({ taskCenter: true }),
    },
    {
      label: '切换右侧工作区',
      shortcut: '⌘ ⇧ \\',
      icon: PanelRight,
      action: () => c.togglePanel(),
    },
  ];
  const test = (value: string) => value.toLowerCase().includes(query.toLowerCase());
  return (
    <Dialog title="搜索与命令" onClose={close}>
      <label className="command-search">
        <Search size={18} />
        <input
          autoFocus
          aria-label="搜索会话或命令"
          placeholder="搜索会话、成品或操作…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="command-results">
        <h3>操作</h3>
        {commands
          .filter((command) => test(command.label))
          .map((command) => (
            <Button
              key={command.label}
              onClick={() => {
                close();
                command.action();
              }}
            >
              <command.icon size={16} />
              {command.label}
              <kbd>{command.shortcut}</kbd>
            </Button>
          ))}
        <h3>会话</h3>
        {state.threads
          .filter((thread) => test(thread.title + ' ' + (thread.latestMessage || '')))
          .slice(0, 12)
          .map((thread) => (
            <Button
              key={thread.id}
              onClick={() => {
                close();
                void c.activate(thread.id).catch(c.error);
              }}
            >
              <MessageSquare size={16} />
              <span>{thread.title}</span>
            </Button>
          ))}
        {query && (
          <Button
            onClick={() => {
              c.filterThreads(query);
              close();
              c.patch({ sidebarOpen: true });
            }}
          >
            搜索所有会话的完整内容
          </Button>
        )}
        <h3>成品</h3>
        {state.artifacts
          .filter((artifact) => test(artifact.title))
          .slice(0, 8)
          .map((artifact) => (
            <Button
              key={artifact.id}
              onClick={() => {
                close();
                void c.openArtifact(artifact.id).catch(c.error);
              }}
            >
              <FileText size={16} />
              <span>{artifact.title}</span>
            </Button>
          ))}
      </div>
    </Dialog>
  );
}
function CatalogDialog({ kind }: { kind: 'sources' | 'skills' }) {
  const { state, controller: c } = useWorkbench();
  const [query, setQuery] = useState('');
  const items: Data[] = kind === 'sources' ? state.materials : state.skills;
  const selected = new Set(
    kind === 'sources' ? state.draft.sources.map((source) => source.id) : state.draft.skills,
  );
  return (
    <Dialog
      title={kind === 'sources' ? '引用资料库' : '选择技能'}
      onClose={() => c.patch({ modal: null })}
    >
      <label className="command-search">
        <Search size={17} />
        <input
          autoFocus
          aria-label="搜索资料或技能"
          placeholder="搜索…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="catalog-list">
        {items
          .filter((item) =>
            `${item.name || item.title || item.filename || ''} ${item.description || ''}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((item) => {
            const identifier = String(kind === 'sources' ? item.id : item.name);
            const title = item.name || item.title || item.filename || identifier;
            return (
              <button
                className={`catalog-item ${selected.has(identifier) ? 'selected' : ''}`}
                key={identifier}
                aria-pressed={selected.has(identifier)}
                onClick={() => {
                  if (kind === 'sources')
                    c.setDraft({
                      sources: selected.has(identifier)
                        ? state.draft.sources.filter((source) => source.id !== identifier)
                        : [
                            ...state.draft.sources,
                            { id: identifier, name: title, type: 'material' },
                          ],
                    });
                  else
                    c.setDraft({
                      skills: selected.has(identifier)
                        ? state.draft.skills.filter((skill) => skill !== identifier)
                        : [...state.draft.skills, identifier],
                    });
                }}
              >
                {kind === 'sources' ? <BookOpen size={18} /> : <WandSparkles size={18} />}
                <span>
                  <strong>{title}</strong>
                  <small>{item.description || item.status || item.mimeType}</small>
                </span>
                <span className="check-box">{selected.has(identifier) && <Check size={13} />}</span>
              </button>
            );
          })}
        {!items.length && (
          <Empty title={kind === 'sources' ? '还没有可引用的资料' : '正在读取技能目录'}>
            <p>
              {kind === 'sources'
                ? '可以在输入区上传文档，或到资料库添加。'
                : '目录不可用时，可以重试读取。'}
            </p>
            <Button onClick={() => void c.loadCatalog(kind, true).catch(c.error)}>重新读取</Button>
          </Empty>
        )}
      </div>
      <div className="dialog-actions">
        <span className="quiet">已选 {selected.size} 项</span>
        <Button className="primary" onClick={() => c.patch({ modal: null })}>
          完成选择
        </Button>
      </div>
    </Dialog>
  );
}
export function Dialogs() {
  const { state } = useWorkbench();
  return state.modal === 'search' ? (
    <SearchDialog />
  ) : state.modal === 'sources' || state.modal === 'skills' ? (
    <CatalogDialog kind={state.modal} />
  ) : null;
}
