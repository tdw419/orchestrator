#!/usr/bin/env bash
set -euo pipefail

# Run API template submission tests
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

npx jest --runTestsByPath tests/api/templates.test.ts "$@"
