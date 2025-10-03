#!/usr/bin/env bash
set -euo pipefail

# Type-check the template rendering implementation
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

npx tsc --noEmit src/tasks/templates.ts "$@"
