#!/usr/bin/env bash
set -euo pipefail

# Run verifier loader unit tests
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

npx jest --runTestsByPath tests/verifiers/loader.test.ts "$@"
