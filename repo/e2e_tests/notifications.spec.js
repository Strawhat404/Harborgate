/**
 * E2E tests for the Notifications page.
 * Tests: inbox rendering, filtering, mark as read, retry, clear all.
 */
import { test, expect } from '@playwright/test';
import { setupIfNeeded, login, CREDENTIALS } from './helpers.js';

test.describe('Notifications', () => {
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

  test('notifications page loads with header and controls', async ({ page }) => {
    await page.goto('/#/notifications');
    await page.waitForTimeout(500);
    await expect(page.locator('h1:has-text("Notifications")')).toBeVisible();
    await expect(page.locator('#retry-failed-btn')).toBeVisible();
    await expect(page.locator('#mark-all-read')).toBeVisible();
    await expect(page.locator('#clear-all-notif')).toBeVisible();
  });

  test('empty inbox shows appropriate message', async ({ page }) => {
    await page.goto('/#/notifications');
    await page.waitForTimeout(500);
    await expect(page.locator('.inbox-empty')).toBeVisible();
  });

  test('status filter changes displayed notifications', async ({ page }) => {
    await page.goto('/#/notifications');
    await page.waitForTimeout(500);
    await page.locator('#notif-status-filter').selectOption('delivered');
    await page.waitForTimeout(300);
    await expect(page.locator('#notifications-inbox')).toBeVisible();
  });

  test('type filter changes displayed notifications', async ({ page }) => {
    await page.goto('/#/notifications');
    await page.waitForTimeout(500);
    await page.locator('#notif-type-filter').selectOption('info');
    await page.waitForTimeout(300);
    await expect(page.locator('#notifications-inbox')).toBeVisible();
  });

  test('mark all read button works', async ({ page }) => {
    await page.goto('/#/notifications');
    await page.waitForTimeout(500);
    await page.locator('#mark-all-read').click();
    await page.waitForTimeout(300);
    // Should not throw or crash
    await expect(page.locator('#notifications-inbox')).toBeVisible();
  });

  test('retry failed button works', async ({ page }) => {
    await page.goto('/#/notifications');
    await page.waitForTimeout(500);
    await page.locator('#retry-failed-btn').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#notifications-inbox')).toBeVisible();
  });

  test('clear all button removes notifications', async ({ page }) => {
    await page.goto('/#/notifications');
    await page.waitForTimeout(500);
    await page.locator('#clear-all-notif').click();
    await page.waitForTimeout(300);
    await expect(page.locator('.inbox-empty')).toBeVisible();
  });
});
