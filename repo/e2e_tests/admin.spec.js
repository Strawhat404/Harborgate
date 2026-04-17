/**
 * E2E tests for the Admin Console page.
 * Tests: user management, audit log, reports, rate limits, tab switching.
 */
import { test, expect } from '@playwright/test';
import { setupIfNeeded, login, CREDENTIALS } from './helpers.js';

test.describe('Admin Console', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      indexedDB.deleteDatabase('harborgate');
      localStorage.clear();
    });
    await page.waitForTimeout(300);
    await setupIfNeeded(page);
    await login(page, CREDENTIALS.admin.username, CREDENTIALS.admin.password);
    await page.waitForTimeout(500);
  });

  test('admin page loads with tabs', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForTimeout(500);
    await expect(page.locator('h1:has-text("Admin Console")')).toBeVisible();
    await expect(page.locator('[data-tab="users"]')).toBeVisible();
    await expect(page.locator('[data-tab="audit"]')).toBeVisible();
    await expect(page.locator('[data-tab="reports"]')).toBeVisible();
    await expect(page.locator('[data-tab="rate-limits"]')).toBeVisible();
  });

  test('users tab shows user table', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForTimeout(500);
    await expect(page.locator('#tab-users')).toBeVisible();
    await expect(page.locator('#users-table')).toBeVisible();
    await expect(page.locator('#users-table')).toContainText('admin');
  });

  test('audit tab shows audit log', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForTimeout(500);
    await page.locator('[data-tab="audit"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#tab-audit')).toBeVisible();
    await expect(page.locator('#audit-table')).toBeVisible();
  });

  test('reports tab shows report management', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForTimeout(500);
    await page.locator('[data-tab="reports"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#tab-reports')).toBeVisible();
    await expect(page.locator('#create-report-btn')).toBeVisible();
  });

  test('rate limits tab shows rule management', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForTimeout(500);
    await page.locator('[data-tab="rate-limits"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#tab-rate-limits')).toBeVisible();
    await expect(page.locator('#create-rate-limit-btn')).toBeVisible();
  });

  test('create report via modal', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForTimeout(500);
    await page.locator('[data-tab="reports"]').click();
    await page.waitForTimeout(300);
    await page.locator('#create-report-btn').click();
    await page.waitForTimeout(300);

    await page.locator('#report-form [name="title"]').fill('Test Incident');
    await page.locator('#report-form [name="type"]').selectOption('incident');
    await page.locator('#report-form [name="description"]').fill('Test incident description');
    await page.locator('#report-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    await expect(page.locator('#reports-table')).toContainText('Test Incident');
  });

  test('create rate limit rule', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForTimeout(500);
    await page.locator('[data-tab="rate-limits"]').click();
    await page.waitForTimeout(300);
    await page.locator('#create-rate-limit-btn').click();
    await page.waitForTimeout(300);

    await page.locator('#rate-limit-form [name="scope"]').selectOption('user');
    await page.locator('#rate-limit-form [name="action"]').fill('test_action');
    await page.locator('#rate-limit-form [name="maxCount"]').fill('10');
    await page.locator('#rate-limit-form [name="windowSec"]').fill('3600');
    await page.locator('#rate-limit-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    await expect(page.locator('#rate-limits-table')).toContainText('test_action');
  });

  test('audit log filter by actor', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForTimeout(500);
    await page.locator('[data-tab="audit"]').click();
    await page.waitForTimeout(300);
    await page.locator('#audit-actor-filter').fill('admin');
    await page.waitForTimeout(300);
    await expect(page.locator('#audit-table')).toBeVisible();
  });

  test('ban user button is present', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForTimeout(500);
    // The ban button should exist for at least the admin user
    const banBtn = page.locator('[data-action="ban"]').first();
    await expect(banBtn).toBeVisible();
  });

  test('change role button opens modal', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForTimeout(500);
    const roleBtn = page.locator('[data-action="change-role"]').first();
    await expect(roleBtn).toBeVisible({ timeout: 5000 });
    await roleBtn.click();
    await page.waitForTimeout(300);
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await expect(page.locator('#role-form')).toBeVisible();
  });
});
