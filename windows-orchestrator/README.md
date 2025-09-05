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
- MAX_RETRIES_PER_STEP: reflection retries on failure (default 2)
- MAX_RECURSION_DEPTH: limit for spawn_subtask (default 2)
- BASE_BACKOFF_MS: base milliseconds for retry backoff (default 500)
- AUTODEV_ROOT: path to ai_auto_development/ai_auto_development (enables autodev_run)
- PYTHON_BIN: python binary name/path used to run Auto Dev CLI
- MAX_CONTEXT_CHARS: character budget for assembled LLM context (default 6000)

Run
  node windows-orchestrator/index.js

Endpoints
- GET /health
- GET /tasks
- POST /tasks { goal }
- GET /tasks/:id
- GET /tasks/:id/messages
- GET /tasks/:id/context
- GET /tasks/:id/notes
- POST /tasks/:id/notes { note }
- POST /admin/autodev_run { config }
- GET /autodev/status

Recursive Looping and Debugging
- The orchestrator now performs a reflection-and-retry micro-loop per step.
  - On error-like results (non-200, ok:false, error present, non-zero exitCode), it asks the model to propose a minimal corrected action and retries up to MAX_RETRIES_PER_STEP.
  - Each attempt is recorded under step.attempts; the final attempt is also summarized at step.result.
- The planner can also request nested work via action "spawn_subtask" with params { goal }.
  - Subtasks run the same planning loop and return a summary to the parent task.
  - Recursion is limited by MAX_RECURSION_DEPTH.

Verification Tool
- New tool: verify_result
  - file_exists: { path } → ok if path exists
  - api_call: { url, method?, expected_status?, expectation? } → ok if status matches and body contains expectation (if provided)
  - test: { script, expectation? } → runs PowerShell; ok if exit code is 0 and stdout contains expectation (if provided)

Task Templates
- New planner action: spawn_template
  - Example: { action: "spawn_template", params: { template: "build_test_fix", inputs: { project_dir: "C:\\repo", test_command: "npm test" } } }
  - Resolves to a subtask goal like “Build → Test → Fix until tests pass”.

Progressive Context
- Each step tracks context: learned_issues (e.g., timeout, permission) and attempted_fixes (strategy + action per retry).

Retry Strategy and Backoff
- Retry strategy hints: wait_longer (for timeouts), escalate_privileges (for permission errors), debug_approach (default).
- Uses exponential backoff for timeout-related retries based on BASE_BACKOFF_MS.

Available Tools
- screenshot, move_mouse, click_mouse, scroll, type_text, key_press, open_app, run_powershell, autodev_run, verify_result, spawn_subtask, spawn_template, done


Notes
- Expects the desktop driver to accept POST { action, ...params } and return JSON.
- For screenshots, if the driver returns image_base64 or image, we summarize length.
- Includes tool "autodev_run" to invoke the Auto Dev engine via Python CLI.
- Persists per-task logs and context under data/tasks/<id> to enable referenceable memory.

Local Utility Tool: run_powershell
- Added for diagnostics and file-system checks alongside UI steps.
- Use in prompts to create/list test files or query timestamps safely.
- Example params:
  { "script": "Get-ChildItem 'C:\\Path' | Sort-Object LastWriteTime -Desc | Select-Object -First 5 Name,LastWriteTime | ConvertTo-Json -Compress" }
