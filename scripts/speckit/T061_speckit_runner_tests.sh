#!/usr/bin/env bash
set -euo pipefail

# Run SpecKit automation runner tests
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

npx jest --runTestsByPath tests/tasks/speckit-runner.test.ts "$@"
