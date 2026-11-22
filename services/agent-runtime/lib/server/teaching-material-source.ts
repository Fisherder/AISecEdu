import {
  AISECEDU_SERVICE_HEADER,
  aiseceduInternalOrigin,
  serviceTokenForInternalCall,
} from './aisecedu-integration';

export class TeachingMaterialSizeError extends Error {}

export async function extractMaterial(
  jobId: string,
  payload: Record<string, unknown>,
  traceId: string,
  signal?: AbortSignal,
) {
  const response = await fetchJobMaterial(jobId, traceId, signal);
  const blob = await response.blob();
  const filename = String(payload.filename || 'material');
  const mimeType = String(payload.mimeType || blob.type || 'application/octet-stream');
  let text: string;
  if (mimeType.startsWith('text/')) {
    text = await blob.text();
  } else {
    const form = new FormData();
    form.set('file', new File([blob], filename, { type: mimeType }));
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || '';
    const extraction = await fetch(
      `http://127.0.0.1:${process.env.PORT || '3000'}${basePath}/api/extract-document`,
      {
        method: 'POST',
        headers: {
          [AISECEDU_SERVICE_HEADER]: serviceTokenForInternalCall(),
          'X-Trace-ID': traceId,
        },
        body: form,
        cache: 'no-store',
        signal,
      },
    );
    const body = (await extraction.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { text?: string; data?: { text?: string } };
      error?: string;
    };
    // apiSuccess() exposes the parsed document as data.text. Keep accepting the
    // older nested form while every deployed extractor converges on that
    // contract.
    const extractedText = body.data?.text || body.data?.data?.text;
    if (!extraction.ok || !body.success || !extractedText) {
      throw new Error(body.error || `Document extraction failed (HTTP ${extraction.status})`);
    }
    text = extractedText;
  }
  return { text, chunks: indexedMaterialChunks(text, filename, mimeType) };
}

async function fetchJobMaterial(jobId: string, traceId: string, signal?: AbortSignal, redirect?: RequestRedirect) {
  const response = await fetch(
    `${aiseceduInternalOrigin()}/pwncollege_api/v1/teaching/runtime/jobs/${encodeURIComponent(jobId)}/material`,
    {
      headers: {
        [AISECEDU_SERVICE_HEADER]: serviceTokenForInternalCall(),
        'X-Trace-ID': traceId,
      },
      cache: 'no-store',
      signal,
      redirect,
    },
  );
  if (!response.ok) throw new Error(`Unable to fetch course material (HTTP ${response.status})`);
  return response;
}

export async function readIndexedTeachingMaterial(
  jobId: string,
  traceId: string,
  signal: AbortSignal,
) {
  const response = await fetchJobMaterial(jobId, traceId, signal, 'error');
  if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'text/plain' || !response.body) {
    await response.body?.cancel();
    throw new Error('Expected an indexed teaching text response');
  }
  // The index accepts one million Unicode characters, each at most four UTF-8 bytes.
  const maximumBytes = 4_000_000;
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', {fatal: true});
  const parts: string[] = [];
  let byteLength = 0;
  try {
    if (Number(response.headers.get('content-length')) > maximumBytes) throw new TeachingMaterialSizeError();
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > maximumBytes) throw new TeachingMaterialSizeError();
      parts.push(decoder.decode(next.value, {stream: true}));
    }
    parts.push(decoder.decode());
    return parts.join('');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function indexedMaterialChunks(
  text: string,
  filename: string,
  mimeType: string,
  characters: string | string[] = text,
) {
  if (!text.trim()) throw new Error('Course material extraction returned no readable text');
  if (characters.length > 1_000_000) {
    throw new TeachingMaterialSizeError(
      'Course material contains more than 1,000,000 extracted characters; split it into smaller source files so every part can be read completely',
    );
  }
  const chunks: Array<Record<string, unknown>> = [];
  for (let offset = 0, ordinal = 0; offset < characters.length; offset += 6_000, ordinal++) {
    chunks.push({
      sourceType: 'document',
      sourceLocator: { filename, offset, ordinal },
      content:
        typeof characters === 'string'
          ? characters.slice(offset, offset + 6_000)
          : characters.slice(offset, offset + 6_000).join(''),
      metadata: { mimeType },
    });
  }
  return chunks;
}
