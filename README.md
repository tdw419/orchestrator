# Orchestrator

A minimal desktop automation orchestrator system with two main components:

1. **Windows Orchestrator**: A dependency-free HTTP service that orchestrates desktop automation tasks
2. **Mock Desktop Server**: A lightweight mock server for testing desktop automation actions

## Components

### Windows Orchestrator (`windows-orchestrator/`)

A tiny HTTP service that orchestrates desktop automation loops by:
- Calling OpenAI-compatible chat APIs (OpenAI/Azure/Anthropic via proxy, or LM Studio)
- Sending single-step actions to a desktop driver
- Storing tasks in memory with inspection endpoints

**Key Features:**
- Zero external dependencies
- In-memory task storage
- Screenshot capture and storage
- PowerShell command execution
- Built-in web viewer for task monitoring

### Mock Desktop Server (`scripts/`)

A minimal mock server that simulates desktop automation responses for testing and development.

**Features:**
- Zero-dependency HTTP server
- Returns mock screenshots (bytebot logo)
- Logs all actions for debugging
- Compatible with the orchestrator's desktop driver interface

## Quick Start

1. **Start the mock desktop server:**
   ```bash
   node scripts/mock-desktop-server.js
   ```
   Server runs on http://0.0.0.0:39990

2. **Start the orchestrator:**
   ```bash
   node windows-orchestrator/index.js
   ```
   Server runs on http://0.0.0.0:4100

3. **Create a task:**
   ```bash
   curl -X POST http://localhost:4100/tasks \
     -H "Content-Type: application/json" \
     -d '{"goal": "Take a screenshot of the desktop"}'
   ```

4. **View tasks in browser:**
   Open http://localhost:4100 to see the built-in task viewer

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ORCH_PORT` | 4100 | Orchestrator HTTP port |
| `ORCH_MODEL` | lmstudio-local | Model ID for LLM calls |
| `OPENAI_API_BASE` | http://localhost:4000 | API base URL |
| `OPENAI_API_KEY` | (empty) | API key (optional for LM Studio) |
| `DESKTOP_DRIVER_URL` | http://127.0.0.1:39990/computer-use | Desktop driver endpoint |
| `MAX_STEPS` | 8 | Maximum steps per task |
| `PORT` | 39990 | Mock server port |
| `AUTODEV_ROOT` | (empty) | Path to `ai_auto_development/ai_auto_development` for Auto Dev integration |
| `PYTHON_BIN` | python | Python executable name/path for Auto Dev CLI |
| `MAX_CONTEXT_CHARS` | 6000 | Soft budget for assembled LLM context (characters) |
| `ENABLE_SUMMARY` | true | Enable/disable rolling progress summaries |
| `MIN_SUMMARY_INTERVAL_MS` | 30000 | Minimum interval between summary updates (milliseconds) |
| `ORCH_ADMIN_TOKEN` | (empty) | If set, protects `/admin/*` endpoints (send `Authorization: Bearer <token>`) |

### LM Studio Setup

For local LLM inference:
1. Install LM Studio
2. Load a model
3. Start the local server (typically http://127.0.0.1:1234/v1)
4. Set `OPENAI_API_BASE=http://127.0.0.1:1234/v1`

## API Endpoints

### Orchestrator (Port 4100)

- `GET /health` - Health check with configuration
- `GET /tasks` - List all tasks
- `POST /tasks` - Create new task with `{"goal": "description"}`
- `GET /tasks/:id` - Get task details
- `GET /tasks/:id/messages` - Get task conversation history
- `GET /tasks/:id/files` - Get task screenshot files
- `GET /shots/:filename` - Serve screenshot images
- `GET /` or `/viewer` - Built-in web viewer
- `POST /admin/runps` - Execute PowerShell commands directly
- `POST /admin/autodev_run` - Run Auto Dev once with provided config (bypass LLM)
- `GET /autodev/status` - Serve `.autodev/status.json` from Auto Dev (if available)
- `GET /tasks/:id/context` - Return prioritized assembled context string used for planning
- `GET /tasks/:id/context?format=json` - Return structured context breakdown with sections and scores
- `GET /tasks/:id/notes` - List pinned notes for the task
- `POST /tasks/:id/notes` - Add a pinned note `{ "note": "text" }` (500 chars max, deduplicated)
- `GET /tasks/:id/logs?tail=N&since=timestamp&role=filter` - Get activity logs with incremental polling

### Mock Desktop Server (Port 39990)

- `POST /computer-use` - Handle desktop automation actions
  - `{"action": "screenshot"}` returns mock screenshot
  - Other actions are logged and return `{"ok": true}`

## Available Actions

The orchestrator supports these desktop automation actions:

- `screenshot` - Capture screen
- `move_mouse` - Move mouse cursor
- `click_mouse` - Click at coordinates
- `scroll` - Scroll in direction
- `type_text` - Type text input
- `key_press` - Press keyboard keys
- `open_app` - Launch applications
- `run_powershell` - Execute PowerShell scripts
- `autodev_run` - Run the Auto Dev engine with a JSON config (prompt, project_dir, endpoints, models)
- `done` - Mark task complete

## Context & Persistence

- Per-task data is stored under `data/tasks/<taskId>/`:
  - `meta.json` - Task metadata (id, goal, timestamps)
  - `messages.jsonl` - Append-only event log (user, planner, system)
  - `steps.json` - Step snapshots (planned action, results, screenshots)
  - `context.txt` - Current prioritized context used for LLM planning
  - `summary.txt` - Rolling progress summary (generated every 3 steps, rate-limited)
  - `notes.json` - Pinned notes included at high priority in context
- Context assembly prioritizes: goal, rolling summary, pinned notes, recent errors, last steps, artifacts, and Auto Dev status.
- Rolling summaries are generated automatically and included at high priority to maintain context continuity.
- Use `MAX_CONTEXT_CHARS` to tune context size passed to the LLM.
 
## Roadmap & Self-Improvement

- Human-readable roadmap: `ROADMAP.md`
- Machine-readable tasks: `roadmap.json`
- Runner script: `scripts/run-roadmap.ps1`
  - Runs each roadmap item via orchestrator `POST /admin/autodev_run`
  - Sets `project_dir` to this repository so Auto Dev edits this codebase
  - Examples:
    - `powershell -ExecutionPolicy Bypass -File scripts\run-roadmap.ps1 -AutoDevRoot "C:\\zion\\wwwroot\\projects\\ai_auto_development\\ai_auto_development" -PythonBin python -ApiBase "http://127.0.0.1:1234/v1" -Model lmstudio-local`
    - Filter by IDs: `-Ids sec-admin-token,zip-download`

## Web Viewer Features

The built-in web viewer at http://localhost:4100/viewer provides:

- **Overview Tab**: Pinned notes, AI context display, and screenshots
- **Activity Tab**: Real-time activity logs with auto-refresh (3-second intervals)
- **Incremental polling**: Only fetches new log entries for efficient real-time updates
- **XSS-safe rendering**: All user content is properly escaped
- **Interactive notes**: Add pinned notes that immediately influence AI context

## File Structure

```
orchestrator/
├── README.md                          # This file
├── orchestrator.code-workspace        # VS Code workspace
├── scripts/
│   └── mock-desktop-server.js        # Mock desktop server
├── static/
│   └── bytebot-logo.png             # Mock screenshot image
└── windows-orchestrator/
    ├── index.js                     # Main orchestrator server
    ├── README.md                    # Detailed component docs
    └── viewer.html                  # Built-in web interface
```

## Development

The system is designed to be minimal and self-contained:
- No package.json or external dependencies
- Uses Node.js built-in modules only (requires Node.js 18+ for global fetch)
- Easy to modify and extend
- Suitable for Windows automation tasks
- Production-ready with XSS protection, input validation, and rate limiting

Screenshots are automatically saved to `shots/` directory with naming pattern `{taskId}-step{stepNum}.png`.

## License

This project appears to be a minimal implementation for desktop automation orchestration and testing.
- Admin security: If `ORCH_ADMIN_TOKEN` is set, `/admin/*` endpoints require `Authorization: Bearer <token>`.
