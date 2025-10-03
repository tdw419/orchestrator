#!/usr/bin/env bash
set -euo pipefail

# One-shot bootstrap:
# - Ensures Node.js 18+ via nvm (no sudo)
# - Builds and starts the Linux orchestrator
# - Waits for health endpoint
# - Posts the "install AnthropIC CLI + claude() for VS Code" task via the orchestrator
#
# Usage: run from repo root (orchestrator/orchestrator)
#   bash scripts/bootstrap_linux_orchestrator_and_install_claude.sh
#
# Options (env vars):
#   ORCH_PORT   default 4101
#   OPENAI_API_BASE default http://127.0.0.1:1234/v1 (LM Studio)
#   ORCH_MODEL  default qwen2.5-coder-1.5b

ORCH_PORT=${ORCH_PORT:-4101}
OPENAI_API_BASE=${OPENAI_API_BASE:-http://127.0.0.1:1234/v1}
ORCH_MODEL=${ORCH_MODEL:-qwen2.5-coder-1.5b}

echo "[bootstrap] Using ORCH_PORT=${ORCH_PORT} OPENAI_API_BASE=${OPENAI_API_BASE} ORCH_MODEL=${ORCH_MODEL}" >&2

need_node() {
  if command -v node >/dev/null 2>&1; then
    v=$(node -v | sed 's/^v//')
    major=${v%%.*}
    if [ "${major}" -ge 18 ]; then return 1; fi
  fi
  return 0
}

install_nvm_and_node() {
  echo "[bootstrap] Installing Node via nvm (no sudo)" >&2
  if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required. Please install curl and re-run." >&2
    exit 1
  fi
  export NVM_DIR="$HOME/.nvm"
  if [ ! -d "$NVM_DIR" ]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  fi
  # shellcheck disable=SC1090
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  nvm install 20
  nvm alias default 20
  echo "[bootstrap] Node: $(node -v), npm: $(npm -v)" >&2
}

start_orchestrator() {
  echo "[bootstrap] Installing deps and building linux-orchestrator" >&2
  pushd linux-orchestrator >/dev/null
  npm install
  echo "[bootstrap] Starting orchestrator in background on port ${ORCH_PORT}" >&2
  ORCH_PORT=${ORCH_PORT} OPENAI_API_BASE=${OPENAI_API_BASE} ORCH_MODEL=${ORCH_MODEL} \
    nohup npm start >/tmp/linux-orchestrator.out 2>&1 &
  popd >/dev/null
}

wait_for_health() {
  local url="http://127.0.0.1:${ORCH_PORT}/health"
  echo "[bootstrap] Waiting for health at ${url}" >&2
  for i in $(seq 1 60); do
    if command -v curl >/dev/null 2>&1; then
      if curl -fsS "$url" >/dev/null 2>&1; then
        echo "[bootstrap] Orchestrator is up" >&2
        return 0
      fi
    elif command -v wget >/dev/null 2>&1; then
      if wget -qO- "$url" >/dev/null 2>&1; then
        echo "[bootstrap] Orchestrator is up" >&2
        return 0
      fi
    else
      echo "[bootstrap] Neither curl nor wget available for health check; proceeding after a short delay" >&2
      sleep 3
      echo "[bootstrap] Orchestrator is up" >&2
      return 0
    fi
    sleep 1
  done
  echo "[bootstrap] Timed out waiting for orchestrator. See /tmp/linux-orchestrator.out" >&2
  exit 1
}

post_task() {
  echo "[bootstrap] Posting task via scripts/post_linux_orchestrator_task_install_claude.sh" >&2
  bash scripts/post_linux_orchestrator_task_install_claude.sh "http://127.0.0.1:${ORCH_PORT}" || {
    echo "[bootstrap] Failed to post task" >&2
    exit 1
  }
}

# Main
if need_node; then install_nvm_and_node; else echo "[bootstrap] Found Node $(node -v)" >&2; fi
start_orchestrator
wait_for_health
post_task
echo "[bootstrap] Done. Open http://127.0.0.1:${ORCH_PORT}/viewer and monitor the task." >&2
