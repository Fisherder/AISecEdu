'use client';

import { useMemo, useRef, useState } from 'react';
import type { PPTElement, PPTTextElement, Slide } from '@openmaic/dsl';
import type { GeneratedQuizContent, GeneratedSlideContent } from '@/lib/types/generation';
import type { LessonArtifact } from '@/lib/types/lesson';
import type { QuizQuestion, QuizQuestionType } from '@/lib/types/stage';
import { SlideThumbnail } from '@/components/slide-renderer/SlideThumbnail';
import { useCodeRunnerIframeBridge } from '@/components/code-runner-iframe-bridge';

export interface ArtifactStructuredUpdate {
  title: string;
  content: LessonArtifact['content'];
}

interface ArtifactPreviewProps {
  artifact: LessonArtifact;
}

interface ArtifactEditorProps {
  artifact: LessonArtifact;
  saving: boolean;
  onCancel: () => void;
  onSave: (update: ArtifactStructuredUpdate) => Promise<void>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isSlideArtifact(
  artifact: LessonArtifact,
): artifact is LessonArtifact & { content: GeneratedSlideContent } {
  return (
    artifact.type === 'slide' && Array.isArray((artifact.content as GeneratedSlideContent).elements)
  );
}

function isQuizArtifact(
  artifact: LessonArtifact,
): artifact is LessonArtifact & { content: GeneratedQuizContent } {
  return (
    artifact.type === 'quiz' && Array.isArray((artifact.content as GeneratedQuizContent).questions)
  );
}

function previewSlide(artifact: LessonArtifact & { content: GeneratedSlideContent }): Slide {
  const backgroundColor =
    artifact.content.background?.type === 'solid'
      ? (artifact.content.background.color ?? '#ffffff')
      : '#ffffff';
  return {
    id: `artifact-preview-${artifact.id}`,
    viewportSize: 1000,
    viewportRatio: 0.5625,
    theme: {
      backgroundColor,
      themeColors: ['#22d3ee', '#818cf8', '#34d399', '#fb7185'],
      fontColor: '#111827',
      fontName: 'Microsoft YaHei',
    },
    elements: artifact.content.elements,
    background: artifact.content.background,
  };
}

function SlideArtifactPreview({
  artifact,
}: {
  artifact: LessonArtifact & { content: GeneratedSlideContent };
}) {
  const slide = useMemo(() => previewSlide(artifact), [artifact]);
  return (
    <div data-testid="artifact-slide-preview">
      <div className="mx-auto aspect-video w-full max-w-4xl overflow-hidden rounded-xl border border-slate-700 bg-white shadow-xl shadow-slate-950/30">
        <SlideThumbnail slide={slide} viewportRatio={0.5625} />
      </div>
      {artifact.content.remark && (
        <div className="mx-auto mt-3 max-w-4xl rounded-lg border border-slate-700/70 bg-slate-950/50 px-4 py-3 text-xs leading-5 text-slate-400">
          <span className="mr-2 text-slate-500">教师备注</span>
          {artifact.content.remark}
        </div>
      )}
    </div>
  );
}

function QuizArtifactPreview({
  artifact,
}: {
  artifact: LessonArtifact & { content: GeneratedQuizContent };
}) {
  return (
    <div
      data-testid="artifact-quiz-preview"
      className="space-y-4 rounded-xl border border-slate-700 bg-slate-950/45 p-4"
    >
      {artifact.content.questions.map((question, questionIndex) => {
        const answers = new Set(question.answer ?? []);
        return (
          <section
            key={question.id}
            className="rounded-xl border border-slate-700/80 bg-slate-900/80 p-4"
          >
            <div className="flex flex-wrap items-start gap-2">
              <span className="rounded bg-cyan-400/10 px-2 py-1 text-[10px] text-cyan-300">
                第 {questionIndex + 1} 题
              </span>
              <span className="rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-400">
                {questionTypeLabel(question.type)}
              </span>
              <span className="rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-400">
                {question.points ?? 1} 分
              </span>
            </div>
            <h4 className="mt-3 text-sm font-medium leading-6 text-slate-100">
              {question.question}
            </h4>
            {question.options && (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {question.options.map((option) => {
                  const correct = answers.has(option.value);
                  return (
                    <div
                      key={option.value}
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        correct
                          ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
                          : 'border-slate-700 bg-slate-950/60 text-slate-400'
                      }`}
                    >
                      <span className="mr-2 font-mono">{option.value}.</span>
                      {option.label}
                      {correct && <span className="ml-2 text-emerald-400">✓ 正确答案</span>}
                    </div>
                  );
                })}
              </div>
            )}
            {question.analysis && (
              <div className="mt-3 rounded-lg bg-indigo-400/[0.07] px-3 py-2 text-xs leading-5 text-indigo-200/80">
                <span className="mr-2 text-indigo-300">解析</span>
                {question.analysis}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function InteractiveArtifactPreview({
  artifact,
  html,
}: {
  artifact: LessonArtifact;
  html: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  useCodeRunnerIframeBridge(iframeRef, html);

  return (
    <iframe
      ref={iframeRef}
      title={`${artifact.title} 预览`}
      srcDoc={html}
      className="h-[400px] w-full rounded-lg border border-slate-700 bg-white"
      sandbox="allow-scripts allow-forms allow-popups"
    />
  );
}

export function ArtifactPreview({ artifact }: ArtifactPreviewProps) {
  if (isSlideArtifact(artifact)) return <SlideArtifactPreview artifact={artifact} />;
  if (isQuizArtifact(artifact)) return <QuizArtifactPreview artifact={artifact} />;

  const content = artifact.content as unknown as Record<string, unknown>;
  if (typeof content.html === 'string') {
    return <InteractiveArtifactPreview artifact={artifact} html={content.html} />;
  }
  return (
    <div className="rounded-xl border border-dashed border-slate-700 px-5 py-10 text-center text-sm text-slate-500">
      该产物暂时没有可视化预览。
    </div>
  );
}

function RichTextField({ html, onChange }: { html: string; onChange: (html: string) => void }) {
  return (
    <div
      contentEditable
      suppressContentEditableWarning
      onInput={(event) => onChange(event.currentTarget.innerHTML)}
      dangerouslySetInnerHTML={{ __html: html }}
      className="min-h-20 rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2 text-sm leading-6 text-slate-200 outline-none transition focus:border-cyan-400 [&_p]:m-0"
    />
  );
}

function SlideArtifactEditor({
  content,
  onChange,
}: {
  content: GeneratedSlideContent;
  onChange: (content: GeneratedSlideContent) => void;
}) {
  const textElements = content.elements.filter(
    (element): element is PPTTextElement => element.type === 'text',
  );

  function updateText(elementId: string, html: string) {
    const elements = content.elements.map((element) =>
      element.id === elementId && element.type === 'text'
        ? ({ ...element, content: html } as PPTElement)
        : element,
    );
    onChange({ ...content, elements });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-cyan-400/15 bg-cyan-400/[0.05] px-3 py-2 text-xs leading-5 text-cyan-100/70">
        直接修改下面的富文本，版式、位置和其他视觉元素会保持不变。
      </div>
      {textElements.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700 px-4 py-7 text-center text-xs text-slate-500">
          这页没有可直接编辑的文本元素。
        </div>
      ) : (
        textElements.map((element, index) => (
          <label key={element.id} className="block">
            <span className="mb-1.5 block text-xs text-slate-400">文本块 {index + 1}</span>
            <RichTextField
              html={element.content}
              onChange={(html) => updateText(element.id, html)}
            />
          </label>
        ))
      )}
      <label className="block">
        <span className="mb-1.5 block text-xs text-slate-400">教师备注</span>
        <textarea
          value={content.remark ?? ''}
          onChange={(event) => onChange({ ...content, remark: event.target.value })}
          placeholder="可选：填写讲授提示或备注"
          className="min-h-20 w-full rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-400"
        />
      </label>
    </div>
  );
}

function questionTypeLabel(type: QuizQuestionType): string {
  if (type === 'single') return '单选题';
  if (type === 'multiple') return '多选题';
  return '简答题';
}

function nextOptionValue(question: QuizQuestion): string | null {
  const used = new Set((question.options ?? []).map((option) => option.value));
  for (const value of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!used.has(value)) return value;
  return null;
}

function newQuestion(type: QuizQuestionType): QuizQuestion {
  const id = `question-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
  if (type === 'short_answer') {
    return { id, type, question: '新简答题', points: 1, hasAnswer: false };
  }
  return {
    id,
    type,
    question: type === 'single' ? '新单选题' : '新多选题',
    options: [
      { value: 'A', label: '选项 A' },
      { value: 'B', label: '选项 B' },
    ],
    answer: ['A'],
    points: 1,
    hasAnswer: true,
  };
}

function QuizArtifactEditor({
  content,
  onChange,
}: {
  content: GeneratedQuizContent;
  onChange: (content: GeneratedQuizContent) => void;
}) {
  function replaceQuestion(index: number, question: QuizQuestion) {
    onChange({
      ...content,
      questions: content.questions.map((current, currentIndex) =>
        currentIndex === index ? question : current,
      ),
    });
  }

  function changeType(question: QuizQuestion, type: QuizQuestionType): QuizQuestion {
    if (question.type === type) return question;
    if (type === 'short_answer') {
      const { options: _options, answer: _answer, ...rest } = question;
      return { ...rest, type, hasAnswer: false };
    }
    if (question.type === 'short_answer') {
      return {
        ...question,
        type,
        options: [
          { value: 'A', label: '选项 A' },
          { value: 'B', label: '选项 B' },
        ],
        answer: ['A'],
        hasAnswer: true,
      };
    }
    return {
      ...question,
      type,
      answer: type === 'single' ? (question.answer ?? []).slice(0, 1) : question.answer,
    };
  }

  function setCorrect(question: QuizQuestion, value: string, checked: boolean): QuizQuestion {
    if (question.type === 'single') return { ...question, answer: checked ? [value] : [] };
    const answers = new Set(question.answer ?? []);
    if (checked) answers.add(value);
    else answers.delete(value);
    return { ...question, answer: [...answers] };
  }

  return (
    <div className="space-y-4">
      {content.questions.map((question, questionIndex) => (
        <section
          key={question.id}
          className="rounded-xl border border-slate-700 bg-slate-950/45 p-4"
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-300">第 {questionIndex + 1} 题</span>
            <select
              value={question.type}
              onChange={(event) =>
                replaceQuestion(
                  questionIndex,
                  changeType(question, event.target.value as QuizQuestionType),
                )
              }
              className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-300"
            >
              <option value="single">单选题</option>
              <option value="multiple">多选题</option>
              <option value="short_answer">简答题</option>
            </select>
            <label className="ml-auto flex items-center gap-2 text-xs text-slate-500">
              分值
              <input
                type="number"
                min={0}
                max={10000}
                value={question.points ?? 1}
                onChange={(event) =>
                  replaceQuestion(questionIndex, {
                    ...question,
                    points: Number(event.target.value),
                  })
                }
                className="w-20 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-300"
              />
            </label>
            {content.questions.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...content,
                    questions: content.questions.filter((_, index) => index !== questionIndex),
                  })
                }
                className="rounded border border-rose-500/30 px-2 py-1 text-xs text-rose-300"
              >
                删除题目
              </button>
            )}
          </div>

          <textarea
            value={question.question}
            onChange={(event) =>
              replaceQuestion(questionIndex, { ...question, question: event.target.value })
            }
            className="min-h-20 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
          />

          {question.type !== 'short_answer' ? (
            <div className="mt-3 space-y-2">
              {(question.options ?? []).map((option) => (
                <div key={option.value} className="flex items-center gap-2">
                  <input
                    type={question.type === 'single' ? 'radio' : 'checkbox'}
                    name={`correct-${question.id}`}
                    checked={(question.answer ?? []).includes(option.value)}
                    onChange={(event) =>
                      replaceQuestion(
                        questionIndex,
                        setCorrect(question, option.value, event.target.checked),
                      )
                    }
                    aria-label={`将 ${option.value} 设为正确答案`}
                    className="accent-emerald-400"
                  />
                  <span className="w-5 font-mono text-xs text-slate-500">{option.value}</span>
                  <input
                    value={option.label}
                    onChange={(event) =>
                      replaceQuestion(questionIndex, {
                        ...question,
                        options: (question.options ?? []).map((current) =>
                          current.value === option.value
                            ? { ...current, label: event.target.value }
                            : current,
                        ),
                      })
                    }
                    className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-400"
                  />
                  {(question.options?.length ?? 0) > 2 && (
                    <button
                      type="button"
                      onClick={() =>
                        replaceQuestion(questionIndex, {
                          ...question,
                          options: (question.options ?? []).filter(
                            (current) => current.value !== option.value,
                          ),
                          answer: (question.answer ?? []).filter(
                            (answer) => answer !== option.value,
                          ),
                        })
                      }
                      className="text-xs text-rose-300"
                    >
                      删除
                    </button>
                  )}
                </div>
              ))}
              {nextOptionValue(question) && (
                <button
                  type="button"
                  onClick={() => {
                    const value = nextOptionValue(question);
                    if (!value) return;
                    replaceQuestion(questionIndex, {
                      ...question,
                      options: [...(question.options ?? []), { value, label: `选项 ${value}` }],
                    });
                  }}
                  className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-400 hover:border-cyan-400/50 hover:text-cyan-200"
                >
                  ＋ 添加选项
                </button>
              )}
            </div>
          ) : (
            <textarea
              value={question.commentPrompt ?? ''}
              onChange={(event) =>
                replaceQuestion(questionIndex, { ...question, commentPrompt: event.target.value })
              }
              placeholder="简答题评分提示（可选）"
              className="mt-3 min-h-16 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-400"
            />
          )}

          <textarea
            value={question.analysis ?? ''}
            onChange={(event) =>
              replaceQuestion(questionIndex, { ...question, analysis: event.target.value })
            }
            placeholder="答案解析（可选）"
            className="mt-3 min-h-16 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-400"
          />
        </section>
      ))}

      <div className="flex flex-wrap gap-2">
        {(['single', 'multiple', 'short_answer'] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() =>
              onChange({ ...content, questions: [...content.questions, newQuestion(type)] })
            }
            className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200"
          >
            ＋ {questionTypeLabel(type)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ArtifactStructuredEditor({
  artifact,
  saving,
  onCancel,
  onSave,
}: ArtifactEditorProps) {
  const [draft, setDraft] = useState(() => clone(artifact));
  const [error, setError] = useState('');

  async function save() {
    setError('');
    try {
      await onSave({ title: draft.title, content: draft.content });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败');
    }
  }

  return (
    <div
      data-testid="artifact-structured-editor"
      className="mt-4 rounded-xl border border-cyan-400/25 bg-slate-900/90 p-4 shadow-lg shadow-slate-950/30"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-slate-100">编辑产物内容</h3>
          <p className="mt-1 text-xs text-slate-500">
            保存后预览会立即刷新；学生端需重新发布后更新。
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          关闭
        </button>
      </div>

      <label className="mb-4 block">
        <span className="mb-1.5 block text-xs text-slate-400">产物标题</span>
        <input
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          className="w-full rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
        />
      </label>

      {isSlideArtifact(draft) ? (
        <SlideArtifactEditor
          content={draft.content}
          onChange={(content) => setDraft({ ...draft, content })}
        />
      ) : isQuizArtifact(draft) ? (
        <QuizArtifactEditor
          content={draft.content}
          onChange={(content) => setDraft({ ...draft, content })}
        />
      ) : null}

      {error && <div className="mt-3 text-xs text-rose-300">{error}</div>}
      <div className="mt-4 flex gap-2 border-t border-slate-700 pt-4">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !draft.title.trim()}
          className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? '保存中…' : '保存修改'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-300 disabled:opacity-50"
        >
          取消
        </button>
      </div>
    </div>
  );
}
