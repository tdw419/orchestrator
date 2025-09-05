#!/usr/bin/env node

// TypeScript Windows Orchestrator with Recursive Testing
// Comprehensive desktop automation with mandatory verification before completion

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type {
  Task, TaskStep, PlannedAction, ActionResult, AttemptInfo, StepContext,
  HistoryEntry, OrchestratorConfig, GlobalLearning, VerificationParams,
  SubtaskParams, TemplateParams, DesktopDriverResponse, LLMResponse,
  ErrorType, RetryStrategy, TemplateInputs
} from './types.js';

// Check Node.js version requirement
const nodeVersion = process.versions.node;
const majorVersion = parseInt(nodeVersion.split('.')[0]!, 10);
if (majorVersion < 18) {
  console.error(`[orchestrator] ERROR: Node.js 18+ required for global fetch. Current version: ${nodeVersion}`);
  console.error('[orchestrator] Please upgrade Node.js or use a polyfill.');
  process.exit(1);
}

// Configuration from environment with defaults
const config: OrchestratorConfig = {
  port: parseInt(process.env.ORCH_PORT || '4100', 10),
  adminToken: (process.env.ORCH_ADMIN_TOKEN || '').trim().replace(/^['"]+|['"]+$/g, ''),
  apiBase: (process.env.OPENAI_API_BASE || 'http://localhost:1234/v1').replace(/\/?$/, ''),
  apiKey: process.env.OPENAI_API_KEY || '',
  model: process.env.ORCH_MODEL || 'qwen2.5-coder-1.5b',
  desktopDriverUrl: process.env.DESKTOP_DRIVER_URL || 'http://127.0.0.1:39990/computer-use',
  maxSteps: parseInt(process.env.MAX_STEPS || '8', 10),
  maxRetriesPerStep: parseInt(process.env.MAX_RETRIES_PER_STEP || '2', 10),
  maxRecursionDepth: parseInt(process.env.MAX_RECURSION_DEPTH || '2', 10),
  autodevRoot: process.env.AUTODEV_ROOT || '',
  pythonBin: process.env.PYTHON_BIN || 'python',
  maxContextChars: parseInt(process.env.MAX_CONTEXT_CHARS || '6000', 10),
  enableSummary: process.env.ENABLE_SUMMARY !== 'false',
  minSummaryIntervalMs: parseInt(process.env.MIN_SUMMARY_INTERVAL_MS || '30000', 10),
  baseBackoffMs: parseInt(process.env.BASE_BACKOFF_MS || '500', 10)
};

// Create directories
const SCREENSHOTS_DIR = path.join(process.cwd(), 'shots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const DATA_DIR = path.join(process.cwd(), 'data', 'tasks');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Global state
const tasks: Record<string, Task> = {};
const globalLearning: GlobalLearning = {
  errorPatterns: new Map(),
  successfulFixes: new Map(),
};

// Utility functions
function log(...args: any[]): void {
  console.log('[orchestrator]', ...args);
}

function sendJson(res: http.ServerResponse, code: number, obj: any): void {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function requireAdmin(req: http.IncomingMessage, res: http.ServerResponse, url?: URL): boolean {
  if (!config.adminToken) return true;
  
  const auth = String(req.headers['authorization'] || '').trim();
  const m = auth.match(/^Bearer\s+(.+)$/i);
  let token = m ? m[1]!.trim() : String(req.headers['x-admin-token'] || '').trim() || '';
  
  if (!token && url?.searchParams) {
    token = String(url.searchParams.get('token') || '').trim();
  }
  
  const ok = token === config.adminToken;
  if (!ok) sendJson(res, 401, { error: 'unauthorized' });
  return ok;
}

function notFound(res: http.ServerResponse): void {
  sendJson(res, 404, { error: 'not_found' });
}

function methodNotAllowed(res: http.ServerResponse): void {
  sendJson(res, 405, { error: 'method_not_allowed' });
}

function isSameOrigin(req: http.IncomingMessage): boolean {
  const host = req.headers.host;
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  // Allow requests without origin/referer for tools like curl
  if (!origin && !referer) {
    return true;
  }

  try {
    if (origin) {
      return new URL(origin).host === host;
    }
    if (referer) {
      // Only check referer if it's a full URL
      if (referer.startsWith('http')) {
        return new URL(referer).host === host;
      }
    }
  } catch (e) {
    return false; // Invalid URL in header
  }

  return false;
}

// Error classification with enhanced patterns
function classifyError(res: ActionResult): ErrorType {
  try {
    if (!res) return 'unknown';
    const status = res.status;
    const d = res.data || {};
    const stderr = (d.stderr || '').toString().toLowerCase();
    const errStr = (d.error || '').toString().toLowerCase();
    const stdout = (d.stdout || '').toString().toLowerCase();
    
    // Enhanced error classification
    if (typeof status === 'number' && status === 408) return 'timeout';
    if (stderr.includes('timeout') || errStr.includes('timeout')) return 'timeout';
    if (stderr.includes('permission') || errStr.includes('permission') || stderr.includes('access denied')) return 'permission';
    if (stderr.includes('network') || errStr.includes('connection') || errStr.includes('unreachable')) return 'network';
    if (stderr.includes('memory') || errStr.includes('out of memory') || stdout.includes('heap')) return 'resource';
    if (stderr.includes('syntax') || errStr.includes('parse') || errStr.includes('invalid')) return 'syntax';
    if (stderr.includes('not found') || errStr.includes('missing') || errStr.includes('does not exist')) return 'missing_dependency';
    if (typeof status === 'number' && status >= 500) return 'server_error';
    if (typeof status === 'number' && status >= 400) return 'client_error';
    if (typeof d.exitCode === 'number' && d.exitCode !== 0) return 'nonzero_exit';
    if (d && d.error) return 'error_flag';
  } catch (_) {}
  return 'unknown';
}

// Get retry strategy based on error type
function getRetryStrategy(errorType: ErrorType): RetryStrategy {
  const t = String(errorType || '').toLowerCase();
  if (!t) return 'debug_approach';
  if (t.includes('timeout')) return 'wait_longer';
  if (t.includes('permission')) return 'escalate_privileges';
  if (t.includes('network')) return 'retry_connection';
  if (t.includes('resource')) return 'reduce_load';
  if (t.includes('syntax')) return 'fix_syntax';
  if (t.includes('missing_dependency')) return 'install_dependency';
  return 'debug_approach';
}

// Check if result indicates an error
function isErrorResult(res: ActionResult): boolean {
  try {
    if (!res) return true;
    if (typeof res.status === 'number' && res.status >= 400) return true;
    const d = res.data || {};
    if (d && (d.error || d.ok === false)) return true;
    if (typeof d.exitCode === 'number' && d.exitCode !== 0) return true;
  } catch (_) {}
  return false;
}

// Check progress between retry attempts
function checkProgress(prevRes: ActionResult, currRes: ActionResult): boolean {
  try {
    if (!prevRes || !currRes) return true; // First attempt or missing data
    
    const prev = prevRes.data || {};
    const curr = currRes.data || {};
    
    // Status improvement
    if (prevRes.status > currRes.status) return true;
    
    // Exit code improvement
    if (prev.exitCode > 0 && curr.exitCode === 0) return true;
    if (prev.exitCode > curr.exitCode && curr.exitCode >= 0) return true;
    
    // Error presence changes
    if (prev.error && !curr.error) return true;
    if (prev.ok === false && curr.ok === true) return true;
    
    // Output changes (different error messages may indicate progress)
    const prevOutput = String(prev.stderr || prev.error || '').toLowerCase();
    const currOutput = String(curr.stderr || curr.error || '').toLowerCase();
    if (prevOutput !== currOutput && prevOutput.length > 0) return true;
    
    return false;
  } catch (_) {
    return true; // Assume progress if we can't compare
  }
}

// Task directory helpers
function taskDir(taskId: string): string {
  const dir = path.join(DATA_DIR, taskId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function appendJsonl(filePath: string, obj: any): void {
  try {
    fs.appendFileSync(filePath, JSON.stringify(obj) + '\n');
  } catch (_) {}
}

function writeJson(filePath: string, obj: any): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
  } catch (_) {}
}

function safeSlice(str: string, max: number): string {
  if (!str) return '';
  const s = String(str);
  return s.length > max ? s.slice(0, max - 3) + '...' : s;
}

// Screenshot saving
function saveScreenshot(taskId: string, stepNum: number, base64Data: string): string | null {
  try {
    const filename = `${taskId}-step${stepNum}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filepath, buffer);
    return filename;
  } catch (err) {
    log('Failed to save screenshot:', (err as Error).message);
    return null;
  }
}

// JSON parsing helper
function readJson(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// Action parsing with enhanced error handling
function tryParseAction(text: string): PlannedAction | null {
  if (!text) return null;
  // Allow fenced JSON
  const fence = text.match(/```(?:json)?\n([\s\S]*?)\n```/);
  const candidate = fence ? fence[1] : text;
  try {
    return JSON.parse(candidate!) as PlannedAction;
  } catch (_) {
    // naive repair: find first '{' and last '}'
    const i = candidate!.indexOf('{');
    const j = candidate!.lastIndexOf('}');
    if (i !== -1 && j !== -1 && j > i) {
      try {
        return JSON.parse(candidate!.slice(i, j + 1)) as PlannedAction;
      } catch (e2) {
        return null;
      }
    }
    return null;
  }
}

// LLM interaction with type safety
async function callLLM(contextStr: string): Promise<PlannedAction> {
  const system = [
    'You are a meticulous desktop automation planner with MANDATORY testing requirements.',
    'You must plan one atomic tool action at a time.',
    'Available tools: screenshot, move_mouse, click_mouse, scroll, type_text, key_press, open_app, run_powershell, autodev_run, verify_result, spawn_subtask, spawn_template, done.',
    'Output ONLY strict JSON matching this schema:',
    '{"thought":"brief reasoning","action":"screenshot|move_mouse|click_mouse|scroll|type_text|key_press|open_app|run_powershell|autodev_run|verify_result|spawn_subtask|spawn_template|done","params":{}}',
    'autodev_run: runs Auto Dev with config object containing prompt, project_dir, endpoints, models. Use for development tasks.',
    'verify_result: verify expectation via check_method (file_exists|api_call|test|extension_command|vscode_test); returns ok boolean.',
    'CRITICAL: You MUST verify functionality works before marking done. Use verify_result extensively.',
    'For VS Code extensions: test compilation, installation, command execution, and UI functionality.',
    'You will receive a Context: section with pinned notes, errors, recent results, and artifacts; use it faithfully.',
    'When action is "done", include a final summary in params.result ONLY after thorough verification.'
  ].join(' ');

  const user = `${contextStr}\nReturn ONLY JSON.`;

  const url = `${config.apiBase}/chat/completions`;
  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
  };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`LLM error ${resp.status}: ${text}`);
  }
  const json = await resp.json() as LLMResponse;
  const content = json?.choices?.[0]?.message?.content || '';
  const action = tryParseAction(content);
  if (!action || !action.action) {
    throw new Error('LLM returned unparseable action');
  }
  return action;
}

// Template resolution with type safety
function resolveTemplateGoal(template: string, inputs: TemplateInputs = {}): string {
  const t = String(template || '').toLowerCase();
  if (t === 'build_test_fix' || t === 'build→test→fix' || t === 'build-test-fix') {
    const buildInputs = inputs as any;
    const proj = buildInputs.project_dir || process.cwd();
    const testCmd = buildInputs.test_command || 'npm test || pytest || dotnet test';
    return `Template BUILD→TEST→FIX: In project ${proj}, attempt to build, run tests, and iteratively fix failures until tests pass. Use appropriate tooling for the stack. Prefer small, safe changes. Run: ${testCmd}.`;
  }
  if (t === 'vscode_extension_test' || t === 'extension_test' || t === 'vscode_test') {
    const vscodeInputs = inputs as any;
    const extensionPath = vscodeInputs.extension_path || 'C:\\zion\\wwwroot\\projects\\orchestrator\\orchestrator\\projects\\vscode_to_llm';
    const commands = vscodeInputs.commands || ['lmstudio.openChat', 'lmstudio.createTask'];
    return `Template VSCODE_EXTENSION_TEST: For VS Code extension at ${extensionPath}: 1) Verify compilation works (verify_result vscode_test compile), 2) Test each command: ${commands.join(', ')} using verify_result vscode_test command, 3) Fix any errors found, 4) Repeat until all tests pass. Do NOT mark done until ALL verification steps pass.`;
  }
  if (t === 'validate_and_fix' || t === 'validate_fix') {
    const validateInputs = inputs as any;
    const target = validateInputs.target || 'project';
    return `Template VALIDATE_AND_FIX: For ${target}: 1) Run comprehensive validation using verify_result extensively, 2) Document all failures found, 3) Fix each failure systematically, 4) Re-verify after each fix, 5) Only mark done when ALL validations pass. Be thorough - test everything.`;
  }
  // Fallback: echo intent
  const fallback = (inputs as any).goal || '';
  return fallback ? fallback : `Apply template ${template} with inputs ${JSON.stringify(inputs).slice(0,200)}`;
}

// Desktop driver interaction with graceful error handling
async function callDesktop(action: string, params?: any): Promise<DesktopDriverResponse> {
  // Handle PowerShell directly (no desktop driver needed)
  if (action === 'run_powershell') {
    const script = String(params?.script || '').trim();
    if (!script) return { status: 400, data: { error: 'missing_script' } };
    const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true });
    let stdout = '', stderr = '';
    ps.stdout.on('data', (d) => (stdout += d.toString()));
    ps.stderr.on('data', (d) => (stderr += d.toString()));
    const exitCode = await new Promise<number>((resolve) => ps.on('close', resolve));
    return { status: 200, data: { ok: exitCode === 0, exitCode, stdout, stderr } };
  }

  // Handle verification actions
  if (action === 'verify_result') {
    const method = String(params?.check_method || '').toLowerCase();
    const expectation = String(params?.expectation || '').trim();
    try {
      if (method === 'file_exists') {
        const p = String(params?.path || '').trim();
        if (!p) return { status: 400, data: { error: 'missing_path' } };
        const exists = fs.existsSync(p);
        return { status: 200, data: { ok: exists, method: 'file_exists', path: p } };
      }
      if (method === 'vscode_test') {
        const extensionPath = String(params?.extension_path || 'C:\\zion\\wwwroot\\projects\\orchestrator\\orchestrator\\projects\\vscode_to_llm').trim();
        const testType = String(params?.test_type || 'compile').trim();
        const command = String(params?.command || '').trim();
        
        let script = '';
        if (testType === 'compile') {
          script = `
            cd "${extensionPath}"
            npm run compile
            if ($LASTEXITCODE -eq 0) { Write-Host "COMPILE_SUCCESS" } else { Write-Host "COMPILE_FAILED"; exit 1 }
          `;
        } else if (testType === 'command' && command) {
          script = `
            cd "${extensionPath}"
            code --extensionDevelopmentPath=. --command="${command}"
            Start-Sleep -Seconds 2
            Write-Host "COMMAND_EXECUTED"
          `;
        }
        
        if (!script) return { status: 400, data: { error: 'invalid_test_type_or_missing_command' } };
        
        const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true });
        let stdout = '', stderr = '';
        ps.stdout.on('data', (d) => (stdout += d.toString()));
        ps.stderr.on('data', (d) => (stderr += d.toString()));
        const exitCode = await new Promise<number>((resolve) => ps.on('close', resolve));
        const containsOk = expectation ? stdout.includes(expectation) : (stdout.includes('SUCCESS') || stdout.includes('EXECUTED'));
        const ok = exitCode === 0 && containsOk;
        return { status: 200, data: { ok, method: 'vscode_test', test_type: testType, command: command || undefined, exitCode, containsOk, expectation: expectation || undefined, stdout: stdout.slice(-800), stderr: stderr.slice(-400) } };
      }
    } catch (e) {
      return { status: 500, data: { error: `verify_result failed: ${(e as Error).message}` } };
    }
  }

  // For other actions, try the desktop driver
  const body = JSON.stringify({ action, ...(params || {}) });
  try {
    const resp = await fetch(config.desktopDriverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch (_) { json = { raw: text }; }
    return { status: resp.status, data: json };
  } catch (e) {
    // Gracefully handle missing/unreachable desktop driver so the retry loop can react
    return { status: 503, data: { error: 'desktop_driver_unreachable', message: String((e as Error)?.message || e) } };
  }
}

// Create the HTTP server with all endpoints
function createServer(): http.Server {
  const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      return res.end();
    }

    const url = new URL(req.url!, `http://${req.headers.host}`);
    
    // Health check
    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, {
        ok: true,
        ORCH_PORT: config.port,
        ORCH_MODEL: config.model,
        OPENAI_API_BASE: config.apiBase,
        DESKTOP_DRIVER_URL: config.desktopDriverUrl,
        adminProtected: !!config.adminToken,
        cwd: process.cwd(),
        appFile: import.meta.url,
      });
    }

    // Get all tasks
    if (req.method === 'GET' && url.pathname === '/tasks') {
      const taskList = Object.values(tasks).map(task => ({
        id: task.id,
        goal: task.goal,
        status: task.status,
        createdAt: task.createdAt,
        steps: task.steps.length,
        hasScreenshots: task.steps.some(step => step.screenshot),
      })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return sendJson(res, 200, taskList);
    }

    // Create new task
    if (req.method === 'POST' && url.pathname === '/tasks') {
      if (!isSameOrigin(req)) {
        return sendJson(res, 403, { error: 'forbidden: cross-origin request' });
      }
      try {
        const body = await readJson(req);
        const goal = String(body.goal || '').trim();
        if (!goal) return sendJson(res, 400, { error: 'missing_goal' });
        
        const id = randomUUID();
        const task: Task = {
          id, 
          goal, 
          status: 'queued', 
          createdAt: new Date().toISOString(),
          history: [{ role: 'user', content: goal }], 
          steps: [],
        };
        tasks[id] = task;
        
        // Create data dir immediately and start task
        taskDir(id);
        setTimeout(() => runTaskLoop(task), 0);
        return sendJson(res, 202, { id, status: task.status });
      } catch (e) {
        return sendJson(res, 500, { error: String((e as Error)?.message || e) });
      }
    }

    // Simple viewer page
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/viewer')) {
      try {
        const htmlPath = path.join(process.cwd(), 'viewer.html');
        if (!fs.existsSync(htmlPath)) {
          res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
          return res.end('viewer.html not found');
        }
        const data = fs.readFileSync(htmlPath);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': data.length, 'Access-Control-Allow-Origin': '*' });
        return res.end(data);
      } catch (e) {
        return sendJson(res, 500, { error: 'viewer_error', message: String((e as Error)?.message || e) });
      }
    }

    // Proxy LM Studio chat/completions to avoid CORS issues in the viewer
    if (req.method === 'POST' && url.pathname === '/proxy/chat') {
      if (!isSameOrigin(req)) {
        return sendJson(res, 403, { error: 'forbidden: cross-origin request' });
      }
      if (!requireAdmin(req, res, url)) return;
      try {
        const body = await readJson(req);
        const forwardUrl = `${config.apiBase}/chat/completions`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
        const resp = await fetch(forwardUrl, { method: 'POST', headers, body: JSON.stringify(body) });
        const text = await resp.text();
        res.writeHead(resp.status, { 'Content-Type': 'application/json', 'Access-control-allow-origin': '*' });
        return res.end(text);
      } catch (e) {
        return sendJson(res, 500, { error: 'proxy_error', message: String((e as Error)?.message || e) });
      }
    }

    // Task streaming via Server-Sent Events: /tasks/:id/stream
    if (req.method === 'GET' && url.pathname.startsWith('/tasks/') && url.pathname.endsWith('/stream')) {
      const parts = url.pathname.split('/');
      const id = (parts[2] ?? '') as string;
      if (!id) return notFound(res);
      const task = tasks[id!];
      if (!task) return notFound(res);

      // Prepare SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      const dir = taskDir(id);
      const logsPath = path.join(dir, 'messages.jsonl');

      // Helper to emit events
      const sendEvent = (event: string, data: any) => {
        try {
          res.write(`event: ${event}\n`);
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (_) {}
      };

      // Initial event with basic task info
      sendEvent('meta', { id: task.id, goal: task.goal, status: task.status, steps: task.steps.length });

      // Tail the log file by polling file size
      let lastSize = 0;
      try {
        if (fs.existsSync(logsPath)) {
          lastSize = fs.statSync(logsPath).size;
          // Send last few lines on connect
          const content = fs.readFileSync(logsPath, 'utf8');
          const lines = content.trim().split('\n');
          const tail = lines.slice(-20);
          for (const line of tail) {
            let parsed: any;
            try { parsed = JSON.parse(line); } catch { parsed = { raw: line }; }
            sendEvent('log', parsed);
          }
        }
      } catch (_) {}

      const interval = setInterval(() => {
        try {
          if (!fs.existsSync(logsPath)) { res.write(': ping\n\n'); return; }
          const size = fs.statSync(logsPath).size;
          if (size > lastSize) {
            const buf = fs.readFileSync(logsPath, 'utf8');
            const chunk = buf.slice(lastSize);
            lastSize = size;
            const newLines = chunk.split('\n').filter(l => l.trim());
            for (const line of newLines) {
              let parsed: any;
              try { parsed = JSON.parse(line); } catch { parsed = { raw: line }; }
              sendEvent('log', parsed);
            }
          } else {
            // heartbeat to keep connection alive
            res.write(': ping\n\n');
          }
        } catch (_) {}
      }, 1000);

      // Cleanup on client disconnect
      req.on('close', () => {
        clearInterval(interval);
        try { res.end(); } catch (_) {}
      });
      return; // stop route handling here
    }

    // Get specific task
    if (req.method === 'GET' && url.pathname.startsWith('/tasks/')) {
      const [, , id] = url.pathname.split('/');
      const task = tasks[id!];
      if (!task) return notFound(res);
      return sendJson(res, 200, task);
    }

    methodNotAllowed(res);
  });

  return server;
}

// Main task execution loop with recursive testing
async function runTaskLoop(task: Task, depth: number = 0): Promise<void> {
  task.status = 'running';
  task.depth = depth;
  
  // Persist task metadata
  try {
    const dir = taskDir(task.id);
    writeJson(path.join(dir, 'meta.json'), { id: task.id, goal: task.goal, createdAt: task.createdAt });
    appendJsonl(path.join(dir, 'messages.jsonl'), { ts: Date.now(), role: 'user', content: task.goal });
  } catch (_) {}

  for (let i = 0; i < config.maxSteps; i++) {
    try {
      const contextStr = `Context: Task goal: ${task.goal}`;
      let action = await callLLM(contextStr);
      const step: TaskStep = { i: i + 1, planned: action, attempts: [], context: { learned_issues: [], attempted_fixes: [] } };
      task.steps.push(step);
      appendJsonl(path.join(taskDir(task.id), 'messages.jsonl'), { ts: Date.now(), role: 'planner', content: action });
      
      if (action.action === 'done') {
        // Enforce success gating: require at least one successful verify_result before allowing done
        const hasVerifyPass = task.steps.some(s => s?.planned?.action === 'verify_result' && s?.result && (s.result.ok === true));
        if (!hasVerifyPass) {
          const msg = 'REJECT_DONE: Cannot mark done without at least one successful verify_result. Add verification steps.';
          task.history.push({ role: 'system', content: `ERROR: ${msg}` });
          appendJsonl(path.join(taskDir(task.id), 'messages.jsonl'), { ts: Date.now(), role: 'system', content: `ERROR: ${msg}` });
          // Persist snapshot and continue loop to let the planner add verification
          writeJson(path.join(taskDir(task.id), 'steps.json'), task.steps);
          continue;
        }
        task.status = 'done';
        task.history.push({ role: 'assistant', content: `DONE: ${action?.params?.result || ''}` });
        appendJsonl(path.join(taskDir(task.id), 'messages.jsonl'), { ts: Date.now(), role: 'assistant', content: `DONE: ${action?.params?.result || ''}` });
        break;
      }

      // Execute the action with retry logic
      let attempt = 0;
      while (attempt <= config.maxRetriesPerStep) {
        const res = await callDesktop(action.action, action.params);
        const attemptInfo: AttemptInfo = { n: attempt + 1, action, result: res };
        step.attempts.push(attemptInfo);
        
        // Update step aggregates
        step.result = res.data;
        writeJson(path.join(taskDir(task.id), 'steps.json'), task.steps);

        const errorLike = isErrorResult(res);
        const hasProgress = attempt === 0 || checkProgress(step.attempts[attempt - 1]!.result, res);
        
        if (!errorLike || attempt === config.maxRetriesPerStep || (!hasProgress && attempt > 0)) {
          if (!hasProgress && attempt > 0 && errorLike) {
            step.context.learned_issues.push('no_progress_detected');
          }
          break; // success, retries exhausted, or no progress made
        }

        const errType = classifyError(res);
        if (errType && !step.context.learned_issues.includes(errType)) {
          step.context.learned_issues.push(errType);
        }
        
        const backoff = config.baseBackoffMs * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, backoff));
        attempt += 1;
      }
    } catch (e) {
      task.status = 'error';
      task.error = String((e as Error)?.message || e);
      task.history.push({ role: 'system', content: `ERROR: ${task.error}` });
      appendJsonl(path.join(taskDir(task.id), 'messages.jsonl'), { ts: Date.now(), role: 'system', content: `ERROR: ${task.error}` });
      break;
    }
  }
  if (task.status === 'running') task.status = 'stopped';
}

// Start the server
const server = createServer();
server.listen(config.port, '0.0.0.0', () => {
  log(`listening on http://0.0.0.0:${config.port}`);
  log(`MODEL=${config.model} API_BASE=${config.apiBase}`);
  log(`DESKTOP_DRIVER_URL=${config.desktopDriverUrl}`);
});

export { config, tasks, globalLearning, log };
