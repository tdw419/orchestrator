#!/usr/bin/env bash
set -euo pipefail

# Type-check CLI template helper implementation
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

npx tsc --noEmit src/cli/templates.ts "$@"
