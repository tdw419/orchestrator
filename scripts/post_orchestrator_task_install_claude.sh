#!/usr/bin/env bash
set -euo pipefail

# Posts a task to the local Orchestrator to install the Anthropic CLI
# and add a PowerShell `claude` alias, with a verification step.
#
# Usage:
#   scripts/post_orchestrator_task_install_claude.sh [ORCH_URL]
#
# Default ORCH_URL: http://127.0.0.1:4100

ORCH_URL=${1:-http://127.0.0.1:4100}

read -r -d '' GOAL <<'EOF'
Use run_powershell to install the official Anthropic CLI (command name "anthropic") and create a convenient PowerShell alias "claude" that pipes to anthropic messages create, then verify installation via a marker file. Follow these exact steps in separate tool actions:

1) Ensure pipx is available for the current user:
   Script:
   python -m pip install --user pipx; python -m pipx ensurepath

2) Install the Anthropic CLI using pipx, with a fallback to user pip if pipx fails:
   Script:
   (pipx install anthropic) 2>$null; if (-not $?) { python -m pip install --user anthropic }

3) Add a PowerShell alias and helper function to the current user's profile so that `claude` works:
   Script:
   if (!(Test-Path -LiteralPath $PROFILE)) { New-Item -ItemType File -Path $PROFILE -Force | Out-Null }
   Add-Content -Path $PROFILE -Value "Set-Alias -Name claude -Value anthropic"
   Add-Content -Path $PROFILE -Value "function claude { param([string]$inputText) anthropic messages create --model claude-3-5-sonnet-latest --input $inputText }"

4) Create a success marker file if the anthropic command is on PATH and the profile contains the alias:
   Script:
   if (Get-Command anthropic -ErrorAction SilentlyContinue -and (Get-Content $PROFILE) -match 'claude') { New-Item -ItemType File -Path "$env:TEMP\anthropic_installed.txt" -Force | Out-Null; Write-Host "OK_MARKER" } else { Write-Host "MISS_MARKER"; exit 1 }

5) Verify using verify_result with check_method file_exists and the path $env:TEMP\anthropic_installed.txt. Only after this verification passes, mark done with a short summary of what was installed and where the alias was written.

Constraints and notes:
- Use ONLY the tools: run_powershell and verify_result. Do not call external LLMs directly.
- Do NOT attempt to call Anthropic APIs; no API key is required for this task.
- Do not assume a specific Python version; use python -m ... style invocations.
- If pipx fails, the pip --user fallback is acceptable.
- The verification step must be a dedicated verify_result action with { check_method: "file_exists", path: "$env:TEMP\anthropic_installed.txt" } returning ok:true.
EOF

# Build JSON safely (requires python3). If python3 is unavailable, print instructions.
if command -v python3 >/dev/null 2>&1; then
  payload=$(python3 - <<PY
import json, sys
goal = sys.stdin.read()
print(json.dumps({"goal": goal}))
PY
  <<<"$GOAL")
else
  echo "python3 is required to JSON-encode the payload. Please install python3 or post the task manually." >&2
  echo "Goal to post:" >&2
  echo "" >&2
  echo "$GOAL" >&2
  exit 1
fi

echo "Posting task to: ${ORCH_URL}/tasks" >&2
curl -sS -X POST \
  -H "Content-Type: application/json" \
  --data "$payload" \
  "${ORCH_URL}/tasks"

echo
