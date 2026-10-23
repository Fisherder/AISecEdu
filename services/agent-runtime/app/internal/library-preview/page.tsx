'use client';

import { useEffect, useState } from 'react';
import { IntegratedLessonPreview } from '@/components/integrated-lesson-preview';
import type { LessonArtifact } from '@/lib/types/lesson';

export default function LibraryPreviewPage() {
  const [lesson, setLesson] = useState<{ title: string; artifacts: LessonArtifact[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || '';
    const version = params.get('version') || '';
    async function load() {
      try {
        const response = await fetch(`/pwncollege_api/v1/material-library/items/${encodeURIComponent(id)}?version=${encodeURIComponent(version)}`, {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) throw new Error('素材暂不能预览，请确认登录状态和共享权限。');
        const result = await response.json();
        const item = result?.data?.item;
        const content = (item?.previewPayload || item?.snapshot?.payload)?.content;
        const candidate = content?.lesson || content;
        if (!Array.isArray(candidate?.artifacts) || candidate.artifacts.length === 0)
          throw new Error('这项内容没有完整的可视化预览，请返回素材信息查看。');
        setLesson({ title: item.title, artifacts: candidate.artifacts });
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '预览加载失败。');
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  if (error) return <main role="alert" style={{ padding: 32 }}>{error}</main>;
  if (!lesson) return <main role="status" style={{ padding: 32 }}>正在读取素材预览…</main>;
  return <main data-library-preview="ready" style={{ minHeight: '100dvh', width: '100%' }}>
    <IntegratedLessonPreview artifacts={lesson.artifacts} title={lesson.title} />
  </main>;
}
