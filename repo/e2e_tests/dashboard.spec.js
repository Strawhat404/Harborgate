/**
 * E2E tests for the Dashboard page.
 * Tests: role-based stat cards, navigation links, quick actions.
 */
import { test, expect } from '@playwright/test';
import { setupIfNeeded, login, CREDENTIALS } from './helpers.js';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      indexedDB.deleteDatabase('harborgate');
      localStorage.clear();
    });
    await page.waitForTimeout(300);
    await setupIfNeeded(page);
  });

  test('admin sees all stat cards', async ({ page }) => {
    await login(page, CREDENTIALS.admin.username, CREDENTIALS.admin.password);
    await page.waitForTimeout(500);
    await expect(page.locator('.dashboard')).toBeVisible();
    await expect(page.locator('.stats-grid')).toBeVisible();
    // Admin should see reservations, devices, content, notifications, audit
    await expect(page.locator('text=Pending Reservations')).toBeVisible();
    await expect(page.locator('text=Online Devices')).toBeVisible();
    await expect(page.locator('text=Content for Review')).toBeVisible();
    await expect(page.locator('text=Unread Notifications')).toBeVisible();
    await expect(page.locator('text=Audit Entries')).toBeVisible();
  });

  test('dashboard shows user badge with username and role', async ({ page }) => {
    await login(page, CREDENTIALS.admin.username, CREDENTIALS.admin.password);
    await page.waitForTimeout(500);
    await expect(page.locator('.user-badge')).toContainText('admin');
  });

  test('stat cards are clickable and navigate', async ({ page }) => {
    await login(page, CREDENTIALS.admin.username, CREDENTIALS.admin.password);
    await page.waitForTimeout(500);
    const reservationCard = page.locator('[data-link="/reservations"]');
    await expect(reservationCard).toBeVisible({ timeout: 5000 });
    await reservationCard.click();
    await page.waitForTimeout(300);
    expect(page.url()).toContain('/reservations');
  });

  test('quick action buttons are present for admin', async ({ page }) => {
    await login(page, CREDENTIALS.admin.username, CREDENTIALS.admin.password);
    await page.waitForTimeout(500);
    await expect(page.locator('[data-action="new-reservation"]')).toBeVisible();
    await expect(page.locator('[data-action="unlock"]')).toBeVisible();
    await expect(page.locator('[data-action="review"]')).toBeVisible();
  });

  test('sidebar navigation is visible after login', async ({ page }) => {
    await login(page, CREDENTIALS.admin.username, CREDENTIALS.admin.password);
    await page.waitForTimeout(500);
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.locator('#nav')).toBeVisible();
  });
});
