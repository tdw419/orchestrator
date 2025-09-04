// Minimal mock desktop server with zero dependencies.
// POST /computer-use { action: 'screenshot' | ... }
// - Returns a fixed base64 image for screenshot
// - Echoes back { ok: true } for other actions and logs them

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT ? Number(process.env.PORT) : 39990;

const imgPath = path.join(__dirname, '..', 'static', 'bytebot-logo.png');
let imgB64 = '';
try {
  const buf = fs.readFileSync(imgPath);
  imgB64 = buf.toString('base64');
} catch (e) {
  // Fallback: 1x1 transparent PNG
  imgB64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2P8z/C/HwAFgwJ/Wv1cGQAAAABJRU5ErkJggg==';
}

const logPath = path.join(__dirname, 'mock-desktop.log');
function log(line) {
  const msg = `[${new Date().toISOString()}] ${line}\n`;
  fs.appendFile(logPath, msg, () => {});
  process.stdout.write(msg);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/computer-use') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'not found' }));
  }
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    let payload = {};
    try {
      payload = body ? JSON.parse(body) : {};
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'bad json' }));
    }

    const action = String(payload.action || '').toLowerCase();
    if (action === 'screenshot') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, image: imgB64, image_base64: imgB64 }));
    }

    log(`action=${action} payload=${JSON.stringify(payload)}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`mock-desktop listening on http://0.0.0.0:${PORT}`);
  console.log(`POST /computer-use with {"action":"screenshot"}`);
});

