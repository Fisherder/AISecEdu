import { NextResponse } from 'next/server';
import { integrationMetricLines } from '@/lib/server/integration-metrics';

export const dynamic = 'force-dynamic';

export async function GET() {
  const memory = process.memoryUsage();
  const lines = [
    '# HELP aisecedu_agent_runtime_up Global agent runtime availability.',
    '# TYPE aisecedu_agent_runtime_up gauge',
    'aisecedu_agent_runtime_up 1',
    '# HELP aisecedu_agent_runtime_process_uptime_seconds Global agent runtime Node process uptime.',
    '# TYPE aisecedu_agent_runtime_process_uptime_seconds gauge',
    `aisecedu_agent_runtime_process_uptime_seconds ${process.uptime().toFixed(3)}`,
    '# HELP aisecedu_agent_runtime_process_resident_memory_bytes Global agent runtime resident memory.',
    '# TYPE aisecedu_agent_runtime_process_resident_memory_bytes gauge',
    `aisecedu_agent_runtime_process_resident_memory_bytes ${memory.rss}`,
    '# HELP aisecedu_agent_runtime_process_heap_used_bytes Global agent runtime used JavaScript heap.',
    '# TYPE aisecedu_agent_runtime_process_heap_used_bytes gauge',
    `aisecedu_agent_runtime_process_heap_used_bytes ${memory.heapUsed}`,
    ...integrationMetricLines(),
  ];
  return new NextResponse(`${lines.join('\n')}\n`, {
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
