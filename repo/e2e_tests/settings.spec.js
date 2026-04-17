/**
 * E2E tests for the Settings page.
 * Tests: session info, theme toggle, encryption test, import/export, logout.
 */
import { test, expect } from '@playwright/test';
import { setupIfNeeded, login, CREDENTIALS } from './helpers.js';

test.describe('Settings', () => {
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

  test('settings page loads with all sections', async ({ page }) => {
    await page.goto('/#/settings');
    await page.waitForTimeout(500);
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible();
    await expect(page.locator('text=Session')).toBeVisible();
    await expect(page.locator('text=Appearance')).toBeVisible();
    await expect(page.locator('text=Encryption Test')).toBeVisible();
  });

  test('displays logged-in user info', async ({ page }) => {
    await page.goto('/#/settings');
    await page.waitForTimeout(500);
    await expect(page.locator('text=admin')).toBeVisible();
  });

  test('theme selector changes theme', async ({ page }) => {
    await page.goto('/#/settings');
    await page.waitForTimeout(500);
    await page.locator('#theme-select').selectOption('dark');
    await page.waitForTimeout(300);

    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('dark');

    const stored = await page.evaluate(() => localStorage.getItem('hg_theme'));
    expect(stored).toBe('dark');
  });

  test('encryption test encrypts and decrypts', async ({ page }) => {
    await page.goto('/#/settings');
    await page.waitForTimeout(500);

    await page.locator('#enc-password').fill('testpassword');
    await page.locator('#enc-test').fill('Hello World');
    await page.locator('#encrypt-btn').click();
    await page.waitForTimeout(300);

    const encrypted = await page.locator('#crypto-result').textContent();
    expect(encrypted.length).toBeGreaterThan(0);

    await page.locator('#decrypt-btn').click();
    await page.waitForTimeout(300);

    const decrypted = await page.locator('#enc-test').inputValue();
    expect(decrypted).toBe('Hello World');
  });

  test('admin sees import/export section', async ({ page }) => {
    await page.goto('/#/settings');
    await page.waitForTimeout(500);
    await expect(page.locator('text=Import / Export')).toBeVisible();
    await expect(page.locator('#export-btn')).toBeVisible();
    await expect(page.locator('#import-btn')).toBeVisible();
  });

  test('export requires password — shows error toast when empty', async ({ page }) => {
    await page.goto('/#/settings');
    await page.waitForTimeout(500);
    // Ensure backup-password field is empty
    await page.locator('#backup-password').fill('');
    // Click export without entering a password
    await page.locator('#export-btn').click();
    await page.waitForTimeout(500);
    // The handler calls showNotification('A backup password is required...', 'error')
    // which appends a .toast-error element inside a .toast-container
    await expect(page.locator('.toast-container .toast-error')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.toast-container')).toContainText('password is required');
  });

  test('admin sees data management section', async ({ page }) => {
    await page.goto('/#/settings');
    await page.waitForTimeout(500);
    await expect(page.locator('text=Data Management')).toBeVisible();
    await expect(page.locator('#clear-all-data')).toBeVisible();
  });

  test('logout redirects to login', async ({ page }) => {
    await page.goto('/#/settings');
    await page.waitForTimeout(500);
    await page.locator('#logout-btn').click();
    await page.waitForTimeout(500);
    expect(page.url()).toContain('/login');
  });
});
