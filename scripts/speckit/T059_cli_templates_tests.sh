#!/usr/bin/env bash
set -euo pipefail

# Run CLI template helper tests
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

npx jest --runTestsByPath tests/cli/templates.test.ts "$@"
