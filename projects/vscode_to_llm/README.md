# LM Studio Orchestrator - VS Code Extension

A VS Code extension that provides a seamless interface for desktop automation using LM Studio and the orchestrator system. Features streaming updates, retry logic, and operation cancellation.

## Features

- **Task Creation**: Create desktop automation tasks directly from VS Code
- **Real-time Monitoring**: View task progress with live updates and screenshots
- **Orchestrator Management**: Start and stop the orchestrator server from within VS Code
- **LM Studio Integration**: Connect to local LM Studio instances for AI-powered automation
- **Sidebar Chat**: Chat with LM Studio in a dedicated sidebar view (similar to CodeGPT/Codex)

## Commands

### LM Studio Commands
- `LM Studio: Create Automation Task`
- `LM Studio: View Tasks`
- `LM Studio: Start Orchestrator`
- `LM Studio: Stop Orchestrator`
- `LM Studio: Open Chat`
- `LM Studio: Develop with AI` (prompts for a task and runs orchestrator Auto Dev on your current workspace)

### Orchestrator Commands
- `Orchestrator: Convert Roadmap to SpecKit Tasks` - Convert roadmap.json to SpecKit format
- `Orchestrator: Browse and Run Templates` - Execute templates with real-time status
- `Orchestrator: Run SpecKit Phase` - Run automation for a SpecKit phase
- `Orchestrator: Cancel Operation` - Cancel running operation (also available in status bar)

### Roadmap Workflow

Convert roadmap files to SpecKit tasks and documentation:

1. Create roadmap.json with AI assistance
2. Run `Orchestrator: Convert Roadmap to SpecKit Tasks`
3. Select your roadmap file
4. Generated files appear in specs/roadmap/:
   - tasks.generated.md - Task list by phase
   - {id}.md - Implementation docs per item

### Template Execution

Execute templates with real-time progress:

1. Run `Orchestrator: Browse and Run Templates`
2. Select a template from the catalog
3. Enter required parameters
4. Monitor in Output → Orchestrator:
   ```
   ▶ Running template lmstudio_reasoning...
   ▷ Analyzing requirements...
   ▷ Validating approach...
   ✓ Template completed successfully
   ```

Operations can be cancelled at any time:
- Click the Cancel button in the status bar
- Run the `Orchestrator: Cancel Operation` command
- The extension will automatically retry on errors (configurable)

### SpecKit Automation

Run phases with task filtering:

1. Run `Orchestrator: Run SpecKit Phase`
2. Enter phase name (e.g. "Phase 1: Template Runtime")
3. Optional filters:
   - Include: "T001,T002"
   - Exclude: "T003"
4. Monitor progress in Output panel

## Requirements

- [LM Studio](https://lmstudio.ai/) installed and running.
- The `orchestrator` project cloned and available at `C:\zion\wwwroot\projects\orchestrator`.

## Extension Settings

This extension contributes the following settings:

### Orchestrator Settings
* `orchestrator.apiUrl`: Base URL for the orchestrator server (default: `http://localhost:4100`)
* `orchestrator.timeoutMs`: API call timeout in milliseconds (default: `30000`)

### LM Studio Settings
* `lmstudio.apiUrl`: LM Studio API URL (default: `http://localhost:1234/v1`)
* `lmstudio.modelName`: The model to use in LM Studio
* `lmstudio.maxSteps`: Maximum steps per task (default: `8`)
* `lmstudio.systemPrompt`: System prompt used for chat behavior
* `lmstudio.orchestrator.entryPath`: Orchestrator entry path for starting/stopping
* `lmstudio.orchestrator.adminToken`: Token for protected `/admin/*` routes

## How to Use

1.  Install dependencies: `npm install` in the extension directory.
2.  Start LM Studio with your model loaded on port 1234.
3.  Open this project in VS Code and press F5 to run the extension.
4.  Use commands from the Command Palette (Ctrl+Shift+P):
    - Run `LM Studio: Open Chat` to open the sidebar chat. The view is also available under the LM Studio activity bar icon.
    - Run `LM Studio: Develop with AI` to describe a task and let the orchestrator apply changes in your current workspace via Auto Dev. Includes quick-pick targets (vscode_to_llm, windows-orchestrator, scripts, root), common prompt templates (feature, bug, refactor, tests), and a recent prompts history for fast reuse.
    - Create and manage automation tasks with the existing commands.
