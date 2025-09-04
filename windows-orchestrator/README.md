Windows Orchestrator (Minimal)

A tiny, dependency-free HTTP service that orchestrates a desktop automation loop:
- Calls an OpenAI-compatible chat API (OpenAI/Azure/Anthropic via proxy, or LM Studio)
- Sends single-step actions to a desktop driver (mock or Windows runner)
- Stores tasks in memory; inspect via GET endpoints

Env Vars
- ORCH_PORT: default 4100
- ORCH_MODEL: default lmstudio-local (use your model id)
- OPENAI_API_BASE: default http://localhost:4000 (proxy) or http://127.0.0.1:1234/v1 for LM Studio
- OPENAI_API_KEY: optional key (LM Studio may not need one)
- DESKTOP_DRIVER_URL: default http://127.0.0.1:39990/computer-use (mock server)
- MAX_STEPS: default 8

Run
  node windows-orchestrator/index.js

Endpoints
- GET /health
- GET /tasks
- POST /tasks { goal }
- GET /tasks/:id
- GET /tasks/:id/messages

Notes
- Expects the desktop driver to accept POST { action, ...params } and return JSON.
- For screenshots, if the driver returns image_base64 or image, we summarize length.

Local Utility Tool: run_powershell
- Added for diagnostics and file-system checks alongside UI steps.
- Use in prompts to create/list test files or query timestamps safely.
- Example params:
  { "script": "Get-ChildItem 'C:\\Path' | Sort-Object LastWriteTime -Desc | Select-Object -First 5 Name,LastWriteTime | ConvertTo-Json -Compress" }
