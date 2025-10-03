#!/usr/bin/env bash
set -euo pipefail

# Posts a DIRECT actions task to the Linux Orchestrator to:
# - Install Miniforge (user, no sudo)
# - Install Anthropic CLI inside Miniforge
# - Add a robust claude() wrapper to ~/.bashrc
# - Verify function resolution and a success marker
#
# Usage:
#   scripts/post_linux_orchestrator_direct_install_claude_miniforge.sh [ORCH_URL]
# Default ORCH_URL: http://127.0.0.1:4101

ORCH_URL=${1:-http://127.0.0.1:4101}

ACTIONS_JSON=$(cat <<'JSON'
[
  { "action": "run_shell", "params": { "script": "set -e\nif [ ! -x \"$HOME/miniforge3/bin/python\" ]; then\n  arch=$(uname -m)\n  case \"$arch\" in\n    x86_64) url=\"https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-x86_64.sh\" ;;\n    aarch64|arm64) url=\"https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-aarch64.sh\" ;;\n    *) echo \"Unsupported arch: $arch\" 1>&2; exit 1 ;;\n  esac\n  tmp=\"/tmp/miniforge.sh\"\n  (wget -qO \"$tmp\" \"$url\" || curl -Lso \"$tmp\" \"$url\")\n  bash \"$tmp\" -b -p \"$HOME/miniforge3\"\nfi\n\"$HOME/miniforge3/bin/python\" -V" } },
  { "action": "run_shell", "params": { "script": "set -e\n\"$HOME/miniforge3/bin/python\" -m pip install -U pip\n\"$HOME/miniforge3/bin/pip\" install --upgrade anthropic\n\"$HOME/miniforge3/bin/anthropic\" --version || true" } },
  { "action": "run_shell", "params": { "script": "touch \"$HOME/.bashrc\"; if ! grep -q 'miniforge3/bin' \"$HOME/.bashrc\"; then echo 'export PATH=\"$HOME/miniforge3/bin:$PATH\"' >> \"$HOME/.bashrc\"; fi; if ! grep -q 'Orchestrator: claude helper (miniforge)' \"$HOME/.bashrc\"; then cat >> \"$HOME/.bashrc\" <<'FUNC'\n\n# Orchestrator: claude helper (miniforge)\nclaude() {\n  local model=\"${CLAUDE_MODEL:-claude-3-5-sonnet-latest}\"\n  local anth=\"$(command -v anthropic || echo \"$HOME/miniforge3/bin/anthropic\")\"\n  if [ ! -x \"$anth\" ]; then\n    echo \"anthropic CLI not found. Try: $HOME/miniforge3/bin/pip install anthropic\" 1>&2\n    return 127\n  fi\n  local input\n  if [ -t 0 ]; then input=\"$*\"; else input=\"$(cat -)\"; fi\n  \"$anth\" messages create --model \"$model\" --input \"$input\"\n}\nFUNC\nfi" } },
  { "action": "run_shell", "params": { "script": "if [ -x \"$HOME/miniforge3/bin/anthropic\" ] && grep -q 'claude()' \"$HOME/.bashrc\"; then touch /tmp/anthropic_installed.txt; echo OK_MARKER; else echo MISS_MARKER; exit 1; fi" } },
  { "action": "verify_result", "params": { "check_method": "test", "script": "bash -lc 'source ~/.bashrc >/dev/null 2>&1; type claude >/dev/null 2>&1 && echo OK_FUNC'", "expectation": "OK_FUNC" } },
  { "action": "verify_result", "params": { "check_method": "file_exists", "path": "/tmp/anthropic_installed.txt" } }
]
JSON
)

# Build payload with Node (preferred) or Python if needed
make_payload_with_node() {
  node -e 'const acts=JSON.parse(process.env.ACTS||"[]"); console.log(JSON.stringify({ goal: "Install Miniforge (user), install Anthropic CLI, add claude(), verify.", actions: acts }))'
}

make_payload_with_python() {
  python3 - <<'PY'
import json, os
acts = os.environ.get('ACTS','[]')
print(json.dumps({ 'goal': 'Install Miniforge (user), install Anthropic CLI, add claude(), verify.', 'actions': json.loads(acts) }))
PY
}

export ACTS="$ACTIONS_JSON"
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

