#!/usr/bin/env bash
set -euo pipefail

# Posts a task to the Linux Orchestrator to install CodeBuff (Java),
# build the jar, and create a formatter+LLM patch script wired to
# LM Studio (OpenAI-compatible endpoint). It then verifies installation.
#
# Usage:
#   scripts/post_linux_orchestrator_task_setup_codebuff_lmstudio.sh [ORCH_URL]
#
# Default ORCH_URL: http://127.0.0.1:4101

ORCH_URL=${1:-http://127.0.0.1:4101}

GOAL=$(cat <<'EOF'
Use run_shell to install CodeBuff and wire it to a local LLM served by LM Studio, then verify with verify_result. Execute these as separate tool actions:

1) Ensure dependencies (Java 17, Maven, Git, curl, jq, patch) are installed (attempt non-interactive sudo, fall back gracefully):
   Script:
   set -euo pipefail
   if command -v apt-get >/dev/null 2>&1; then
     if sudo -n true 2>/dev/null; then SUDO="sudo -n"; else SUDO="sudo"; fi
     $SUDO apt-get update -y
     $SUDO apt-get install -y openjdk-17-jre maven git curl jq patch
   else
     echo "apt-get not found; please install Java 17, Maven, Git, curl, jq, and patch using your package manager" >&2
   fi

2) Clone CodeBuff (if missing) and build the uber jar. Create a stable symlink at ~/.local/share/codebuff/codebuff.jar pointing to the built jar:
   Script:
   set -euo pipefail
   mkdir -p "$HOME/.local/share/codebuff"
   if [ ! -d "$HOME/codebuff" ]; then git clone https://github.com/antlr/codebuff.git "$HOME/codebuff"; fi
   cd "$HOME/codebuff"
   mvn -q -DskipTests package
   JAR_PATH=$(ls -1 target/codebuff-*-jar-with-dependencies.jar | head -n1)
   if [ ! -f "$JAR_PATH" ]; then echo "CodeBuff jar not found" >&2; exit 1; fi
   ln -sf "$(pwd)/$JAR_PATH" "$HOME/.local/share/codebuff/codebuff.jar"
   echo "Jar at: $HOME/.local/share/codebuff/codebuff.jar"

3) Create ~/bin/format_and_fix.sh that formats code via CodeBuff, then asks the local LLM for a minimal unified diff and applies it. Default BASE_URL=http://localhost:1234/v1 (LM Studio) and MODEL=qwen2.5-coder:7b, overridable via env:
   Script:
   mkdir -p "$HOME/bin"
   cat > "$HOME/bin/format_and_fix.sh" <<'BASH'
#!/usr/bin/env bash
set -euo pipefail

show_help() {
  cat <<'HLP'
Usage: format_and_fix.sh [/path/to/codebuff.jar] /path/to/file

Environment:
  BASE_URL  OpenAI-compatible base (default http://localhost:1234/v1)
  MODEL     Model name/id (default qwen2.5-coder:7b)
  CODEBUFF_JAR  Path to CodeBuff jar (default ~/.local/share/codebuff/codebuff.jar)

Example:
  BASE_URL=http://localhost:1234/v1 MODEL="qwen2.5-coder:7b" \
    format_and_fix.sh ~/.local/share/codebuff/codebuff.jar my.py
HLP
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  show_help; exit 0
fi

if [ $# -lt 1 ]; then
  echo "Usage: $0 [/path/to/codebuff.jar] /path/to/file" >&2
  exit 1
fi

CODEBUFF_DEFAULT="$HOME/.local/share/codebuff/codebuff.jar"

if [ $# -eq 1 ]; then
  CODEBUFF_JAR="${CODEBUFF_JAR:-$CODEBUFF_DEFAULT}"
  FILE="$1"
else
  CODEBUFF_JAR="$1"
  FILE="$2"
fi

if [ ! -f "$FILE" ]; then
  echo "File not found: $FILE" >&2
  exit 1
fi
if [ ! -f "$CODEBUFF_JAR" ]; then
  echo "CodeBuff jar not found: $CODEBUFF_JAR" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required (sudo apt-get install -y jq)" >&2
  exit 1
fi
if ! command -v patch >/dev/null 2>&1; then
  echo "patch is required (sudo apt-get install -y patch)" >&2
  exit 1
fi

BASE_URL="${BASE_URL:-http://localhost:1234/v1}"
MODEL="${MODEL:-qwen2.5-coder:7b}"

# 1) Format with CodeBuff (stdout) then replace original
TMP="$(mktemp)"
java -jar "$CODEBUFF_JAR" -rewrite -file "$FILE" > "$TMP"
mv "$TMP" "$FILE"

# 2) Ask local LLM for a minimal unified diff; apply if valid
PROMPT=$(cat <<'EOF'
You are a careful code editor. Produce a minimal UNIX unified diff (patch)
to improve clarity, fix obvious issues, and follow idioms, without changing
observable behavior. Do NOT include any prose before or after the diff.

Rules:
- Output ONLY a valid unified diff (---/+++/@@ hunks).
- Keep changes small and justifiable.
- If no changes needed, output an empty diff.
EOF
)

REQ=$(jq -n --arg model "$MODEL" --arg sys "$PROMPT" --arg path "$FILE" --arg code "$(cat "$FILE")" '{
  model: $model,
  messages: [
    {role:"system", content:$sys},
    {role:"user", content:("File path: " + $path + "\n\n```code\n" + $code + "\n```")}
  ],
  temperature: 0
}')

RESP=$(curl -s "$BASE_URL/chat/completions" -H 'Content-Type: application/json' -d "$REQ")
DIFF=$(echo "$RESP" | jq -r '.choices[0].message.content // ""')

# Strip code fences if present
DIFF_CLEAN=$(echo "$DIFF" | sed -e '1,2{/^```/d}' -e '${/^```/d}')

if [ -n "$DIFF_CLEAN" ] && echo "$DIFF_CLEAN" | grep -q '^--- '; then
  if ! echo "$DIFF_CLEAN" | patch -p0 --quiet; then
    echo "Patch failed. Showing diff:" >&2
    echo "$DIFF_CLEAN"
    exit 2
  fi
else
  echo "No LLM patch applied (empty or invalid diff)."
fi

echo "Done: $FILE"
BASH
   chmod +x "$HOME/bin/format_and_fix.sh"

4) Ensure ~/bin is on PATH in ~/.bashrc (idempotent):
   Script:
   touch "$HOME/.bashrc"
   if ! grep -q 'export PATH="$HOME/bin:$PATH"' "$HOME/.bashrc"; then echo 'export PATH="$HOME/bin:$PATH"' >> "$HOME/.bashrc"; fi

5) Verify the jar symlink exists and the formatter script is executable using verify_result (test) and (file_exists):
   Script:
   bash -lc '[[ -x "$HOME/bin/format_and_fix.sh" ]] && echo OK_FMT'
   Expectation: OK_FMT

6) Verify using verify_result with check_method file_exists and the path $HOME/.local/share/codebuff/codebuff.jar. Only after both verifications pass, mark done with a brief summary including paths to the jar and script.

Notes:
- Do NOT fail the task if LM Studio is not running; the script should still be installed and ready.
- Use ONLY run_shell and verify_result; do not call external LLMs directly from the orchestrator.
- Keep steps idempotent so re-running won’t break the setup.
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
