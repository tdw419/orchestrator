import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { OrchestratorClient } from './orchestratorClient';
import { ChatViewProvider } from './chatView';

let orchestratorClient: OrchestratorClient;
let statusBarItem: vscode.StatusBarItem;
let orchestratorProcess: ChildProcess | null = null;
let outputChannel: vscode.OutputChannel;
let extContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
    extContext = context;
    console.log('LM Studio Orchestrator extension is now active!');

    // Create output channel for logging
    outputChannel = vscode.window.createOutputChannel('LM Studio');
    context.subscriptions.push(outputChannel);

    // Initialize orchestrator client with configuration
    updateOrchestratorClient();

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'lmstudio.viewTasks';
    statusBarItem.text = '$(loading~spin) LM Studio: Checking...';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register chat view provider
    const chatProvider = new ChatViewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider)
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('lmstudio.createTask', createTask),
        vscode.commands.registerCommand('lmstudio.viewTasks', viewTasks),
        vscode.commands.registerCommand('lmstudio.startOrchestrator', startOrchestrator),
        vscode.commands.registerCommand('lmstudio.stopOrchestrator', stopOrchestrator),
        vscode.commands.registerCommand('lmstudio.openChat', async () => {
            try {
                // First show the view container in the activity bar
                await vscode.commands.executeCommand('workbench.view.extension.lmstudio');
                // Then focus the specific chat view
                await vscode.commands.executeCommand('lmstudio.chatView.focus');
                outputChannel.appendLine('Chat view opened successfully');
            } catch (err: any) {
                const msg = `Failed to open chat view: ${err?.message || String(err)}`;
                outputChannel.appendLine(msg);
                vscode.window.showErrorMessage(msg);
            }
        }),
        vscode.commands.registerCommand('lmstudio.askAboutSelection', async () => {
            await askAboutSelection(chatProvider);
        }),
        vscode.commands.registerCommand('lmstudio.developWithAI', async () => {
            await developWithAI();
        })
    );

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('lmstudio')) {
                updateOrchestratorClient();
                checkOrchestratorStatus();
            }
        })
    );

    // Check initial orchestrator status
    checkOrchestratorStatus();

    // Set up periodic status check
    const statusInterval = setInterval(checkOrchestratorStatus, 10000);
    context.subscriptions.push({
        dispose: () => clearInterval(statusInterval)
    });

    outputChannel.appendLine('LM Studio Orchestrator extension activated');
}

function updateOrchestratorClient() {
    const config = vscode.workspace.getConfiguration('lmstudio');
    const baseUrl = config.get<string>('orchestrator.baseUrl', 'http://localhost:4100');
    orchestratorClient = new OrchestratorClient(baseUrl);
}

async function createTask() {
    try {
        const goal = await vscode.window.showInputBox({
            prompt: 'Enter automation task description',
            placeHolder: 'e.g., "Take a screenshot of the desktop" or "Open notepad and type hello"',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Please enter a task description';
                }
                return null;
            }
        });

        if (!goal) {
            return;
        }

        outputChannel.appendLine(`Creating task: ${goal}`);
        vscode.window.showInformationMessage('Creating task...');

        const result = await orchestratorClient.createTask(goal.trim());

        if (result && result.id) {
            outputChannel.appendLine(`Task created with ID: ${result.id}`);
            vscode.window.showInformationMessage(`Task created with ID: ${result.id}`);

            // Option to view the task
            const viewTask = await vscode.window.showInformationMessage(
                'Task created successfully!',
                'View Tasks',
                'Open Orchestrator'
            );

            if (viewTask === 'View Tasks') {
                await viewTasks();
            } else if (viewTask === 'Open Orchestrator') {
                const config = vscode.workspace.getConfiguration('lmstudio');
                const baseUrl = config.get<string>('orchestrator.baseUrl', 'http://localhost:4100');
                vscode.env.openExternal(vscode.Uri.parse(baseUrl));
            }
        } else {
            throw new Error('Invalid response from orchestrator');
        }
    } catch (error: any) {
        const errorMsg = `Failed to create task: ${error.message}`;
        outputChannel.appendLine(errorMsg);
        vscode.window.showErrorMessage(errorMsg);
    }
}

async function askAboutSelection(chatProvider: ChatViewProvider) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage('No active editor found.');
        return;
    }

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);

    if (!selectedText) {
        vscode.window.showInformationMessage('No text selected.');
        return;
    }

    // Ensure the chat view is visible by showing the view container first
    await vscode.commands.executeCommand('workbench.view.extension.lmstudio');
    await vscode.commands.executeCommand('lmstudio.chatView.focus');

    // Send the selected text to the chat view
    chatProvider.handleUserMessage(`My selected code is:\n\n\
${selectedText}
\
\nWhat do you think of it?`);
}

async function viewTasks() {
    try {
        const config = vscode.workspace.getConfiguration('lmstudio');
        const baseUrl = config.get<string>('orchestrator.baseUrl', 'http://localhost:4100');

        // Open the orchestrator's web interface in external browser
        vscode.env.openExternal(vscode.Uri.parse(baseUrl));
        outputChannel.appendLine(`Opening orchestrator web interface: ${baseUrl}`);
    } catch (error: any) {
        const errorMsg = `Failed to open tasks view: ${error.message}`;
        outputChannel.appendLine(errorMsg);
        vscode.window.showErrorMessage(errorMsg);
    }
}

async function startOrchestrator() {
    if (orchestratorProcess) {
        vscode.window.showWarningMessage('Orchestrator is already running.');
        return;
    }

    try {
        const config = vscode.workspace.getConfiguration('lmstudio');
        const entryPath = config.get<string>('orchestrator.entryPath', '');
        const orchestratorPort = config.get<number>('orchestrator.port', 4100);
        const apiUrl = config.get<string>('apiUrl', 'http://localhost:1234/v1');
        const modelName = config.get<string>('modelName', 'lmstudio-local');
        const maxSteps = config.get<number>('maxSteps', 8);

        if (!entryPath) {
            vscode.window.showErrorMessage('Please configure the orchestrator entry path in settings.');
            return;
        }

        // Verify the entry path exists
        const fs = require('fs');
        if (!fs.existsSync(entryPath)) {
            vscode.window.showErrorMessage(`Orchestrator entry path not found: ${entryPath}`);
            return;
        }

        outputChannel.appendLine(`Starting orchestrator: ${entryPath}`);
        outputChannel.appendLine(`Port: ${orchestratorPort}, API: ${apiUrl}, Model: ${modelName}`);

        // Set environment variables
        const env = {
            ...process.env,
            ORCH_PORT: orchestratorPort.toString(),
            OPENAI_API_BASE: apiUrl,
            ORCH_MODEL: modelName,
            MAX_STEPS: maxSteps.toString()
        };

        const workingDir = path.dirname(entryPath);

        orchestratorProcess = spawn('node', [entryPath], {
            env,
            cwd: workingDir,
            detached: false,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        orchestratorProcess.stdout?.on('data', (data) => {
            outputChannel.appendLine(`Orchestrator: ${data.toString().trim()}`);
        });

        orchestratorProcess.stderr?.on('data', (data) => {
            outputChannel.appendLine(`Orchestrator Error: ${data.toString().trim()}`);
        });

        orchestratorProcess.on('close', (code) => {
            outputChannel.appendLine(`Orchestrator process exited with code ${code}`);
            orchestratorProcess = null;
            statusBarItem.text = '$(circle-slash) LM Studio: Stopped';
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        });

        orchestratorProcess.on('error', (error) => {
            outputChannel.appendLine(`Orchestrator process error: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to start orchestrator: ${error.message}`);
            orchestratorProcess = null;
        });

        vscode.window.showInformationMessage('Orchestrator started successfully!');
        statusBarItem.text = '$(loading~spin) LM Studio: Starting...';

        // Check status after a brief delay
        setTimeout(checkOrchestratorStatus, 3000);
    } catch (error: any) {
        const errorMsg = `Failed to start orchestrator: ${error.message}`;
        outputChannel.appendLine(errorMsg);
        vscode.window.showErrorMessage(errorMsg);
    }
}

async function stopOrchestrator() {
    if (!orchestratorProcess) {
        vscode.window.showWarningMessage('Orchestrator is not running.');
        return;
    }

    outputChannel.appendLine('Stopping orchestrator...');
    orchestratorProcess.kill();
    orchestratorProcess = null;
    vscode.window.showInformationMessage('Orchestrator stopped.');
    statusBarItem.text = '$(circle-slash) LM Studio: Stopped';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
}

async function checkOrchestratorStatus() {
    try {
        const isHealthy = await orchestratorClient.checkHealth();

        if (isHealthy) {
            statusBarItem.text = '$(check) LM Studio: Connected';
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
            statusBarItem.tooltip = 'Orchestrator is running and healthy. Click to view tasks.';
        } else {
            statusBarItem.text = '$(circle-slash) LM Studio: Disconnected';
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            statusBarItem.tooltip = 'Cannot connect to orchestrator. Try starting it.';
        }
    } catch (error: any) {
        statusBarItem.text = '$(circle-slash) LM Studio: Error';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        statusBarItem.tooltip = `Connection error: ${error.message}`;
    }
}

async function developWithAI() {
    try {
        const cfg = vscode.workspace.getConfiguration('lmstudio');
        const baseUrl = cfg.get<string>('orchestrator.baseUrl', 'http://localhost:4100');
        const adminToken = cfg.get<string>('orchestrator.adminToken', '');
        const apiUrl = cfg.get<string>('apiUrl', 'http://localhost:1234/v1');
        const modelName = cfg.get<string>('modelName', 'lmstudio-local');

        // Quick-pick target first to enable per-target defaults
        const target = await pickTargetDirectory();
        if (!target) { return; }
        addRecentTarget(target.path, target.label);

        // Prompt via common templates or custom input (with per-target default hint)
        const defaultSuggestion = defaultPromptForTarget(target);
        const prompt = await buildPromptViaTemplates(defaultSuggestion);
        if (!prompt) { return; }
        // Track in recent history
        addRecentPrompt(prompt.trim());

        // Prepare payload similar to helper script
        const payload: any = { config: { prompt: prompt.trim(), project_dir: target.path } };
        if (apiUrl) {
            const base = apiUrl.replace(/\/v1$/, '');
            payload.config.endpoints = { a: base, b: base };
        }
        if (modelName) {
            payload.config.models = { a: { name: modelName }, b: { name: modelName } };
        }

        outputChannel.appendLine(`Develop with AI -> ${prompt}`);
        outputChannel.appendLine(`Calling ${baseUrl}/admin/autodev_run for ${target.path}`);

        // Re-init client with latest baseUrl
        orchestratorClient = new OrchestratorClient(baseUrl);
        const resp = await orchestratorClient.autodevRun(payload, adminToken || undefined);

        // Surface concise summary
        if (resp?.error) {
            vscode.window.showErrorMessage(`Auto Dev failed: ${resp.error}`);
            outputChannel.appendLine(`Auto Dev failed: ${resp.error}`);
            return;
        }
        const ok = resp?.ok ?? true;
        const exitCode = resp?.exitCode;
        const summary = resp?.summary || '(no summary)';
        vscode.window.showInformationMessage(`Auto Dev completed (ok=${ok}, exit=${exitCode}). See LM Studio output for details.`);
        outputChannel.appendLine(`Auto Dev ok=${ok} exit=${exitCode}`);
        if (resp?.stderr) {
            outputChannel.appendLine(`stderr: ${resp.stderr}`);
        }
        outputChannel.appendLine('----- Recent Events Summary -----');
        outputChannel.appendLine(summary);

        // Offer to open orchestrator viewer
        const choice = await vscode.window.showInformationMessage('Open orchestrator viewer to inspect logs?', 'Open Viewer', 'Dismiss');
        if (choice === 'Open Viewer') {
            vscode.env.openExternal(vscode.Uri.parse(baseUrl));
        }
    } catch (error: any) {
        const msg = `Develop with AI failed: ${error?.message || String(error)}`;
        outputChannel.appendLine(msg);
        vscode.window.showErrorMessage(msg);
    }
}

async function buildPromptViaTemplates(defaultSuggestion?: string): Promise<string | undefined> {
    type Item = (vscode.QuickPickItem & { _type?: 'template' | 'custom' | 'recent' | 'sep', _value?: string, id?: string });
    const entries: Item[] = [];

    // Templates section
    entries.push({ label: '$(symbol-template) Templates', kind: vscode.QuickPickItemKind.Separator, _type: 'sep' });
    entries.push({ label: 'Add feature…', detail: 'Add feature: {description}', _type: 'template', id: 'feature' });
    entries.push({ label: 'Fix bug…', detail: 'Fix bug: {issue}', _type: 'template', id: 'bug' });
    entries.push({ label: 'Refactor…', detail: 'Refactor: {component} to {improvement}', _type: 'template', id: 'refactor' });
    entries.push({ label: 'Add tests…', detail: 'Add tests for: {feature}', _type: 'template', id: 'tests' });
    entries.push({ label: 'Custom prompt', detail: 'Write a free-form task description', _type: 'custom' });

    // Recent section
    const recent = getRecentPrompts();
    if (recent.length > 0) {
        entries.push({ label: '$(history) Recent', kind: vscode.QuickPickItemKind.Separator, _type: 'sep' });
        for (const r of recent.slice(0, 12)) {
            entries.push({ label: r.text, detail: `Used ${timeAgo(r.ts)}`, _type: 'recent', _value: r.text });
        }
    }

    const picked = await vscode.window.showQuickPick(entries, { placeHolder: 'Select a template, recent prompt, or choose custom' });
    if (!picked) { return undefined; }
    if (picked._type === 'custom') {
        return await vscode.window.showInputBox({
            prompt: 'Describe the development task for the VS Code extension',
            placeHolder: defaultSuggestion || 'e.g., "Add copy buttons to chat messages and persist chat history"',
            value: defaultSuggestion,
            validateInput: v => (!v || !v.trim() ? 'Please enter a task description' : null)
        });
    }

    if (picked._type === 'recent') {
        return picked._value;
    }

    switch (picked.id) {
        case 'feature': {
            const description = await vscode.window.showInputBox({ prompt: 'Feature description', placeHolder: defaultSuggestion || 'e.g., Copy buttons on chat messages with clipboard integration', value: defaultSuggestion });
            if (!description) return undefined;
            return `Add feature: ${description}`;
        }
        case 'bug': {
            const issue = await vscode.window.showInputBox({ prompt: 'Bug to fix', placeHolder: defaultSuggestion || 'e.g., Token counting accuracy and loading states', value: defaultSuggestion });
            if (!issue) return undefined;
            return `Fix bug: ${issue}`;
        }
        case 'refactor': {
            const component = await vscode.window.showInputBox({ prompt: 'Component/module to refactor', placeHolder: 'e.g., chat component' });
            if (!component) return undefined;
            const improvement = await vscode.window.showInputBox({ prompt: 'Improvement goal', placeHolder: defaultSuggestion || 'e.g., use TypeScript interfaces and better error handling', value: defaultSuggestion });
            if (!improvement) return undefined;
            return `Refactor: ${component} to ${improvement}`;
        }
        case 'tests': {
            const feature = await vscode.window.showInputBox({ prompt: 'Feature to add tests for', placeHolder: defaultSuggestion || 'e.g., chat history persistence', value: defaultSuggestion });
            if (!feature) return undefined;
            return `Add tests for: ${feature}`;
        }
        default:
            return undefined;
    }
}

type SelectedTarget = { path: string; label: string };
async function pickTargetDirectory(): Promise<SelectedTarget | undefined> {
    const fs = require('fs');
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const candidates: (vscode.QuickPickItem & { _type?: 'recent' | 'static' | 'browse'; _path?: string; _label?: string })[] = [];

    // Build absolute target paths relative to workspace root
    const pathAbs = (rel: string) => (require('path').isAbsolute(rel) ? rel : require('path').join(root, rel));
    // Recent targets
    const recent = getRecentTargets();
    if (recent.length > 0) {
        candidates.push({ label: '$(history) Recent Targets', kind: vscode.QuickPickItemKind.Separator });
        for (const r of recent.slice(0, 10)) {
            const abs = pathAbs(r.path);
            if (fs.existsSync(abs)) {
                candidates.push({ label: r.label || r.path, description: r.path, detail: timeAgo(r.ts), _type: 'recent', _path: abs, _label: r.label || r.path });
            }
        }
    }

    // Static common targets
    candidates.push({ label: '$(symbol-folder) Common Targets', kind: vscode.QuickPickItemKind.Separator });
    const targets = [
        { label: 'Current Extension (vscode_to_llm)', rel: 'projects/vscode_to_llm' },
        { label: 'Orchestrator Core', rel: 'windows-orchestrator' },
        { label: 'Scripts', rel: 'scripts' }
    ];
    for (const t of targets) {
        const abs = pathAbs(t.rel);
        if (abs && fs.existsSync(abs)) {
            candidates.push({ label: t.label, description: t.rel, detail: abs, _type: 'static', _path: abs, _label: t.label });
        }
    }

    // Workspace root
    if (root) {
        candidates.push({ label: 'Workspace Root', description: '(current workspace)', detail: root, _type: 'static', _path: root, _label: 'Workspace Root' });
    }

    // Browse option
    candidates.push({ label: 'Browse…', description: 'Pick another folder', detail: '', _type: 'browse' });

    const placeHolder = 'Select target project directory';
    const picked = await vscode.window.showQuickPick(candidates, { placeHolder });
    if (!picked) { return undefined; }
    if (picked._type === 'browse') {
        const sel = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Select project directory' });
        return sel && sel[0] ? { path: sel[0].fsPath, label: 'Custom' } : undefined;
    }
    return picked._path ? { path: picked._path, label: picked._label || picked.label } : undefined;
}

// ---- Recent prompts storage ----
type RecentPrompt = { text: string; ts: number };
const RECENT_PROMPTS_KEY = 'lmstudio.recentPrompts';

function getRecentPrompts(): RecentPrompt[] {
    if (!extContext) return [];
    try {
        const list = extContext.globalState.get<RecentPrompt[]>(RECENT_PROMPTS_KEY, []) || [];
        return Array.isArray(list) ? list : [];
    } catch { return []; }
}

function saveRecentPrompts(list: RecentPrompt[]) {
    if (!extContext) return;
    extContext.globalState.update(RECENT_PROMPTS_KEY, list);
}

function addRecentPrompt(text: string) {
    const t = (text || '').trim();
    if (!t) return;
    const now = Date.now();
    const list = getRecentPrompts().filter(p => (p?.text || '').trim().toLowerCase() !== t.toLowerCase());
    list.unshift({ text: t, ts: now });
    if (list.length > 15) list.length = 15;
    saveRecentPrompts(list);
}

function timeAgo(ts: number): string {
    const delta = Math.max(0, Date.now() - (Number(ts) || 0));
    const sec = Math.floor(delta / 1000);
    if (sec < 10) return 'just now';
    if (sec < 60) return `${sec} seconds ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
    const day = Math.floor(hr / 24);
    if (day === 1) return 'yesterday';
    if (day < 7) return `${day} days ago`;
    const wk = Math.floor(day / 7);
    if (wk < 5) return `${wk} week${wk === 1 ? '' : 's'} ago`;
    const mo = Math.floor(day / 30);
    if (mo < 12) return `${mo} month${mo === 1 ? '' : 's'} ago`;
    const yr = Math.floor(day / 365);
    return `${yr} year${yr === 1 ? '' : 's'} ago`;
}

// ---- Recent targets storage ----
type RecentTarget = { path: string; label?: string; ts: number };
const RECENT_TARGETS_KEY = 'lmstudio.recentTargets';

function getRecentTargets(): RecentTarget[] {
    if (!extContext) return [];
    try {
        const list = extContext.globalState.get<RecentTarget[]>(RECENT_TARGETS_KEY, []) || [];
        return Array.isArray(list) ? list : [];
    } catch { return []; }
}

function saveRecentTargets(list: RecentTarget[]) {
    if (!extContext) return;
    extContext.globalState.update(RECENT_TARGETS_KEY, list);
}

function addRecentTarget(path: string, label?: string) {
    const p = (path || '').trim();
    if (!p) return;
    const norm = require('path').normalize(p).toLowerCase();
    const list = getRecentTargets().filter(t => require('path').normalize(t.path).toLowerCase() !== norm);
    list.unshift({ path: p, label, ts: Date.now() });
    if (list.length > 12) list.length = 12;
    saveRecentTargets(list);
}

function defaultPromptForTarget(target: SelectedTarget): string | undefined {
    const name = (target.label || '').toLowerCase();
    if (name.includes('vscode') || name.includes('extension')) return 'Add feature to VS Code extension';
    if (name.includes('script')) return 'Create PowerShell automation script';
    if (name.includes('orchestrator')) return 'Enhance orchestrator core functionality';
    return undefined;
}

export function deactivate() {
    outputChannel.appendLine('Deactivating LM Studio Orchestrator extension...');

    if (orchestratorProcess) {
        outputChannel.appendLine('Stopping orchestrator process...');
        orchestratorProcess.kill();
        orchestratorProcess = null;
    }

    outputChannel.dispose();
}
