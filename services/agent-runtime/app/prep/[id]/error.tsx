'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function PreviewError({ reset }: { reset: () => void }) {
  const { id } = useParams<{ id: string }>();
  const message = '课件读取遇到问题，请重新加载。已有内容不会被修改。';
  useEffect(() => {
    if (window.parent !== window)
      window.parent.postMessage(
        { type: 'aisecedu:artifact-preview', artifactId: id, state: 'error', message },
        window.location.origin,
      );
  }, [id]);
  return (
    <main data-aisecedu-preview-state="error" style={{ minHeight: '100vh', padding: 24 }}>
      <section role="alert" style={{ maxWidth: 520, margin: '12vh auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>课件预览暂时无法打开</h1>
        <p style={{ marginBottom: 20 }}>{message}</p>
        <button
          type="button"
          onClick={reset}
          style={{
            border: '1px solid #2563eb',
            borderRadius: 8,
            padding: '10px 18px',
            background: '#2563eb',
            color: '#fff',
          }}
        >
          重新加载
        </button>
      </section>
    </main>
  );
}
