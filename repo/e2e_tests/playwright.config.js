import { defineConfig } from '@playwright/test';

/**
 * Playwright configuration for HarborGate E2E tests.
 *
 * Running E2E tests requires the web server to be started first:
 *   docker compose up -d web          # starts nginx on port 8080
 *   docker compose --profile e2e run --rm e2e-runner
 *
 * Or from the host (with Playwright installed locally):
 *   docker compose up -d web
 *   npx playwright test --config=e2e_tests/playwright.config.js
 */
export default defineConfig({
  testDir: '.',
  timeout: 30000,
  retries: 0,
  use: {
    /* When running inside the docker-compose e2e-runner container, the web
       service is reachable at http://web:80 via Docker DNS.  When running on
       the host, it's http://localhost:8080.  The PLAYWRIGHT_BASE_URL env var
       (set in docker-compose.yml for the e2e-runner service) takes precedence
       over the baseURL below. */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080',
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10000,
    screenshot: 'only-on-failure',
  },
  /* No webServer block — the web service is started externally via
     docker compose.  Attempting to run `docker compose` from inside the
     Playwright container would fail because Docker is not available there. */
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
