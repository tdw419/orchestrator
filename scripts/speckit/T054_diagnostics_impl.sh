#!/usr/bin/env bash
set -euo pipefail

# Type-check the task manager after wiring the diagnostics hook
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

npx tsc --noEmit src/tasks/manager.ts "$@"
