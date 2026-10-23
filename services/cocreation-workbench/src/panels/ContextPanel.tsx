import {
  BookOpen,
  Paperclip,
  Plus,
  X,
  WandSparkles,
  GraduationCap,
  ExternalLink,
} from 'lucide-react';
import { useWorkbench } from '../core/context';
import { Button, IconButton } from '../components/ui';
import type { Data } from '../core/types';

export function ContextPanel() {
  const { state, controller: c } = useWorkbench();
  const courses: Data[] = state.context.teacherDojos || [];
  const current = courses.find((course) => course.id === state.thread?.dojoId);
  return (
    <div className="panel-scroll context-panel">
      <header className="section-heading">
        <GraduationCap size={18} />
        <h2>本次创作的上下文</h2>
      </header>
      <p className="quiet">选择课程、资料和技能，为这次教学任务提供依据。</p>
      <section>
        <h3>课程与章节</h3>
        <label className="field">
          归属课程
          <select
            aria-label="归属课程"
            disabled={state.busy}
            value={state.thread?.dojoId ?? ''}
            onChange={(event) => void c.run(() => c.setScope(event.target.value))}
          >
            <option value="">独立创作，暂不关联课程</option>
            {courses.map((course) => (
              <option value={course.id} key={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </label>
        {current && (
          <label className="field">
            章节
            <select
              aria-label="归属章节"
              disabled={state.busy}
              value={state.thread?.moduleIndex ?? ''}
              onChange={(event) =>
                void c.run(() => c.setScope(String(current.id), event.target.value))
              }
            >
              <option value="">整门课程</option>
              {(current.modules || []).map((module: Data) => (
                <option
                  key={module.index ?? module.moduleIndex}
                  value={module.index ?? module.moduleIndex}
                >
                  {module.name || module.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>
      <section>
        <header>
          <h3>
            <BookOpen size={15} />
            本轮引用资料
          </h3>
          <IconButton label="添加引用资料" onClick={() => c.openCatalog('sources')}>
            <Plus size={15} />
          </IconButton>
        </header>
        {!state.draft.sources.length && (
          <p className="quiet">引用资料后，智能体会优先依据原文处理。</p>
        )}
        {state.draft.sources.map((source) => (
          <div className="context-item" key={source.id}>
            <Paperclip size={15} />
            <span>{source.name}</span>
            <IconButton
              label={`移除 ${source.name}`}
              onClick={() =>
                c.setDraft({ sources: state.draft.sources.filter((item) => item.id !== source.id) })
              }
            >
              <X size={14} />
            </IconButton>
          </div>
        ))}
        <Button onClick={() => c.openCatalog('sources')}>
          <Plus size={14} />
          引用资料库
        </Button>
      </section>
      <section>
        <header>
          <h3>
            <WandSparkles size={15} />
            本轮指定技能
          </h3>
          <IconButton label="添加技能" onClick={() => c.openCatalog('skills')}>
            <Plus size={15} />
          </IconButton>
        </header>
        {!state.draft.skills.length && (
          <p className="quiet">智能体会按任务选择技能，也可以手动指定。</p>
        )}
        {state.draft.skills.map((skill) => (
          <div className="context-item" key={skill}>
            <WandSparkles size={15} />
            <span>/{skill}</span>
            <IconButton
              label={`移除 ${skill}`}
              onClick={() =>
                c.setDraft({ skills: state.draft.skills.filter((item) => item !== skill) })
              }
            >
              <X size={14} />
            </IconButton>
          </div>
        ))}
        <Button onClick={() => c.openCatalog('skills')}>
          <Plus size={14} />
          选择技能
        </Button>
      </section>
      <section>
        <h3>当前模型</h3>
        <strong>DeepSeek v4.1 Flash</strong>
        <p className="quiet">全局智能体与内容生成</p>
      </section>
      <a className="button" href="/teacher/library" target="_blank" rel="noopener noreferrer">
        <BookOpen size={15} />
        管理完整资料库
        <ExternalLink size={13} />
      </a>
    </div>
  );
}
