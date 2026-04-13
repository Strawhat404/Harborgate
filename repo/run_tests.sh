#!/usr/bin/env bash
set -euo pipefail

# Run all tests inside a Docker container to avoid host package/version mismatches.
# Uses node:20-alpine for a lightweight, reproducible environment.

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Running unit + API tests in Docker (node:20-alpine) ==="

docker run --rm \
  -v "${REPO_DIR}:/app:ro" \
  -w /app \
  node:20-alpine \
  sh -c "node --test unit_tests/*.test.js API_tests/*.test.js"

echo "=== All tests passed ==="
