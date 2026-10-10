import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { spawn } from 'node:child_process';
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
let backendRetryCalls = 0;
let backendAsyncRetryCalls = 0;
let lastCutBody: any = null;
let catalogueQueries: URLSearchParams[] = [];
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

        if (body.project_name === 'async-retry-test') {
          backendAsyncRetryCalls += 1;
          json(res, 503, { detail: 'temporarily unavailable' });
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

      if (req.method === 'GET' && req.url?.startsWith('/api/catalogue/products')) {
        const query = new URL(req.url, 'http://localhost').searchParams;
        catalogueQueries.push(query);
        const regel = {
          name: 'Framing timber / studs 45 × 95 mm',
          product: {
            id: 'se:regel:45x95',
            grades: ['C24'],
            species: ['pine'],
            lengths: [2400, 3000],
            sources: ['https://www.traguiden.se/'],
          },
        };
        if (query.get('id')) {
          json(res, 200, query.get('id') === regel.product.id ? [regel] : []);
        } else {
          json(res, 200, query.get('q') === 'nothing-matches' ? [] : [regel]);
        }
        return;
      }

      if (req.method === 'POST' && req.url === '/api/cutting-plans') {
        backendCalls += 1;
        const body = await readJsonBody(req);
        lastCutBody = body;

        if (!body.parts || !body.available_board_lengths || body.saw_blade_width === undefined) {
          json(res, 400, { detail: 'Missing required payload fields' });
          return;
        }

        if (body.project_name === 'retry-test') {
          backendRetryCalls += 1;
          if (backendRetryCalls === 1) {
            json(res, 503, { detail: 'temporarily unavailable' });
            return;
          }
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
    expect(names).toContain('search_products');
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
    expect(result.isError).not.toBe(true);
    expect(backendCalls).toBeGreaterThan(0);
  });

  it('searches the product catalogue through the API', async () => {
    catalogueQueries = [];
    const result = await client!.callTool({
      name: 'search_products',
      arguments: { query: 'regel 45x95', kind: 'board', language: 'sv' },
    });

    const text = (result.content as any[]).find((block) => block.type === 'text').text as string;
    expect(result.isError).not.toBe(true);
    expect(text).toContain('Products matching "regel 45x95"');
    expect(text).toContain('`se:regel:45x95`');
    expect(text).toContain('Standard lengths: 2400, 3000 mm');
    expect(catalogueQueries[0].get('q')).toBe('regel 45x95');
    expect(catalogueQueries[0].get('kind')).toBe('board');
    expect(catalogueQueries[0].get('lang')).toBe('sv');
    expect(catalogueQueries[0].get('limit')).toBe('10');
  });

  it('says so when no product matches and rejects bad search input', async () => {
    const none = await client!.callTool({ name: 'search_products', arguments: { query: 'nothing-matches' } });
    expect((none.content as any[])[0].text).toContain('No products found for "nothing-matches"');

    const bad = await client!.callTool({ name: 'search_products', arguments: { query: '' } });
    expect(bad.isError).toBe(true);
    expect((bad.content as any[])[0].text).toContain('Validation error');
  });

  it('shows own-words and catalogue products with the result and does not send them to the planner', async () => {
    const own = await client!.callTool({
      name: 'optimize_cutting',
      arguments: { parts: { '100': 1 }, available_board_lengths: [300], saw_blade_width: 3, product: 'Furu 45x95' },
    });
    expect((own.content as any[])[0].text).toContain('**Product:** Furu 45x95 (own words)');
    expect(lastCutBody.product).toBeUndefined();

    const resolved = await client!.callTool({
      name: 'optimize_cutting',
      arguments: { parts: { '100': 1 }, available_board_lengths: [300], saw_blade_width: 3, product: 'se:regel:45x95' },
    });
    const text = (resolved.content as any[])[0].text as string;
    expect(text).toContain('Framing timber / studs 45 × 95 mm (`se:regel:45x95`)');
    expect(text).toContain('Standard stock lengths for this product:** 2400, 3000 mm');
    expect(lastCutBody.product).toBeUndefined();
  });

  it('refuses an unknown catalogue id without planning anything', async () => {
    const before = backendCalls;
    const result = await client!.callTool({
      name: 'optimize_cutting',
      arguments: { parts: { '100': 1 }, available_board_lengths: [300], saw_blade_width: 3, product: 'se:regel:1x1' },
    });
    expect(result.isError).toBe(true);
    expect((result.content as any[])[0].text).toContain("Unknown catalogue product 'se:regel:1x1'");
    expect(backendCalls).toBe(before);
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

  it('retries transient backend failures before returning a result', async () => {
    const result = await client!.callTool({
      name: 'optimize_cutting',
      arguments: {
        parts: { '100': 1 },
        available_board_lengths: [300],
        saw_blade_width: 3,
        project_name: 'retry-test',
      },
    });

    const textBlock = result.content.find((block: any) => block.type === 'text') as { text: string } | undefined;
    expect(textBlock).toBeDefined();
    expect(textBlock!.text).toContain('Optimal board length:');
    expect(backendRetryCalls).toBe(2);
  });

  it('does not retry async submissions without idempotency support', async () => {
    const result = await client!.callTool({
      name: 'optimize_cutting',
      arguments: {
        parts: { '100': 1 },
        available_board_lengths: [300],
        saw_blade_width: 3,
        project_name: 'async-retry-test',
        use_async: true,
      },
    });

    expect(result.isError).toBe(true);
    expect(backendAsyncRetryCalls).toBe(1);
  });

  it('keeps TypeScript stdio stdout free of non-JSON-RPC logs', async () => {
    const child = spawn('node', [serverEntry], {
      cwd: projectRoot,
      env: { ...process.env, PLANQER_API_URL: backendUrl },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'stdout-test', version: '1.0.0' },
      },
    })}\n`);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('stdio server did not respond')), 5000);
      child.stdout.once('data', () => {
        clearTimeout(timeout);
        resolve();
      });
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    child.kill();

    const lines = stdout.trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});
