#!/usr/bin/env bash
set -euo pipefail

# Run all tests inside a Docker container to avoid host package/version mismatches.
# Uses node:20-alpine for a lightweight, reproducible environment.

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Running unit + integration tests in Docker (node:20-alpine) ==="

docker run --rm \
  -v "${REPO_DIR}:/app:ro" \
  -w /app \
  node:20-alpine \
  sh -c "node --test unit_tests/*.test.js integration_tests/*.test.js"

echo "=== All unit + integration tests passed ==="
echo ""
echo "Other test commands:"
echo ""
echo "  Coverage report (c8 + lcov):"
echo "    docker compose --profile coverage run --rm coverage-runner"
echo ""
echo "  E2E browser tests (Playwright):"
echo "    docker compose up -d web"
echo "    docker compose --profile e2e run --rm e2e-runner"
