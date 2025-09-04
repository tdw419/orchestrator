// Minimal Windows-native orchestrator (no external deps)
// - Talks to an OpenAI-compatible API (OpenAI/Anthropic via proxy/LM Studio)
// - Calls a desktop driver HTTP endpoint (mock or Windows runner)
// - Simple in-memory task store and step loop

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const ORCH_PORT = parseInt(process.env.ORCH_PORT || '4100', 10);
const OPENAI_API_BASE = (process.env.OPENAI_API_BASE || 'http://localhost:4000').replace(/\/?$/,'');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ORCH_MODEL = process.env.ORCH_MODEL || 'lmstudio-local';
const DESKTOP_DRIVER_URL = process.env.DESKTOP_DRIVER_URL || 'http://127.0.0.1:39990/computer-use';
const MAX_STEPS = parseInt(process.env.MAX_STEPS || '8', 10);

// Screenshots directory
const SCREENSHOTS_DIR = path.join(process.cwd(), 'shots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

/** @type {Record<string, any>} */
const tasks = {};

function log(...args) {
  console.log('[orchestrator]', ...args);
}

function readJson(req) {
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

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function notFound(res) {
  sendJson(res, 404, { error: 'not_found' });
}

function saveScreenshot(taskId, stepNum, base64Data) {
  try {
    const filename = `${taskId}-step${stepNum}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filepath, buffer);
    return filename;
  } catch (err) {
    log('Failed to save screenshot:', err.message);
    return null;
  }
}

function methodNotAllowed(res) {
  sendJson(res, 405, { error: 'method_not_allowed' });
}

function tryParseAction(text) {
  if (!text) return null;
  // Allow fenced JSON
  const fence = text.match(/```(?:json)?\n([\s\S]*?)\n```/);
  const candidate = fence ? fence[1] : text;
  try {
    return JSON.parse(candidate);
  } catch (_) {
    // naive repair: find first '{' and last '}'
    const i = candidate.indexOf('{');
    const j = candidate.lastIndexOf('}');
    if (i !== -1 && j !== -1 && j > i) {
      try {
        return JSON.parse(candidate.slice(i, j + 1));
      } catch (e2) {
        return null;
      }
    }
    return null;
  }
}

async function callLLM(goal, history) {
  const system = [
    'You are a meticulous desktop automation planner.',
    'You must plan one atomic tool action at a time.',
    'Available tools: screenshot, move_mouse, click_mouse, scroll, type_text, key_press, open_app, run_powershell, done.',
    'Output ONLY strict JSON matching this schema:',
    '{"thought":"brief reasoning","action":"screenshot|move_mouse|click_mouse|scroll|type_text|key_press|open_app|run_powershell|done","params":{}}',
    'When action is "done", include a final summary in params.result.'
  ].join(' ');

  const context = history.map((h, idx) => `Step ${idx + 1} ${h.role.toUpperCase()}: ${h.content}`).join('\n');
  const user = `Goal: ${goal}\nContext:\n${context}\nReturn ONLY JSON.`;

  const url = `${OPENAI_API_BASE}/chat/completions`;
  const body = {
    model: ORCH_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
  };
  const headers = { 'Content-Type': 'application/json' };
  if (OPENAI_API_KEY) headers['Authorization'] = `Bearer ${OPENAI_API_KEY}`;

  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`LLM error ${resp.status}: ${text}`);
  }
  const json = await resp.json();
  const content = json?.choices?.[0]?.message?.content || '';
  const action = tryParseAction(content);
  if (!action || !action.action) {
    throw new Error('LLM returned unparseable action');
  }
  return action;
}

async function callDesktop(action, params) {
  if (action === 'run_powershell') {
    const script = String(params?.script || '').trim();
    if (!script) return { status: 400, data: { error: 'missing_script' } };
    const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true });
    let stdout = '', stderr = '';
    ps.stdout.on('data', (d) => (stdout += d.toString()));
    ps.stderr.on('data', (d) => (stderr += d.toString()));
    const exitCode = await new Promise((resolve) => ps.on('close', resolve));
    return { status: 200, data: { ok: exitCode === 0, exitCode, stdout, stderr } };
  }

  const body = JSON.stringify({ action, ...(params || {}) });
  const resp = await fetch(DESKTOP_DRIVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch (_) { json = { raw: text }; }
  return { status: resp.status, data: json };
}

async function runTaskLoop(task) {
  task.status = 'running';
  for (let i = 0; i < MAX_STEPS; i++) {
    try {
      const action = await callLLM(task.goal, task.history);
      task.steps.push({ i: i + 1, planned: action });
      if (action.action === 'done') {
        task.status = 'done';
        task.history.push({ role: 'assistant', content: `DONE: ${action?.params?.result || ''}` });
        break;
      }

      const res = await callDesktop(action.action, action.params);
      const imageData = res?.data?.image_base64 || res?.data?.image;
      const hasImage = !!imageData;
      
      let screenshotFile = null;
      if (hasImage) {
        screenshotFile = saveScreenshot(task.id, i + 1, imageData);
      }
      
      const summary = hasImage
        ? `action ${action.action} -> image_base64 length ${String(imageData.length)}${screenshotFile ? ` saved as ${screenshotFile}` : ''}`
        : `action ${action.action} -> ${JSON.stringify(res.data).slice(0, 180)}`;
      task.history.push({ role: 'system', content: `RESULT: ${summary}` });
      
      task.steps[task.steps.length - 1].result = res.data;
      if (screenshotFile) {
        task.steps[task.steps.length - 1].screenshot = screenshotFile;
      }
    } catch (e) {
      task.status = 'error';
      task.error = String(e?.message || e);
      task.history.push({ role: 'system', content: `ERROR: ${task.error}` });
      break;
    }
  }
  if (task.status === 'running') task.status = 'stopped';
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, {
      ok: true,
      ORCH_PORT, ORCH_MODEL, OPENAI_API_BASE, DESKTOP_DRIVER_URL,
    });
  }

  // Admin: run PowerShell directly (bypasses LLM)
  if (req.method === 'POST' && url.pathname === '/admin/runps') {
    try {
      const body = await readJson(req);
      const script = String(body.script || '').trim();
      if (!script) return sendJson(res, 400, { error: 'missing_script' });
      const { spawn } = await import('node:child_process');
      const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true });
      let stdout = '', stderr = '';
      ps.stdout.on('data', (d) => (stdout += d.toString()));
      ps.stderr.on('data', (d) => (stderr += d.toString()));
      ps.on('error', (e) => sendJson(res, 500, { ok: false, error: String(e?.message || e) }));
      ps.on('close', (code) => sendJson(res, 200, { ok: code === 0, exitCode: code, stdout, stderr }));
      return;
    } catch (e) {
      return sendJson(res, 500, { error: String(e?.message || e) });
    }
  }

  if (req.method === 'GET' && url.pathname === '/tasks') {
    const taskList = Object.values(tasks).map(task => ({
      id: task.id,
      goal: task.goal,
      status: task.status,
      createdAt: task.createdAt,
      steps: task.steps.length,
      hasScreenshots: task.steps.some(step => step.screenshot),
    })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sendJson(res, 200, taskList);
  }

  if (req.method === 'POST' && url.pathname === '/tasks') {
    try {
      const body = await readJson(req);
      const goal = String(body.goal || '').trim();
      if (!goal) return sendJson(res, 400, { error: 'missing_goal' });
      const id = randomUUID();
      const task = {
        id, goal, status: 'queued', createdAt: new Date().toISOString(),
        history: [{ role: 'user', content: goal }], steps: [],
      };
      tasks[id] = task;
      setTimeout(() => runTaskLoop(task), 0);
      return sendJson(res, 202, { id, status: task.status });
    } catch (e) {
      return sendJson(res, 500, { error: String(e?.message || e) });
    }
  }

  if (req.method === 'GET' && url.pathname.startsWith('/tasks/')) {
    const [, , id, tail] = url.pathname.split('/');
    const task = tasks[id];
    if (!task) return notFound(res);
    if (!tail) return sendJson(res, 200, task);
    if (tail === 'messages') return sendJson(res, 200, task.history);
    if (tail === 'files') {
      const files = task.steps
        .filter(step => step.screenshot)
        .map(step => ({ step: step.i, file: step.screenshot, url: `/shots/${step.screenshot}` }));
      return sendJson(res, 200, files);
    }
    return notFound(res);
  }

  if (req.method === 'GET' && url.pathname.startsWith('/shots/')) {
    const filename = url.pathname.slice(7); // remove '/shots/'
    const filepath = path.join(SCREENSHOTS_DIR, filename);
    try {
      if (!fs.existsSync(filepath)) return notFound(res);
      const data = fs.readFileSync(filepath);
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': data.length,
        'Access-Control-Allow-Origin': '*',
      });
      return res.end(data);
    } catch (err) {
      return sendJson(res, 500, { error: 'file_read_error' });
    }
  }

  // Serve viewer HTML via HTTP for convenience
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/viewer')) {
    try {
      const viewerPath = path.join(process.cwd(), 'windows-orchestrator', 'viewer.html');
      const html = fs.readFileSync(viewerPath);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': html.length,
        'Access-Control-Allow-Origin': '*',
      });
      return res.end(html);
    } catch (err) {
      return sendJson(res, 500, { error: 'viewer_unavailable' });
    }
  }

  methodNotAllowed(res);
});

server.listen(ORCH_PORT, '0.0.0.0', () => {
  log(`listening on http://0.0.0.0:${ORCH_PORT}`);
  log(`MODEL=${ORCH_MODEL} API_BASE=${OPENAI_API_BASE}`);
  log(`DESKTOP_DRIVER_URL=${DESKTOP_DRIVER_URL}`);
});
