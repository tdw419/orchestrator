#!/usr/bin/env bash
set -euo pipefail

# Posts a DIRECT actions task (no LLM planning) to the Linux Orchestrator
# to install the Anthropic CLI and define a robust `claude` function.
#
# Usage:
#   scripts/post_linux_orchestrator_direct_install_claude.sh [ORCH_URL]
# Default ORCH_URL: http://127.0.0.1:4101

ORCH_URL=${1:-http://127.0.0.1:4101}

GOAL=$(cat <<'EOF'
Install the Anthropic CLI and create a robust claude() Bash function usable in VS Code terminals. Verify function resolution and a success marker file.
EOF
)

ACTIONS_JSON=$(cat <<'JSON'
[
  { "action": "run_shell", "params": { "script": "python3 -m pip install --user pipx; python3 -m pipx ensurepath" } },
  { "action": "run_shell", "params": { "script": "(command -v pipx >/dev/null 2>&1 && pipx install anthropic) || python3 -m pip install --user anthropic" } },
  { "action": "run_shell", "params": { "script": "touch \"$HOME/.bashrc\" && cat >> \"$HOME/.bashrc\" <<'BASH'\n\n# Orchestrator: claude helper\nclaude() {\n  local model=\"${CLAUDE_MODEL:-claude-3-5-sonnet-latest}\"\n  if ! command -v anthropic >/dev/null 2>&1; then\n    echo \"anthropic CLI not found on PATH. Try: pipx install anthropic\" 1>&2\n    return 127\n  fi\n  local input\n  if [ -t 0 ]; then\n    input=\"$*\"\n  else\n    input=\"$(cat -)\"\n  fi\n  anthropic messages create --model \"$model\" --input \"$input\"\n}\nBASH" } },
  { "action": "run_shell", "params": { "script": "if command -v anthropic >/dev/null 2>&1 && grep -q 'claude()' \"$HOME/.bashrc\"; then touch /tmp/anthropic_installed.txt; echo OK_MARKER; else echo MISS_MARKER; exit 1; fi" } },
  { "action": "verify_result", "params": { "check_method": "test", "script": "bash -lc 'type claude >/dev/null 2>&1 && echo OK_FUNC'", "expectation": "OK_FUNC" } },
  { "action": "verify_result", "params": { "check_method": "file_exists", "path": "/tmp/anthropic_installed.txt" } }
]
JSON
)

make_payload_with_node() {
  node -e 'let goal=process.env.GOAL||""; let acts=JSON.parse(process.env.ACTS||"[]"); process.stdout.write(JSON.stringify({ goal, actions: acts }))'
}

make_payload_with_python() {
  python3 - <<'PY'
import json, os
goal = os.environ.get('GOAL','')
acts = os.environ.get('ACTS','[]')
print(json.dumps({ 'goal': goal, 'actions': json.loads(acts) }))
PY
}

export GOAL ACTS="$ACTIONS_JSON"
if command -v node >/dev/null 2>&1; then
  payload=$(make_payload_with_node)
elif command -v python3 >/dev/null 2>&1; then
  payload=$(make_payload_with_python)
else
  echo "Need node or python3 to build JSON payload." >&2
  exit 1
fi

echo "Posting DIRECT task to: ${ORCH_URL}/tasks" >&2
if command -v curl >/dev/null 2>&1; then
  curl -sS -X POST -H 'Content-Type: application/json' --data "$payload" "${ORCH_URL}/tasks"
  echo
else
  wget -qO- --header='Content-Type: application/json' --post-data="$payload" "${ORCH_URL}/tasks" || true
  echo
fi
