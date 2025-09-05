import * as vscode from 'vscode';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'lmstudio.chatView';

    private _view?: vscode.WebviewView;
    private _messages: ChatMessage[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;
        const webview = webviewView.webview;
        webview.options = { enableScripts: true };
        webview.html = this._getHtml();

        webview.onDidReceiveMessage(async (msg) => {
            if (msg?.type === 'send' && typeof msg.text === 'string') {
                await this.handleUserMessage(msg.text);
            } else if (msg?.type === 'clear') {
                this._messages = [];
                this.postState();
            }
        });

        // Initialize view state
        this.postState();
    }

    private postState() {
        this._view?.webview.postMessage({ type: 'state', messages: this._messages });
    }

    private postUpdate(content: string) {
        this._view?.webview.postMessage({ type: 'update', content });
    }

    public async handleUserMessage(text: string) {
        const trimmed = text.trim();
        if (!trimmed) return;

        // Push user message
        this._messages.push({ role: 'user', content: trimmed });
        this.postState();

        // Call LM Studio
        try {
            const config = vscode.workspace.getConfiguration('lmstudio');
            const apiBase = config.get<string>('apiUrl', 'http://localhost:1234/v1');
            const model = config.get<string>('modelName', 'lmstudio-local');
            const system = config.get<string>('systemPrompt', 'You are a helpful coding assistant inside VS Code. Be concise and provide actionable answers.');

            // Build messages with system + history + user
            const history: ChatMessage[] = [];
            if (system) history.push({ role: 'system', content: system });
            // include last ~10 messages for context
            const tail = this._messages.slice(-10);
            history.push(...tail);

            // Create a placeholder assistant message for streaming updates
            this._messages.push({ role: 'assistant', content: '' });
            this.postState();

            const resp = await fetch(`${apiBase}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    messages: history,
                    temperature: 0.2,
                    stream: true
                })
            });

            if (!resp.ok) {
                const t = await resp.text();
                throw new Error(`HTTP ${resp.status} ${resp.statusText}: ${t}`);
            }

            // Read server-sent event stream and update last assistant message
            const reader = (resp.body as any)?.getReader?.();
            if (reader) {
                const decoder = new TextDecoder();
                let acc = '';
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    acc += chunk;
                    const lines = acc.split(/\r?\n/);
                    acc = lines.pop() ?? '';
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith('data:')) continue;
                        const payload = trimmed.substring(5).trim();
                        if (payload === '[DONE]') { acc = ''; continue; }
                        try {
                            const obj = JSON.parse(payload);
                            const delta = obj?.choices?.[0]?.delta?.content
                                ?? obj?.choices?.[0]?.message?.content
                                ?? '';
                            if (delta) {
                                const last = this._messages[this._messages.length - 1];
                                if (last && last.role === 'assistant') {
                                    last.content += delta;
                                    this.postUpdate(last.content);
                                }
                            }
                        } catch {}
                    }
                }
            } else {
                // Fallback: non-streaming JSON
                const data: any = await resp.json();
                const assistant = data?.choices?.[0]?.message?.content ?? '(no response)';
                const last = this._messages[this._messages.length - 1];
                if (last && last.role === 'assistant') {
                    last.content = assistant;
                } else {
                    this._messages.push({ role: 'assistant', content: assistant });
                }
                this.postState();
            }
        } catch (err: any) {
            const msg = err?.message || String(err);
            const last = this._messages[this._messages.length - 1];
            if (last && last.role === 'assistant' && !last.content) {
                last.content = `Error contacting LM Studio: ${msg}`;
                this.postUpdate(last.content);
            } else {
                this._messages.push({ role: 'assistant', content: `Error contacting LM Studio: ${msg}` });
                this.postState();
            }
        }
    }

    private _getHtml() {
        const csp = `default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';`;
        return /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LM Studio Chat</title>
  <style>
    body { font-family: var(--vscode-font-family); padding: 0; margin: 0; }
    .wrap { display: flex; flex-direction: column; height: 100vh; }
    .msgs { flex: 1; overflow: auto; padding: 8px; background: var(--vscode-editor-background); }
    .msg { border-radius: 6px; padding: 8px 10px; margin: 6px 0; white-space: pre-wrap; }
    .user { background: var(--vscode-editorInlayHint-background); color: var(--vscode-editor-foreground); }
    .assistant { background: var(--vscode-editorHoverWidget-background); }
    .input { display: flex; border-top: 1px solid var(--vscode-panel-border); }
    textarea { flex: 1; resize: none; padding: 8px; border: 0; outline: none; background: var(--vscode-input-background); color: var(--vscode-input-foreground); }
    button { margin: 8px; }
    .toolbar { display: flex; gap: 6px; align-items: center; padding: 6px; border-bottom: 1px solid var(--vscode-panel-border); }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="toolbar">
      <strong>LM Studio Chat</strong>
      <span style="flex:1"></span>
      <button id="clear">Clear</button>
    </div>
    <div id="msgs" class="msgs"></div>
    <div class="input">
      <textarea id="input" rows="2" placeholder="Ask LM Studio…"></textarea>
      <button id="send">Send</button>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const elMsgs = document.getElementById('msgs');
    const elInput = document.getElementById('input');
    const elSend = document.getElementById('send');
    const elClear = document.getElementById('clear');
    let messages = [];

    function render() {
      elMsgs.innerHTML = '';
      for (const m of messages) {
        const d = document.createElement('div');
        d.className = 'msg ' + (m.role === 'user' ? 'user' : 'assistant');
        d.textContent = (m.role === 'user' ? 'You: ' : 'Assistant: ') + m.content;
        elMsgs.appendChild(d);
      }
      elMsgs.scrollTop = elMsgs.scrollHeight;
    }

    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg?.type === 'state') {
        messages = msg.messages || [];
        render();
      } else if (msg?.type === 'update') {
        if (messages.length > 0) {
            messages[messages.length - 1].content = msg.content;
            render();
        }
      }
    });

    function send() {
      const text = elInput.value || '';
      if (!text.trim()) return;
      vscode.postMessage({ type: 'send', text });
      elInput.value = '';
      elInput.focus();
    }

    elSend.addEventListener('click', send);
    elInput.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { send(); }
    });
    elClear.addEventListener('click', () => vscode.postMessage({ type: 'clear' }));
  </script>
  </body>
  </html>
        `;
    }
}
