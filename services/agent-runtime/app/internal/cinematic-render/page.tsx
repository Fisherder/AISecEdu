'use client';

import { useEffect, useState } from 'react';
import { CinematicPreview } from '@/components/cinematic-preview';
import { compileCinematicScene } from '@/lib/cinematic/compile';
import { parseCinematicScene } from '@/lib/cinematic/schema';

declare global {
  interface Window { renderCinematic?: (scene: unknown) => void; }
}

export default function CinematicRenderPage() {
  const [content, setContent] = useState<{ html: string; title: string } | null>(null);
  useEffect(() => {
    window.renderCinematic = (value) => {
      const scene = parseCinematicScene(value);
      setContent({ html: compileCinematicScene(scene), title: scene.title });
    };
    return () => { delete window.renderCinematic; };
  }, []);
  return <main style={{ padding: 0, margin: 0, width: '100%' }}>
    {content && <CinematicPreview html={content.html} title={content.title} />}
  </main>;
}
