// Run inside the teaching service via stdin. Only a synthetic prompt leaves this process.
const origin = new URL('http://127.0.0.1');
origin.port = process.env.PORT || '3081';
const expectedModel = process.env.DEEPSEEK_MODEL?.trim();
const secret = process.env.HARNESS_SERVICE_SECRET;
const body = JSON.stringify({ messages: [{ role: 'user', content: '请只回复四个字：教学回执' }] });

class ReadinessError extends Error {}

async function check() {
  if (!secret || !expectedModel) throw new ReadinessError('Service credential or expected model is missing');
  const health = await fetch(new URL('/health', origin), { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (health.status !== 200 || (await health.json()).status !== 'ok') throw new ReadinessError('Health check failed');

  const endpoint = new URL('/v1/turn', origin);
  const options = { method: 'POST', redirect: 'error', body, headers: { 'content-type': 'application/json' } };
  const anonymous = await fetch(endpoint, { ...options, signal: AbortSignal.timeout(5000) });
  await anonymous.body?.cancel();
  if (anonymous.status !== 401) throw new ReadinessError('The service did not require authentication');
  const response = await fetch(endpoint, {
    ...options, headers: { ...options.headers, authorization: 'Bearer ' + secret },
    signal: AbortSignal.timeout(95000),
  });
  if (response.status !== 200) throw new ReadinessError('Synthetic turn returned HTTP ' + response.status);
  const { text, model, usage } = await response.json();
  if (model !== expectedModel) throw new ReadinessError('The DSH session reports a different model');
  if (typeof text !== 'string' || !text.includes('教学回执')) throw new ReadinessError('The synthetic answer was not recognized');
  if (!Number.isSafeInteger(usage?.total_tokens) || usage.total_tokens < 1) throw new ReadinessError('Token usage is missing');
  console.log(JSON.stringify({ ready: true, model, totalTokens: usage.total_tokens, unauthenticatedStatus: anonymous.status }));
}

check().catch(error => {
  // The provider body is intentionally excluded from operator output.
  console.error(error instanceof ReadinessError ? error.message : 'Harness did not return a complete readiness response');
  process.exitCode = 1;
});
