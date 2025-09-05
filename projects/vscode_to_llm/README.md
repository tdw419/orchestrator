# LM Studio Orchestrator - VS Code Extension

A VS Code extension that provides a seamless interface for desktop automation using LM Studio and the orchestrator system.

## Features

- **Task Creation**: Create desktop automation tasks directly from VS Code
- **Real-time Monitoring**: View task progress with live updates and screenshots
- **Orchestrator Management**: Start and stop the orchestrator server from within VS Code
- **LM Studio Integration**: Connect to local LM Studio instances for AI-powered automation
- **Sidebar Chat**: Chat with LM Studio in a dedicated sidebar view (similar to CodeGPT/Codex)

## Commands

- `LM Studio: Create Automation Task`
- `LM Studio: View Tasks`
- `LM Studio: Start Orchestrator`
- `LM Studio: Stop Orchestrator`
- `LM Studio: Open Chat`
- `LM Studio: Develop with AI` (prompts for a task and runs orchestrator Auto Dev on your current workspace)

## Requirements

- [LM Studio](https://lmstudio.ai/) installed and running.
- The `orchestrator` project cloned and available at `C:\zion\wwwroot\projects\orchestrator`.

## Extension Settings

This extension contributes the following settings:

* `lmstudio.orchestrator.port`: Port for the orchestrator server (default: `4100`).
* `lmstudio.apiUrl`: LM Studio API URL (default: `http://localhost:1234/v1`).
* `lmstudio.modelName`: The model to use in LM Studio.
* `lmstudio.maxSteps`: Maximum steps per task (default: `8`).
* `lmstudio.systemPrompt`: System prompt used for chat behavior.
* `lmstudio.orchestrator.baseUrl`: Orchestrator base URL (default: `http://localhost:4100`).
* `lmstudio.orchestrator.entryPath`: Orchestrator entry path for starting/stopping.
* `lmstudio.orchestrator.adminToken`: If your orchestrator protects `/admin/*`, set the token here so the extension can call `/admin/autodev_run`.

## How to Use

1.  Install dependencies: `npm install` in the extension directory.
2.  Start LM Studio with your model loaded on port 1234.
3.  Open this project in VS Code and press F5 to run the extension.
4.  Use commands from the Command Palette (Ctrl+Shift+P):
    - Run `LM Studio: Open Chat` to open the sidebar chat. The view is also available under the LM Studio activity bar icon.
    - Run `LM Studio: Develop with AI` to describe a task and let the orchestrator apply changes in your current workspace via Auto Dev. Includes quick-pick targets (vscode_to_llm, windows-orchestrator, scripts, root), common prompt templates (feature, bug, refactor, tests), and a recent prompts history for fast reuse.
    - Create and manage automation tasks with the existing commands.
