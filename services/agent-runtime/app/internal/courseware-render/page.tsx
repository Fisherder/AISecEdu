'use client';

import { useEffect, useState } from 'react';
import { CoursewareCanvas, CoursewareSlidePreview } from '@/components/courseware-slide-preview';
import { coursewareSlideDataSchema, type CoursewareSlideData } from '@/lib/courseware/schema';
import { IntegratedLessonPreview } from '@/components/integrated-lesson-preview';
import type { LessonArtifact } from '@/lib/types/lesson';

declare global {
  interface Window {
    renderCourseware?: (value: unknown, step: number, interactive?: boolean | 'deck') => void;
  }
}

export default function CoursewareRenderPage() {
  const [value, setValue] = useState<{
    data: CoursewareSlideData;
    step: number;
    interactive: boolean | 'deck';
  } | null>(null);
  useEffect(() => {
    window.renderCourseware = (data, step, interactive = false) => {
      if (!Number.isFinite(step)) throw new Error('Invalid playback step');
      setValue({ data: coursewareSlideDataSchema.parse(data), step, interactive });
    };
    return () => {
      delete window.renderCourseware;
    };
  }, []);
  return (
    <main data-courseware-render-surface style={{ width: 1000, margin: 0 }}>
      {value &&
        (value.interactive === 'deck' ? (
          <IntegratedLessonPreview title="课件导航验收" artifacts={[0, 1].map(index => ({
            id: `${value.data.page.id}-${index}`, type: 'slide', title: `${value.data.page.title}-${index + 1}`,
            order: index + 1, createdAt: 0, outline: { id: `${value.data.page.id}-${index}`, type: 'slide',
              title: value.data.page.title, description: value.data.page.objective, keyPoints: [], order: index + 1 },
            content: { elements: [], studio: { ...value.data, page: { ...value.data.page, id: `${value.data.page.id}-${index}` } } },
          })) as LessonArtifact[]} />
        ) : value.interactive ? (
          <CoursewareSlidePreview key={value.data.page.id} data={value.data} />
        ) : (
          <CoursewareCanvas data={value.data} step={value.step} />
        ))}
    </main>
  );
}
