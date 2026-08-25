import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const serverEntry = path.join(projectRoot, 'dist', 'index.js');

let backendCalls = 0;
let backendAsyncCalls = 0;
let backendServer: ReturnType<typeof createServer> | null = null;
let backendUrl = '';
let client: Client | null = null;
let transport: StdioClientTransport | null = null;

const readJsonBody = async (req: IncomingMessage): Promise<any> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

const json = (res: ServerResponse, statusCode: number, data: unknown) => {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
};

describe('MCP stdio integration', () => {
  beforeAll(async () => {
    backendServer = createServer(async (req, res) => {
      if (req.method === 'POST' && req.url === '/api/cutting-plans/async') {
        backendAsyncCalls += 1;
        const body = await readJsonBody(req);

        if (!body.parts || !body.available_board_lengths || body.saw_blade_width === undefined) {
          json(res, 400, { detail: 'Missing required payload fields' });
          return;
        }

        json(res, 200, {
          task_id: 'test-task-123',
          status: 'queued',
          message: 'Optimization task started. Connect to WebSocket for progress updates.',
          websocket_url: '/ws/test-task-123',
          progress_url: '/api/tasks/test-task-123',
        });
        return;
      }

      if (req.method === 'POST' && req.url === '/api/cutting-plans') {
        backendCalls += 1;
        const body = await readJsonBody(req);

        if (!body.parts || !body.available_board_lengths || body.saw_blade_width === undefined) {
          json(res, 400, { detail: 'Missing required payload fields' });
          return;
        }

        json(res, 200, {
          optimal_board_length: 300,
          cost: 2,
          total_waste: 12,
          algorithm_used: 'first_fit_decreasing',
          computation_time: 0.01,
          cut_list: [[100, 100], [100]],
          visualization: 'data:image/svg+xml;base64,PHN2Zw==',
        });
        return;
      }

      json(res, 404, { detail: 'Not Found' });
    });

    await new Promise<void>((resolve) => {
      backendServer!.listen(0, '127.0.0.1', () => resolve());
    });

    const address = backendServer.address() as AddressInfo;
    backendUrl = `http://127.0.0.1:${address.port}/api`;

    transport = new StdioClientTransport({
      command: 'node',
      args: [serverEntry],
      cwd: projectRoot,
      env: {
        ...process.env,
        PLANQER_API_URL: backendUrl,
      } as Record<string, string>,
      stderr: 'pipe',
    });

    client = new Client({
      name: 'planqer-mcp-integration-test',
      version: '1.0.0',
    });

    await client.connect(transport);
  });

  afterAll(async () => {
    if (transport) {
      await transport.close();
      transport = null;
    }

    if (backendServer) {
      await new Promise<void>((resolve, reject) => {
        backendServer!.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
      backendServer = null;
    }
  });

  it('lists expected MCP tools', async () => {
    const result = await client!.listTools();
    const names = result.tools.map((tool) => tool.name);

    expect(names).toContain('optimize_cutting');
    expect(names).toContain('optimize_demo');
    expect(names).toContain('get_demo_payloads');
    expect(names).toContain('get_cutting_example');
  });

  it('executes optimize_cutting via stdio against backend API', async () => {
    const result = await client!.callTool({
      name: 'optimize_cutting',
      arguments: {
        parts: { '100': 3 },
        available_board_lengths: [300],
        saw_blade_width: 3,
      },
    });

    expect(result.content.length).toBeGreaterThan(0);

    const textBlock = result.content.find((block: any) => block.type === 'text') as { text: string } | undefined;
    expect(textBlock).toBeDefined();
    expect(textBlock!.text).toContain('Cutting Optimization Results');
    expect(textBlock!.text).toContain('Optimal board length:');
    expect(backendCalls).toBeGreaterThan(0);
  });

  it('executes optimize_cutting async mode via stdio against backend API', async () => {
    const result = await client!.callTool({
      name: 'optimize_cutting',
      arguments: {
        parts: { '100': 2 },
        available_board_lengths: [300],
        saw_blade_width: 3,
        use_async: true,
      },
    });

    expect(result.content.length).toBeGreaterThan(0);

    const textBlock = result.content.find((block: any) => block.type === 'text') as { text: string } | undefined;
    expect(textBlock).toBeDefined();
    expect(textBlock!.text).toContain('Async Optimization Started');
    expect(textBlock!.text).toContain('Task ID:');
    expect(textBlock!.text).toContain('/api/tasks/test-task-123');
    expect(backendAsyncCalls).toBeGreaterThan(0);
  });
});
