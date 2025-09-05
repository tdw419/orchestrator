// Minimal orchestrator: ws_send via Node ws, actions + admin/runps
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver'; // Import archiver

const ORCH_PORT = parseInt(process.env.ORCH_PORT || '4100', 10);
const ORCH_ADMIN_TOKEN = (process.env.ORCH_ADMIN_TOKEN || '').trim();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Data persistence setup
const DATA_DIR = path.join(process.cwd(), 'orchestrator_logs');
const SCREENSHOTS_DIR = path.join(DATA_DIR, 'screenshots');

// Ensure directories exist
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

/** @type {Record<string, any>} */
const tasks = {};
const log = (...a) => console.log('[orchestrator]', ...a);

// Load existing tasks from disk on startup
function loadTasksFromDisk() {
  if (!fs.existsSync(DATA_DIR)) return;
  
  const taskDirs = fs.readdirSync(DATA_DIR).filter(name => 
    fs.statSync(path.join(DATA_DIR, name)).isDirectory() && name !== 'screenshots'
  );
  
  for (const taskId of taskDirs) {
    const taskMetaPath = path.join(DATA_DIR, taskId, 'task.json');
    const stepsPath = path.join(DATA_DIR, taskId, 'steps.jsonl');
    
    const taskMeta = readJson(taskMetaPath);
    if (taskMeta) {
      const steps = readJsonl(stepsPath);
      tasks[taskId] = {
        ...taskMeta,
        steps,
        history: [] // Keep history in memory only for now
      };
      log(`Loaded task ${taskId} with ${steps.length} steps`);
    }
  }
}

// Load tasks on startup
loadTasksFromDisk();

// Basic task retention - clean up old task directories (older than 7 days)
function cleanupOldTasks() {
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
  const now = Date.now();
  
  if (!fs.existsSync(DATA_DIR)) return;
  
  const taskDirs = fs.readdirSync(DATA_DIR).filter(name => 
    fs.statSync(path.join(DATA_DIR, name)).isDirectory() && name !== 'screenshots'
  );
  
  for (const taskId of taskDirs) {
    const taskDir = path.join(DATA_DIR, taskId);
    const stat = fs.statSync(taskDir);
    
    if (now - stat.mtime.getTime() > maxAge) {
      log(`Cleaning up old task directory: ${taskId}`);
      fs.rmSync(taskDir, { recursive: true, force: true });
      delete tasks[taskId]; // Remove from memory too
    }
  }
}

// Run cleanup every 6 hours
setInterval(cleanupOldTasks, 6 * 60 * 60 * 1000);
// Run initial cleanup after 5 minutes
setTimeout(cleanupOldTasks, 5 * 60 * 1000);

// File operation helpers
function taskDir(taskId) {
  const dir = path.join(DATA_DIR, taskId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function appendJsonl(filePath, data) {
  const line = JSON.stringify(data) + '\n';
  fs.appendFileSync(filePath, line, 'utf8');
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return [];
  return content.split('\n').map(line => JSON.parse(line));
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const readJsonReq = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', c => data += c);
  req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
  req.on('error', reject);
});

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

function requireAdmin(req, res) {
  if (!ORCH_ADMIN_TOKEN) return true;
  const m = String(req.headers['authorization'] || '').match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1] : '';
  if (token !== ORCH_ADMIN_TOKEN) { sendJson(res, 401, { error: 'unauthorized' }); return false; }
  return true;
}

async function wsSend(url, message, timeoutMs = 8000) {
  return await new Promise((resolve) => {
    const ws = new WebSocket(url);
    let done = false;
    const finish = (val) => { if (!done) { done = true; try { ws.close(); } catch {} resolve(val); } };
    const timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), timeoutMs);
    ws.on('open', () => { try { ws.send(message); } catch (e) { clearTimeout(timer); finish({ ok: false, error: String(e?.message || e) }); } });
    ws.on('message', (data) => { clearTimeout(timer); finish({ ok: true, response: data.toString() }); });
    ws.on('error', (err) => { clearTimeout(timer); finish({ ok: false, error: String(err?.message || err) }); });
    ws.on('close', () => finish({ ok: false, error: 'closed' }));
  });
}

async function callDesktop(action, params) {
  if (action === 'run_powershell') {
    const script = String(params?.script || '').trim();
    if (!script) return { status: 400, data: { error: 'missing_script' } };
    const ps = spawn('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-Command', script], { windowsHide: true });
    let stdout='', stderr='';
    ps.stdout.on('data', d => stdout += d.toString());
    ps.stderr.on('data', d => stderr += d.toString());
    const exitCode = await new Promise(r => ps.on('close', r));
    return { status: 200, data: { ok: exitCode === 0, exitCode, stdout, stderr } };
  }
  if (action === 'ws_send') {
    const url = String(params?.url || 'ws://127.0.0.1:7878').trim();
    const message = String(params?.message || '').trim();
    if (!message) return { status: 400, data: { error: 'missing_message' } };
    const res = await wsSend(url, message, params?.timeout_ms || 8000);
    return { status: 200, data: res };
  }
  return { status: 400, data: { error: 'unknown_action' } };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    log(`Received request: ${req.method} ${url.pathname}`); // Debug log

    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' });
      return res.end();
    }
    
    // Admin routes
    if (url.pathname.startsWith('/admin/')) {
      if (!requireAdmin(req, res)) return;

      if (req.method === 'POST') {
        switch (url.pathname) {
          case '/admin/run_llm_pipeline_smoke_test':
            const scriptPath = path.join(__dirname, '..', 'scripts', 'llm-pipeline-test.ps1');
            const result = await callDesktop('run_powershell', { script: `& '${scriptPath}'` });
            const stdout = String(result?.data?.stdout || '');
            const stderr = String(result?.data?.stderr || '');
            // Detect server used (prefer echo if fallback is mentioned)
            let server_detected = 'unknown';
            if (/Falling back.*echo/i.test(stdout) || /echo server/i.test(stdout) || /7879/.test(stdout)) server_detected = 'echo';
            else if (/Bevy server/i.test(stdout) || /7878/.test(stdout)) server_detected = 'bevy';
            const ws_send_total = (stdout.match(/Added ws_send action/gi) || []).length;
            const ws_send_fail = (stdout.match(/"ok":\s*false/gi) || []).length;
            const ok = !!result?.data?.ok && ws_send_fail === 0 && /Script finished\./.test(stdout);
            const summary = ok ? 'LLM pipeline smoke test passed' : 'LLM pipeline smoke test failed';
            return sendJson(res, ok ? 200 : 500, {
              ok,
              summary,
              server_detected,
              ws_send_total,
              ws_send_fail,
              stdout_tail: stdout.slice(-600),
              stderr_tail: stderr.slice(-300)
            });

          case '/admin/runps':
            const body = await readJsonReq(req);
            const runpsResult = await callDesktop('run_powershell', { script: body?.script });
            return sendJson(res, runpsResult.status, runpsResult.data);

          default:
            return sendJson(res, 404, { error: 'not_found' });
        }
      } else {
        return sendJson(res, 405, { error: 'method_not_allowed' });
      }
    }

    // Health route
    if (req.method === 'GET' && url.pathname === '/health') {
      // Quick probes with short timeouts
      const [bevy, echo] = await Promise.all([
        wsSend('ws://127.0.0.1:7878', 'ping', 400).catch(() => ({ ok: false })),
        wsSend('ws://127.0.0.1:7879', 'ping', 400).catch(() => ({ ok: false })),
      ]);
      const ok = true; // server is up if we got here
      return sendJson(res, 200, { ok, bevy_ws: { reachable: !!bevy.ok }, echo_ws: { reachable: !!echo.ok } });
    }

    // Task routes
    if (url.pathname.startsWith('/tasks')) {
      if (req.method === 'GET') {
        if (url.pathname === '/tasks') {
          const list = Object.values(tasks).map(t => ({ id: t.id, goal: t.goal, status: t.status, createdAt: t.createdAt, steps: t.steps.length }));
          return sendJson(res, 200, list);
        } else if (url.pathname.endsWith('/download')) { // GET /tasks/:id/download
          const id = url.pathname.split('/')[2];
          const task = tasks[id];
          if (!task) return sendJson(res, 404, { error: 'not_found' });

          const taskDirPath = taskDir(id);
          const archiveName = `task-${id.substring(0, 8)}.zip`;

          res.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${archiveName}"`,
          });

          const archive = archiver('zip', { zlib: { level: 9 } });
          archive.pipe(res);

          // Append task.json
          const taskMetaPath = path.join(taskDirPath, 'task.json');
          if (fs.existsSync(taskMetaPath)) {
            archive.file(taskMetaPath, { name: 'task.json' });
          }

          // Append steps.jsonl
          const stepsPath = path.join(taskDirPath, 'steps.jsonl');
          if (fs.existsSync(stepsPath)) {
            archive.file(stepsPath, { name: 'steps.jsonl' });
          }

          // Finalize the archive
          archive.finalize();

          return; // End response here

        } else { // GET /tasks/:id
          const id = url.pathname.split('/')[2];
          const task = tasks[id];
          if (!task) return sendJson(res, 404, { error: 'not_found' });
          return sendJson(res, 200, task);
        }
      } else if (req.method === 'POST') {
        if (url.pathname === '/tasks') {
          const body = await readJsonReq(req);
          const goal = String(body?.goal || '').trim();
          if (!goal) return sendJson(res, 400, { error: 'missing_goal' });
          const id = randomUUID();
          const task = { id, goal, status: 'running', createdAt: new Date().toISOString(), steps: [], history: [] };
          tasks[id] = task;
          
          // Save task metadata to disk
          const tDir = taskDir(id);
          const taskMetaPath = path.join(tDir, 'task.json');
          writeJson(taskMetaPath, { id, goal, status: task.status, createdAt: task.createdAt });
          log(`Created task ${id} and saved metadata to ${taskMetaPath}`);
          
          return sendJson(res, 202, { id, status: 'running' });
        } else if (url.pathname.endsWith('/actions')) { // POST /tasks/:id/actions
          const id = url.pathname.split('/')[2];
          const task = tasks[id];
          if (!task) return sendJson(res, 404, { error: 'not_found' });
          const body = await readJsonReq(req);
          const action = String(body?.action || '').trim();
          if (!action) return sendJson(res, 400, { error: 'missing_action' });
          let params = body?.params || {};
          if (action === 'ws_send') {
            const cmd = body?.command;
            if (cmd && !params.message) { try { params.message = JSON.stringify(cmd); } catch { return sendJson(res, 400, { error: 'invalid_command' }); } }
            params.url = String(body?.url || params.url || 'ws://127.0.0.1:7878');
          }
          const result = await callDesktop(action, params);
          const step = { 
            i: task.steps.length + 1, 
            timestamp: new Date().toISOString(),
            planned: { action, params }, 
            result: result.data 
          };
          task.steps.push(step);
          
          // Save step to disk
          const tDir = taskDir(id);
          const stepsPath = path.join(tDir, 'steps.jsonl');
          appendJsonl(stepsPath, step);
          log(`Saved step ${step.i} for task ${id} to ${stepsPath}`);
          
          return sendJson(res, result.status || 200, result);
        }
      }
    }

    return sendJson(res, 404, { error: 'not_found' }); // Catch-all for unmatched paths
  } catch (e) {
    return sendJson(res, 500, { error: String(e?.message || e) });
  }
});

server.listen(ORCH_PORT, '0.0.0.0', () => log(`listening on http://0.0.0.0:${ORCH_PORT}`));
