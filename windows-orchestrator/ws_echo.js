import WebSocket, { WebSocketServer } from 'ws';

const PORT = parseInt(process.env.ECHO_PORT || '7879', 10);
const wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' });

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    try {
      // Echo back the same payload
      ws.send(msg.toString());
    } catch (_) {}
  });
});

console.log(`[ws-echo] listening on ws://127.0.0.1:${PORT}`);
