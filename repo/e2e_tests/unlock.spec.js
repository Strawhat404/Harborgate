/**
 * E2E tests for the Remote Unlock page.
 * Tests: device grid, add device, unlock flow, drawer/modal,
 *        command outbox, reason validation.
 */
import { test, expect } from '@playwright/test';
import { setupIfNeeded, login, CREDENTIALS } from './helpers.js';

test.describe('Remote Unlock', () => {
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

  test('unlock page loads with header', async ({ page }) => {
    await page.goto('/#/unlock');
    await page.waitForTimeout(500);
    await expect(page.locator('h1:has-text("Remote Unlock")')).toBeVisible();
    await expect(page.locator('#add-device-btn')).toBeVisible();
  });

  test('add device via modal', async ({ page }) => {
    await page.goto('/#/unlock');
    await page.waitForTimeout(500);
    await page.locator('#add-device-btn').click();
    await page.waitForTimeout(300);

    await page.locator('#device-form [name="name"]').fill('Test Door');
    await page.locator('#device-form [name="type"]').selectOption('door');
    await page.locator('#device-form [name="zone"]').selectOption('lobby');
    await page.locator('#device-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    await expect(page.locator('.device-grid')).toContainText('Test Door');
  });

  test('unlock button opens drawer', async ({ page }) => {
    await page.goto('/#/unlock');
    await page.waitForTimeout(500);

    // Add a device first
    await page.locator('#add-device-btn').click();
    await page.waitForTimeout(300);
    await page.locator('#device-form [name="name"]').fill('Drawer Test');
    await page.locator('#device-form [name="type"]').selectOption('door');
    await page.locator('#device-form [name="zone"]').selectOption('lobby');
    await page.locator('#device-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    // Click unlock button
    const unlockBtn = page.locator('.unlock-btn').first();
    await expect(unlockBtn).toBeVisible({ timeout: 5000 });
    await unlockBtn.click();
    await page.waitForTimeout(300);
    await expect(page.locator('.drawer-overlay')).toBeVisible();
    await expect(page.locator('#unlock-form')).toBeVisible();
  });

  test('short reason shows validation error', async ({ page }) => {
    await page.goto('/#/unlock');
    await page.waitForTimeout(500);

    await page.locator('#add-device-btn').click();
    await page.waitForTimeout(300);
    await page.locator('#device-form [name="name"]').fill('Validate Test');
    await page.locator('#device-form [name="type"]').selectOption('door');
    await page.locator('#device-form [name="zone"]').selectOption('lobby');
    await page.locator('#device-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    const unlockBtn = page.locator('.unlock-btn').first();
    await expect(unlockBtn).toBeVisible({ timeout: 5000 });
    await unlockBtn.click();
    await page.waitForTimeout(300);
    await page.locator('#unlock-form [name="reason"]').fill('short');
    await page.locator('#unlock-form button[type="submit"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#unlock-error')).toContainText('10 characters');
  });

  test('full unlock flow with confirmation modal', async ({ page }) => {
    await page.goto('/#/unlock');
    await page.waitForTimeout(500);

    await page.locator('#add-device-btn').click();
    await page.waitForTimeout(300);
    await page.locator('#device-form [name="name"]').fill('Full Flow Door');
    await page.locator('#device-form [name="type"]').selectOption('door');
    await page.locator('#device-form [name="zone"]').selectOption('lobby');
    await page.locator('#device-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    const unlockBtn = page.locator('.unlock-btn').first();
    await expect(unlockBtn).toBeVisible({ timeout: 5000 });
    await unlockBtn.click();
    await page.waitForTimeout(300);
    await page.locator('#unlock-form [name="reason"]').fill('Authorized visitor access for meeting');
    await page.locator('#unlock-form button[type="submit"]').click();
    await page.waitForTimeout(300);

    // Confirmation modal should appear
    await expect(page.locator('.modal-overlay')).toBeVisible();
    const confirmBtn = page.locator('#confirm-unlock-yes');
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();
    await page.waitForTimeout(500);
  });

  test('command outbox section is visible', async ({ page }) => {
    await page.goto('/#/unlock');
    await page.waitForTimeout(500);
    await expect(page.locator('text=Command Outbox')).toBeVisible();
  });
});
