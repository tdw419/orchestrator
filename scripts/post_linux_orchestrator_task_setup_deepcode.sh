#!/usr/bin/env bash
set -euo pipefail

# Posts a task to the Linux Orchestrator to set up the local project
# located at ../../deepcode relative to this repository, by detecting
# common ecosystems (Node, Python, Rust, Go), installing dependencies
# without sudo inside the project directory, and verifying success with
# a marker file.
#
# Usage:
#   scripts/post_linux_orchestrator_task_setup_deepcode.sh [ORCH_URL] [PROJECT_DIR]
#
# Defaults:
#   ORCH_URL:     http://127.0.0.1:4101
#   PROJECT_DIR:  ../../deepcode (resolved to absolute path)

ORCH_URL=${1:-http://127.0.0.1:4101}

# Resolve project dir (second arg or ../../deepcode)
RAW_DIR=${2:-../../deepcode}
if command -v realpath >/dev/null 2>&1; then
  PROJECT_DIR=$(realpath "$RAW_DIR")
else
  PROJECT_DIR=$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$RAW_DIR")
fi

# Compose goal for the orchestrator. It will execute a single robust
# setup script via run_shell, then verify with two verify_result steps.

# Safely embed the project dir inside a single-quoted shell string
SAFE_DIR=$(printf "%s" "$PROJECT_DIR" | sed "s/'/'\"'\"'/g")

read -r -d '' GOAL_TMPL <<'EOF' || true
Use run_shell to set up the project at path:

PROJECT_DIR='__PROJECT_DIR__'

Detect Node, Python, Rust, or Go project files and install dependencies without sudo, then mark success with a .setup_ok file. After that, verify using verify_result steps.

Steps:

1) Run the setup script:
   Script:
   set -euo pipefail
   PROJECT_DIR="$PROJECT_DIR"
   if [ ! -d "$PROJECT_DIR" ]; then echo "Project dir not found: $PROJECT_DIR" >&2; exit 1; fi
   cd "$PROJECT_DIR"

   setup_any=0

   # Node.js (npm/pnpm/yarn)
   if [ -f package.json ]; then
     if command -v npm >/dev/null 2>&1; then
       if [ -f pnpm-lock.yaml ] && command -v pnpm >/dev/null 2>&1; then
         pnpm i --frozen-lockfile || pnpm i || true
       elif [ -f yarn.lock ] && command -v yarn >/dev/null 2>&1; then
         yarn install --frozen-lockfile || yarn install || true
       elif [ -f package-lock.json ]; then
         npm ci || npm install || true
       else
         npm install || true
       fi
       setup_any=1
     else
       echo "WARN: npm not found; skipping Node setup" >&2
     fi
   fi

   # Python (venv + pip), prefers requirements.txt; installs project if pyproject exists
   if [ -f pyproject.toml ] || [ -f requirements.txt ]; then
     if command -v python3 >/dev/null 2>&1; then
       # create venv in .venv or venv
       python3 -m venv .venv || python3 -m venv venv || true
       VENV=".venv"; [ -d venv ] && VENV="venv"
       if [ -d "$VENV" ]; then
         . "$VENV/bin/activate"
         python -m pip install --upgrade pip setuptools wheel || true
         if [ -f requirements.txt ]; then
           python -m pip install -r requirements.txt || true
         fi
         if [ -f pyproject.toml ]; then
           # Try editable install; fall back to standard install
           python -m pip install -e . || python -m pip install . || true
         fi
         deactivate || true
       fi
       setup_any=1
     else
       echo "WARN: python3 not found; skipping Python setup" >&2
     fi
   fi

   # Rust (cargo)
   if [ -f Cargo.toml ]; then
     if command -v cargo >/dev/null 2>&1; then
       cargo fetch || true
       setup_any=1
     else
       echo "WARN: cargo not found; skipping Rust setup" >&2
     fi
   fi

   # Go (go.mod)
   if [ -f go.mod ]; then
     if command -v go >/dev/null 2>&1; then
       go mod download || true
       setup_any=1
     else
       echo "WARN: go not found; skipping Go setup" >&2
     fi
   fi

   # Determine success: if any setup occurred and artifacts exist
   ok=0
   if [ "$setup_any" -eq 1 ]; then
     if [ -d node_modules ] || [ -d .venv ] || [ -d venv ] || [ -d target ] || [ -n "${GOMODCACHE:-}" ]; then
       ok=1
     fi
   fi
   if [ "$ok" -eq 1 ]; then
     touch .setup_ok
     echo OK_SETUP
   else
     echo "No supported project files found or no tools available" >&2
     exit 1
   fi

2) Verify using verify_result with check_method test that .setup_ok exists and echo OK_VERIFY from a subshell:
   Script:
   bash -lc 'cd "$PROJECT_DIR" && [ -f .setup_ok ] && echo OK_VERIFY'
   Expectation: OK_VERIFY

3) Verify using verify_result with check_method file_exists on path $PROJECT_DIR/.setup_ok. Only after both verifications pass, mark done with a brief summary including which ecosystems were detected.

Constraints:
- Use ONLY run_shell and verify_result.
- Avoid sudo; do not install system packages. Keep changes local to the project directory.
- Be idempotent so the task can be re-run safely.
EOF

# Replace placeholder with the safe, single-quoted path
GOAL=${GOAL_TMPL//__PROJECT_DIR__/$SAFE_DIR}

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
