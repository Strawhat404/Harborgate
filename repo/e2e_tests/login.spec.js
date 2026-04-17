/**
 * E2E tests for the Login page.
 * Tests: first-run setup, sign in, registration, password validation,
 *        tab switching, error display, account lockout.
 */
import { test, expect } from '@playwright/test';
import { setupIfNeeded, login, registerUser, CREDENTIALS } from './helpers.js';

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    // Clear IndexedDB to start fresh
    await page.goto('/');
    await page.evaluate(() => {
      indexedDB.deleteDatabase('harborgate');
      localStorage.clear();
    });
    await page.waitForTimeout(300);
  });

  test('first-run shows setup screen', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);
    await expect(page.locator('#setup-form')).toBeVisible();
    await expect(page.locator('text=No accounts exist')).toBeVisible();
  });

  test('admin setup creates account and redirects to login', async ({ page }) => {
    await setupIfNeeded(page);
    await page.waitForTimeout(500);
    // Should now be on login page
    await expect(page.locator('#login-form')).toBeVisible();
  });

  test('login with valid admin credentials redirects to dashboard', async ({ page }) => {
    await setupIfNeeded(page);
    await login(page, CREDENTIALS.admin.username, CREDENTIALS.admin.password);
    await page.waitForTimeout(500);
    await expect(page.locator('.dashboard')).toBeVisible();
  });

  test('login with wrong password shows error', async ({ page }) => {
    await setupIfNeeded(page);
    await login(page, CREDENTIALS.admin.username, 'WrongPassword-1!X');
    await expect(page.locator('#login-error')).not.toBeEmpty();
  });

  test('tab switching shows register form', async ({ page }) => {
    await setupIfNeeded(page);
    await page.goto('/#/login');
    await page.waitForTimeout(300);
    await page.locator('[data-tab="register"]').click();
    await expect(page.locator('#register-form')).toBeVisible();
    await expect(page.locator('#login-form')).toBeHidden();
  });

  test('register creates visitor account', async ({ page }) => {
    await setupIfNeeded(page);
    await registerUser(page, 'newvisitor', 'NewVisitor-1!Pw');
    // After registration, should switch to login tab
    await page.waitForTimeout(300);
    // Login with new account
    await login(page, 'newvisitor', 'NewVisitor-1!Pw');
    await page.waitForTimeout(500);
    await expect(page.locator('.dashboard')).toBeVisible();
  });

  test('register with weak password shows validation errors', async ({ page }) => {
    await setupIfNeeded(page);
    await page.goto('/#/login');
    await page.waitForTimeout(300);
    await page.locator('[data-tab="register"]').click();
    await page.locator('#register-form [name="username"]').fill('weakuser');
    await page.locator('#register-form [name="password"]').fill('weak');
    await page.locator('#register-form [name="confirmPassword"]').fill('weak');
    await page.locator('#register-form button[type="submit"]').click();
    await expect(page.locator('#register-error')).not.toBeEmpty();
  });

  test('register with mismatched passwords shows error', async ({ page }) => {
    await setupIfNeeded(page);
    await page.goto('/#/login');
    await page.waitForTimeout(300);
    await page.locator('[data-tab="register"]').click();
    await page.locator('#register-form [name="username"]').fill('mismatch');
    await page.locator('#register-form [name="password"]').fill('ValidPass-1!Long');
    await page.locator('#register-form [name="confirmPassword"]').fill('DifferentPw-1!L');
    await page.locator('#register-form button[type="submit"]').click();
    await expect(page.locator('#register-error')).toContainText('do not match');
  });

  test('password requirements update in real-time', async ({ page }) => {
    await setupIfNeeded(page);
    await page.goto('/#/login');
    await page.waitForTimeout(300);
    await page.locator('[data-tab="register"]').click();
    const pwInput = page.locator('#register-form [name="password"]');

    await pwInput.fill('abcdefghijkl');
    // Length met, lowercase met
    await expect(page.locator('#req-length')).toHaveClass('met');
    await expect(page.locator('#req-lower')).toHaveClass('met');
    await expect(page.locator('#req-upper')).not.toHaveClass('met');
  });

  test('account lockout after 5 failed attempts', async ({ page }) => {
    await setupIfNeeded(page);
    for (let i = 0; i < 5; i++) {
      await login(page, CREDENTIALS.admin.username, 'WrongPassword-1!X');
      await page.waitForTimeout(200);
    }
    // 6th attempt with correct password should show locked
    await login(page, CREDENTIALS.admin.username, CREDENTIALS.admin.password);
    await expect(page.locator('#login-error')).toContainText(/locked/i);
  });
});
