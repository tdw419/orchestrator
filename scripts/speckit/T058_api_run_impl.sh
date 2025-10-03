#!/usr/bin/env bash
set -euo pipefail

# Type-check template run endpoint implementation
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

npx tsc --noEmit src/api/templates/run.ts "$@"
