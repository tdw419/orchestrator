#!/usr/bin/env bash
set -euo pipefail

# Posts a task to the Linux Orchestrator to install the Anthropic CLI
# and add a Bash `claude` function, then verifies via a marker file.
#
# Usage:
#   scripts/post_linux_orchestrator_task_install_claude.sh [ORCH_URL]
#
# Default ORCH_URL: http://127.0.0.1:4101

ORCH_URL=${1:-http://127.0.0.1:4101}

GOAL=$(cat <<'EOF'
Use run_shell to install the official Anthropic CLI (binary name "anthropic") on Ubuntu and define a convenient Bash function named "claude" that forwards to anthropic messages create, then verify installation using a marker file. Execute these as separate tool actions:

1) Ensure pipx is available for the current user:
   Script:
   python3 -m pip install --user pipx; python3 -m pipx ensurepath

2) Install the Anthropic CLI using pipx with a fallback to user pip if pipx fails:
   Script:
   (command -v pipx >/dev/null 2>&1 && pipx install anthropic) || python3 -m pip install --user anthropic

3) Append only a helper function to ~/.bashrc (no alias) so that `claude` works in new shells, handles multi-word input and piped stdin, and supports $CLAUDE_MODEL override:
   Script:
   touch "$HOME/.bashrc" && cat >> "$HOME/.bashrc" <<'BASH'

# Orchestrator: claude helper
claude() {
  local model="${CLAUDE_MODEL:-claude-3-5-sonnet-latest}"
  if ! command -v anthropic >/dev/null 2>&1; then
    echo "anthropic CLI not found on PATH. Try: pipx install anthropic" 1>&2
    return 127
  fi
  local input
  if [ -t 0 ]; then
    input="$*"
  else
    input="$(cat -)"
  fi
  anthropic messages create --model "$model" --input "$input"
}
BASH

4) Create a success marker file if anthropic is on PATH and ~/.bashrc contains the function:
   Script:
   if command -v anthropic >/dev/null 2>&1 && grep -q "claude()" "$HOME/.bashrc"; then touch /tmp/anthropic_installed.txt; echo OK_MARKER; else echo MISS_MARKER; exit 1; fi

5) Verify the function resolves in a new bash login shell (similar to VS Code integrated terminal) using verify_result with check_method test:
   Script:
   bash -lc 'type claude >/dev/null 2>&1 && echo OK_FUNC'
   Expectation: OK_FUNC

6) Verify using verify_result with check_method file_exists and the path /tmp/anthropic_installed.txt. Only after both verifications pass, mark done with a brief summary of what was installed and which file was modified.

Constraints:
- Use ONLY run_shell and verify_result.
- Do not call external LLMs or Anthropic APIs; no API key required.
- Use python3 -m style invocations.
- Fallback to pip --user if pipx is not present.
EOF
)

tmp_goal=$(mktemp)
printf "%s" "$GOAL" > "$tmp_goal"
if command -v node >/dev/null 2>&1; then
  payload=$(F="$tmp_goal" node -e 'let fs=require("fs"); let p=process.env.F; let d=fs.readFileSync(p, "utf8"); process.stdout.write(JSON.stringify({goal:d}))')
elif command -v python3 >/dev/null 2>&1; then
  payload=$(python3 - "$tmp_goal" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    goal = f.read()
print(json.dumps({"goal": goal}))
PY
  )
else
  echo "Neither node nor python3 found to JSON-encode payload. Please install one or post manually." >&2
  echo "Goal to post:" >&2
  echo "" >&2
  echo "$GOAL" >&2
  rm -f "$tmp_goal"
  exit 1
fi
rm -f "$tmp_goal"

echo "Posting task to: ${ORCH_URL}/tasks" >&2
if command -v curl >/dev/null 2>&1; then
  curl -sS -X POST -H "Content-Type: application/json" --data "$payload" "${ORCH_URL}/tasks"
  echo
else
  if command -v wget >/dev/null 2>&1; then
    wget -qO- --header='Content-Type: application/json' --post-data="$payload" "${ORCH_URL}/tasks" || true
    echo
  else
    echo "Neither curl nor wget is available to post HTTP. Please install one and re-run." >&2
    exit 1
  fi
fi
