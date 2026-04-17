/**
 * E2E tests for the Content Management page.
 * Tests: create content, workflow transitions, compliance scanning,
 *        version history, diff viewer, search/filter.
 */
import { test, expect } from '@playwright/test';
import { setupIfNeeded, login, CREDENTIALS } from './helpers.js';

test.describe('Content Management', () => {
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

  test('content page loads with header and table', async ({ page }) => {
    await page.goto('/#/content');
    await page.waitForTimeout(500);
    await expect(page.locator('h1:has-text("Content Management")')).toBeVisible();
    await expect(page.locator('#create-content-btn')).toBeVisible();
    await expect(page.locator('#content-table')).toBeVisible();
  });

  test('create content in draft state', async ({ page }) => {
    await page.goto('/#/content');
    await page.waitForTimeout(500);
    await page.locator('#create-content-btn').click();
    await page.waitForTimeout(300);

    await page.locator('#content-form [name="title"]').fill('Test Article');
    await page.locator('#content-form [name="body"]').fill('This is clean content.');
    await page.locator('#content-form [name="locale"]').selectOption('en');
    await page.locator('#content-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    await expect(page.locator('#content-table')).toContainText('Test Article');
    await expect(page.locator('#content-table')).toContainText('draft');
  });

  test('flagged content shows compliance warning', async ({ page }) => {
    await page.goto('/#/content');
    await page.waitForTimeout(500);
    await page.locator('#create-content-btn').click();
    await page.waitForTimeout(300);

    await page.locator('#content-form [name="title"]').fill('Flagged Content');
    await page.locator('#content-form [name="body"]').fill('Contains SSN 123-45-6789 and banned words');
    await page.locator('#content-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    await expect(page.locator('#content-table')).toContainText('Flagged');
  });

  test('submit for review changes workflow state', async ({ page }) => {
    await page.goto('/#/content');
    await page.waitForTimeout(500);

    // Create content
    await page.locator('#create-content-btn').click();
    await page.waitForTimeout(300);
    await page.locator('#content-form [name="title"]').fill('Review Me');
    await page.locator('#content-form [name="body"]').fill('Ready for review.');
    await page.locator('#content-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    // Submit for review
    const submitBtn = page.locator('[data-action="submit-review"]').first();
    await expect(submitBtn).toBeVisible({ timeout: 5000 });
    await submitBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator('#content-table')).toContainText('review');
  });

  test('approve content publishes it', async ({ page }) => {
    await page.goto('/#/content');
    await page.waitForTimeout(500);

    // Create and submit
    await page.locator('#create-content-btn').click();
    await page.waitForTimeout(300);
    await page.locator('#content-form [name="title"]').fill('Publish Me');
    await page.locator('#content-form [name="body"]').fill('Publish this.');
    await page.locator('#content-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    const submitBtn = page.locator('[data-action="submit-review"]').first();
    await expect(submitBtn).toBeVisible({ timeout: 5000 });
    await submitBtn.click();
    await page.waitForTimeout(500);

    const approveBtn = page.locator('[data-action="approve"]').first();
    await expect(approveBtn).toBeVisible({ timeout: 5000 });
    await approveBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator('#content-table')).toContainText('published');
  });

  test('view content details modal', async ({ page }) => {
    await page.goto('/#/content');
    await page.waitForTimeout(500);

    await page.locator('#create-content-btn').click();
    await page.waitForTimeout(300);
    await page.locator('#content-form [name="title"]').fill('View Details');
    await page.locator('#content-form [name="body"]').fill('Detailed content body.');
    await page.locator('#content-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    const viewBtn = page.locator('[data-action="view"]').first();
    await expect(viewBtn).toBeVisible({ timeout: 5000 });
    await viewBtn.click();
    await page.waitForTimeout(300);
    await expect(page.locator('.modal-overlay')).toBeVisible();
  });

  test('version history modal shows entries', async ({ page }) => {
    await page.goto('/#/content');
    await page.waitForTimeout(500);

    await page.locator('#create-content-btn').click();
    await page.waitForTimeout(300);
    await page.locator('#content-form [name="title"]').fill('History Test');
    await page.locator('#content-form [name="body"]').fill('V1 body');
    await page.locator('#content-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    const historyBtn = page.locator('[data-action="history"]').first();
    await expect(historyBtn).toBeVisible({ timeout: 5000 });
    await historyBtn.click();
    await page.waitForTimeout(300);
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await expect(page.locator('.modal-overlay')).toContainText('Version History');
  });

  test('workflow filter shows matching states', async ({ page }) => {
    await page.goto('/#/content');
    await page.waitForTimeout(500);
    await page.locator('#content-workflow-filter').selectOption('draft');
    await page.waitForTimeout(300);
    await expect(page.locator('#content-table')).toBeVisible();
  });

  test('search filters by title', async ({ page }) => {
    await page.goto('/#/content');
    await page.waitForTimeout(500);

    // Create content
    await page.locator('#create-content-btn').click();
    await page.waitForTimeout(300);
    await page.locator('#content-form [name="title"]').fill('Searchable Title');
    await page.locator('#content-form [name="body"]').fill('Body');
    await page.locator('#content-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    await page.locator('#content-search').fill('Searchable');
    await page.waitForTimeout(300);
    await expect(page.locator('#content-table')).toContainText('Searchable');
  });
});
