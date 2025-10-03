#!/usr/bin/env bash
set -euo pipefail

# Type-check the task submission endpoint after adding template support
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

npx tsc --noEmit src/api/endpoints/tasks.ts "$@"
