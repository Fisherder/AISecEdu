import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function main() {
  const transport = new StdioClientTransport({ command: 'pnpm', args: ['mcp'] });
  const client = new Client({ name: 'aisecedu-global-agent-tools-test', version: '1.0' });
  await client.connect(transport);

  const tools = await client.listTools();
  console.log('TOOLS:', tools.tools.map((t) => t.name).join(', '));

  const r = await client.callTool({ name: 'list_courses', arguments: {} });
  console.log(
    'list_courses →',
    JSON.stringify((r.content as Array<{ text?: string }>)[0]?.text ?? '').slice(0, 200),
  );

  await transport.close();
  process.exit(0);
}
main().catch((e) => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
