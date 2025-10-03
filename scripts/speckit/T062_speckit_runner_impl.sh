#!/usr/bin/env bash
set -euo pipefail

# Type-check SpecKit automation runner implementation
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

npx tsc --noEmit src/tasks/speckit-runner.ts "$@"
