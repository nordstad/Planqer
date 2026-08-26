#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// API configuration - using localhost for local development, can be configured via env
const API_BASE_URL = process.env.PLANQER_API_URL || 'http://localhost:8002/api';

const LOG_LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 } as const;
type LogLevel = keyof typeof LOG_LEVELS;
const debugEnabled = ['1', 'true', 'yes', 'on'].includes((process.env.MCP_DEBUG || '').toLowerCase());
const configuredLevel = (process.env.MCP_LOG_LEVEL || (debugEnabled ? 'DEBUG' : 'INFO')).toUpperCase() as LogLevel;
const currentLevel: LogLevel = configuredLevel in LOG_LEVELS ? configuredLevel : 'INFO';

const parseIntEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const MCP_API_MAX_RETRIES = Math.max(0, parseIntEnv('MCP_API_MAX_RETRIES', 2));
const MCP_API_RETRY_BASE_DELAY_MS = Math.max(0, parseIntEnv('MCP_API_RETRY_BASE_DELAY_MS', 200));
const MCP_API_RETRY_MAX_DELAY_MS = Math.max(MCP_API_RETRY_BASE_DELAY_MS, parseIntEnv('MCP_API_RETRY_MAX_DELAY_MS', 2000));
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

const shouldLog = (level: LogLevel): boolean => LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
const REDACT_FIELDS = new Set(['parts', 'project_name', 'cut_list', 'visualization', 'content', 'structuredContent']);

const redactedPlaceholder = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `<redacted:list:${value.length} items>`;
  }
  if (value && typeof value === 'object') {
    return `<redacted:dict:${Object.keys(value as Record<string, unknown>).length} keys>`;
  }
  if (typeof value === 'string') {
    return `<redacted:str:${value.length} chars>`;
  }
  return '<redacted>';
};

const redactForLog = (value: unknown, key?: string): unknown => {
  if (key && REDACT_FIELDS.has(key)) {
    return redactedPlaceholder(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactForLog(item));
  }

  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      output[k] = redactForLog(v, k);
    }
    return output;
  }

  return value;
};

const log = (level: LogLevel, event: string, fields: Record<string, unknown> = {}) => {
  if (!shouldLog(level)) {
    return;
  }
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  const line = JSON.stringify(payload);
  if (level === 'ERROR') {
    console.error(line);
  } else {
    console.log(line);
  }
};

const makeRequestId = (): string => randomUUID().replace(/-/g, '').slice(0, 12);
const sleep = async (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const isRetryableStatus = (statusCode: number): boolean => RETRYABLE_STATUS_CODES.has(statusCode);
const retryDelayMs = (attemptNumber: number): number => {
  const baseMs = MCP_API_RETRY_BASE_DELAY_MS * (2 ** Math.max(0, attemptNumber - 1));
  const clampedMs = Math.min(baseMs, MCP_API_RETRY_MAX_DELAY_MS);
  const jitter = 0.8 + Math.random() * 0.4;
  return Math.round(clampedMs * jitter);
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOOLS_CONTRACT_PATH = path.resolve(__dirname, '..', 'schemas', 'mcp-tools.json');
const DEMO_PAYLOADS_PATH = path.resolve(__dirname, '..', 'schemas', 'demo-payloads.json');

type DemoPayload = {
  parts: Record<string, number>;
  available_board_lengths: number[];
  saw_blade_width: number;
  project_name: string;
};

type DemoPayloadMap = Record<string, DemoPayload>;

const loadToolsContract = (): Tool[] => {
  const parsed = JSON.parse(readFileSync(TOOLS_CONTRACT_PATH, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error('MCP tools contract must be a list');
  }
  return parsed as Tool[];
};

const loadDemoPayloads = (): DemoPayloadMap => {
  const parsed = JSON.parse(readFileSync(DEMO_PAYLOADS_PATH, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Demo payloads contract must be an object');
  }
  return parsed as DemoPayloadMap;
};

// Validation schemas
const PartsSchema = z.record(z.string(), z.number().positive());
const BoardLengthsSchema = z.array(z.number().positive());
const SawKerfSchema = z.number().nonnegative();
const ProjectNameSchema = z.string().optional();
const AlgorithmSchema = z.enum(['first_fit_decreasing', 'best_fit', 'best_fit_decreasing', 'genetic', 'branch_bound']).optional();

const OptimizeCuttingInputSchema = z.object({
  parts: PartsSchema,
  available_board_lengths: BoardLengthsSchema,
  saw_blade_width: SawKerfSchema,
  project_name: ProjectNameSchema,
  algorithm: AlgorithmSchema,
});

const AsyncOptimizeCuttingInputSchema = OptimizeCuttingInputSchema.extend({
  use_async: z.boolean().optional(),
});

const DEMO_PAYLOADS: DemoPayloadMap = loadDemoPayloads();

const TOOLS: Tool[] = loadToolsContract();

class PlanqerServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'planqer-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => log('ERROR', 'mcp_error', { error: String(error) });
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const requestId = makeRequestId();
      log('INFO', 'mcp_call_start', { requestId, tool: request.params.name });

      switch (request.params.name) {
        case 'optimize_cutting':
          return await this.handleOptimizeCutting(request.params.arguments || {}, requestId);
        case 'optimize_demo':
          return await this.handleOptimizeDemo(request.params.arguments || {}, requestId);
        case 'get_demo_payloads':
          return this.handleGetDemoPayloads(request.params.arguments || {});
        case 'get_cutting_example':
          return this.handleGetExample();
        default:
          log('WARN', 'mcp_call_unknown_tool', { requestId, tool: request.params.name });
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    });
  }

  private formatOptimizationResult(result: any, requestPayload: any): string {
    try {
      // Project information header
      let formatted = "🎯 **Cutting Optimization Results**\\n\\n";
      
      if (requestPayload.project_name) {
        formatted += `**Project:** ${requestPayload.project_name}\\n`;
      }

      // Input summary
      const partsCount = Object.values(requestPayload.parts).reduce((sum: number, qty: any) => sum + qty, 0);
      const partsTypes = Object.keys(requestPayload.parts).length;
      
      formatted += `**Input:** ${partsCount} total pieces of ${partsTypes} different lengths\\n`;
      formatted += `**Available boards:** ${requestPayload.available_board_lengths.length} different sizes\\n`;
      formatted += `**Saw kerf:** ${requestPayload.saw_blade_width} units\\n`;
      
      if (requestPayload.algorithm) {
        formatted += `**Algorithm:** ${requestPayload.algorithm}\\n`;
      }
      
      formatted += "\\n";

      // Results summary
      if (result.optimal_board_length) {
        formatted += `📊 **Optimization Summary:**\\n`;
        formatted += `- **Optimal board length:** ${result.optimal_board_length}\\n`;
        formatted += `- **Total cost:** ${result.cost} boards\\n`;
        formatted += `- **Total waste:** ${result.total_waste} units\\n`;
        formatted += `- **Algorithm used:** ${result.algorithm_used}\\n`;
        
        if (result.computation_time) {
          formatted += `- **Computation time:** ${result.computation_time.toFixed(3)}s\\n`;
        }
        
        formatted += "\\n";
      }

      // Cutting plan
      if (result.cut_list && Array.isArray(result.cut_list)) {
        formatted += `📋 **Cutting Plan (${result.cut_list.length} boards):**\\n`;
        result.cut_list.forEach((board: number[], index: number) => {
          const boardTotal = board.reduce((sum, part) => sum + part, 0);
          formatted += `- **Board ${index + 1}:** [${board.join(', ')}] = ${boardTotal} units\\n`;
        });
        formatted += "\\n";
      }

      // Visualization note
      if (result.visualization) {
        formatted += "📊 **Visualization:** Available as base64 encoded image\\n\\n";
      }

      // Raw data for detailed analysis
      formatted += "📄 **Complete API Response:**\\n";
      formatted += "```json\\n";
      formatted += JSON.stringify(result, null, 2);
      formatted += "\\n```\\n\\n";

      // AI interpretation helper
      formatted += "💡 **For AI Assistants:**\\n";
      formatted += "- Parse the cut_list to provide specific cutting instructions\\n";
      formatted += "- Use total_waste to calculate material efficiency\\n";
      formatted += "- The visualization field contains a base64 image showing the cutting plan\\n";
      formatted += "- Cost represents the number of boards needed\\n";

      return formatted;
    } catch (error) {
      return `⚠️ Error formatting response: ${error}\\n\\nRaw response:\\n\`\`\`json\\n${JSON.stringify(result, null, 2)}\\n\`\`\``;
    }
  }

  private async handleOptimizeCutting(args: any, requestId?: string): Promise<CallToolResult> {
    const rid = requestId || makeRequestId();
    try {
      // Validate input
      const validatedInput = AsyncOptimizeCuttingInputSchema.parse(args);
      const useAsync = validatedInput.use_async || false;
      
      // Remove use_async from payload as it's not part of the API
      const { use_async, ...apiPayload } = validatedInput;

      // Make API request - choose sync or async endpoint
      const endpoint = useAsync ? '/cutting-plans/async' : '/cutting-plans';
      log('DEBUG', 'api_request_start', { requestId: rid, endpoint, async: useAsync });
      log('DEBUG', 'api_request_payload', { requestId: rid, payload: redactForLog(apiPayload) });
      const maxAttempts = MCP_API_MAX_RETRIES + 1;
      let response: { status: number; data: any } | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        log('DEBUG', 'api_request_attempt', { requestId: rid, attempt, maxAttempts });
        try {
          const candidate = await axios.post(
            `${API_BASE_URL}${endpoint}`,
            apiPayload,
            {
              timeout: useAsync ? 5000 : 30000,
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );

          if (isRetryableStatus(candidate.status) && attempt < maxAttempts) {
            const delayMs = retryDelayMs(attempt);
            log('WARN', 'api_response_retryable', {
              requestId: rid,
              status: candidate.status,
              attempt,
              nextDelayMs: delayMs,
            });
            await sleep(delayMs);
            continue;
          }

          response = candidate;
          break;
        } catch (error) {
          if (axios.isAxiosError(error) && !error.response && attempt < maxAttempts) {
            const delayMs = retryDelayMs(attempt);
            log('WARN', 'api_request_retry', {
              requestId: rid,
              attempt,
              reason: error.code || 'network_error',
              nextDelayMs: delayMs,
            });
            await sleep(delayMs);
            continue;
          }
          throw error;
        }
      }

      if (!response) {
        throw new Error('API request failed before producing a response');
      }
      log('DEBUG', 'api_response_status', { requestId: rid, status: response.status });
      log('DEBUG', 'api_response_json', { requestId: rid, body: redactForLog(response.data) });

      if (useAsync) {
        // Handle async response - return task information
        const asyncResult = response.data;
        log('INFO', 'mcp_call_end', { requestId: rid, tool: 'optimize_cutting', mode: 'async' });
        return {
          content: [
            {
              type: 'text',
              text: `🚀 **Async Optimization Started**\\n\\n` +
                   `**Task ID:** ${asyncResult.task_id}\\n` +
                   `**Status:** ${asyncResult.status}\\n` +
                   `**Message:** ${asyncResult.message}\\n\\n` +
                   `**Next Steps:**\\n` +
                   `- Check progress at: ${asyncResult.progress_url}\\n` +
                   `- WebSocket updates available at: ${asyncResult.websocket_url}\\n\\n` +
                   `The optimization is running in the background. For complex problems, this can provide better results than the synchronous endpoint.`,
            },
          ],
        };
      } else {
        // Handle synchronous response
        const formattedResponse = this.formatOptimizationResult(response.data, apiPayload);
        log('INFO', 'mcp_call_end', { requestId: rid, tool: 'optimize_cutting', mode: 'sync' });
        return {
          content: [
            {
              type: 'text',
              text: formattedResponse,
            },
          ],
        };
      }

    } catch (error) {
      log('ERROR', 'api_request_failed', { requestId: rid, error: String(error) });
      
      let errorMessage = 'Failed to optimize cutting plan';
      if (axios.isAxiosError(error)) {
        if (error.response) {
          const retryableLabel = isRetryableStatus(error.response.status) ? 'retryable' : 'non-retryable';
          errorMessage = `❌ API Error (${error.response.status}): ${
            error.response.data?.detail || error.response.data?.message || error.response.statusText
          } (${retryableLabel})`;
        } else if (error.request) {
          errorMessage = `❌ Network error: Could not reach the Planqer API at ${API_BASE_URL}. Please check if the service is running. (retryable)`;
        } else {
          errorMessage = `❌ Request error: ${error.message}`;
        }
      } else if (error instanceof z.ZodError) {
        errorMessage = `❌ Validation error: ${error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ')}`;
      } else {
        errorMessage = `❌ Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
      }

      return {
        content: [
          {
            type: 'text',
            text: errorMessage,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleOptimizeDemo(args: any, requestId?: string): Promise<CallToolResult> {
    const rid = requestId || makeRequestId();
    const example = args.example;
    const useAsync = args.use_async || false;
    
    if (!example || !(example in DEMO_PAYLOADS)) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Invalid or missing example. Available options: ${Object.keys(DEMO_PAYLOADS).join(', ')}`,
          },
        ],
        isError: true,
      };
    }

    // Get the demo payload and add async flag if specified
    const payload = { ...DEMO_PAYLOADS[example as keyof typeof DEMO_PAYLOADS] };
    if (useAsync) {
      (payload as any).use_async = true;
    }

    log('DEBUG', 'demo_selected', { requestId: rid, example, async: Boolean(useAsync) });

    // Run the optimization
    const result = await this.handleOptimizeCutting(payload, rid);

    // Prepend demo information
    if (result.content && result.content[0] && 'text' in result.content[0]) {
      const demoInfo = `🎯 **Optimizing with "${example.replace('_', ' ')}" demo payload:**\\n\\n`;
      result.content[0].text = demoInfo + result.content[0].text;
    }

    return result;
  }

  private handleGetDemoPayloads(args: any): CallToolResult {
    const example = args.example || 'all';

    if (example === 'all') {
      // Return all demo payloads
      const formattedPayloads = Object.entries(DEMO_PAYLOADS).map(([name, payload]) => 
        `**${name.replace('_', ' ').charAt(0).toUpperCase() + name.replace('_', ' ').slice(1)}:**\\n\`\`\`json\\n${JSON.stringify(payload, null, 2)}\\n\`\`\``
      );

      return {
        content: [
          {
            type: 'text',
            text: `🎯 **Demo Payloads for Planqer API Testing**\\n\\n` +
                 `Here are pre-configured demo payloads you can use to test the cutting optimization API:\\n\\n` +
                 `${formattedPayloads.join('\\n\\n')}\\n\\n` +
                 `**How to use:**\\n` +
                 `1. Copy any of the JSON payloads above\\n` +
                 `2. Use the \`optimize_cutting\` tool with the copied payload\\n` +
                 `3. Or call \`optimize_demo\` with a specific example name\\n\\n` +
                 `**Available examples:** ${Object.keys(DEMO_PAYLOADS).join(', ')}`,
          },
        ],
      };
    } else if (example in DEMO_PAYLOADS) {
      // Return specific demo payload
      const payload = DEMO_PAYLOADS[example as keyof typeof DEMO_PAYLOADS];
      return {
        content: [
          {
            type: 'text',
            text: `📋 **${example.replace('_', ' ').charAt(0).toUpperCase() + example.replace('_', ' ').slice(1)} Demo Payload:**\\n\\n` +
                 `\`\`\`json\\n${JSON.stringify(payload, null, 2)}\\n\`\`\`\\n\\n` +
                 `**Ready to use with optimize_cutting tool!**\\n\\n` +
                 `This payload includes:\\n` +
                 `- **Parts:** ${Object.keys(payload.parts).length} different lengths\\n` +
                 `- **Board sizes:** ${payload.available_board_lengths.length} available lengths\\n` +
                 `- **Saw kerf:** ${payload.saw_blade_width} units\\n` +
                 `- **Project:** ${payload.project_name}\\n\\n` +
                 `Copy the JSON above and use it with the \`optimize_cutting\` tool to get an optimized cutting plan.`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Unknown demo example: '${example}'. Available options: ${Object.keys(DEMO_PAYLOADS).join(', ')}, all`,
          },
        ],
        isError: true,
      };
    }
  }

  private handleGetExample(): CallToolResult {
    const example = DEMO_PAYLOADS.kitchen_cabinets;

    return {
      content: [
        {
          type: 'text',
          text: `📋 **Example cutting optimization request:**\\n\\n` +
               `\`\`\`json\\n${JSON.stringify(example, null, 2)}\\n\`\`\`\\n\\n` +
               `**This example shows:**\\n` +
               `- **Parts needed:** 4 pieces of 12.5", 2 pieces of 8.25", 3 pieces of 6.0", and 1 piece of 4.75"\\n` +
               `- **Available board lengths:** 96", 120", and 144"\\n` +
               `- **Saw blade kerf:** 0.125" (1/8 inch)\\n` +
               `- **Project name:** "Kitchen Cabinet Shelves"\\n\\n` +
               `You can use the \`optimize_cutting\` tool with similar data to get an optimized cutting plan that minimizes waste.\\n\\n` +
               `**Available algorithms:**\\n` +
               `- \`first_fit_decreasing\` - Fast algorithm for large problems\\n` +
               `- \`best_fit\` - Better space utilization\\n` +
               `- \`best_fit_decreasing\` - Combines sorting with best fit (recommended)\\n` +
               `- \`genetic\` - Near-optimal solutions for complex problems\\n` +
               `- \`branch_bound\` - Optimal solutions for small problems\\n\\n` +
               `**Usage:**\\n` +
               `\`\`\`\\noptimize_cutting(${JSON.stringify(example)})\\n\`\`\``,
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    log('INFO', 'mcp_server_start', { apiBaseUrl: API_BASE_URL, logLevel: currentLevel });
  }
}

const server = new PlanqerServer();
server.run().catch((error) => log('ERROR', 'mcp_server_fatal', { error: String(error) }));
