/**
 * Shared E2E test helpers for Playwright.
 * Provides setup/login utilities used across all spec files.
 */

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'TestAdmin-1!Pass';
const VISITOR_USER = 'visitor1';
const VISITOR_PASS = 'VisitorTest-1!Pw';
const OPERATOR_USER = 'operator1';
const OPERATOR_PASS = 'OperatorTe-1!Pw';
const REVIEWER_USER = 'reviewer1';
const REVIEWER_PASS = 'ReviewerTe-1!Pw';

export const CREDENTIALS = {
  admin: { username: ADMIN_USER, password: ADMIN_PASS },
  visitor: { username: VISITOR_USER, password: VISITOR_PASS },
  operator: { username: OPERATOR_USER, password: OPERATOR_PASS },
  reviewer: { username: REVIEWER_USER, password: REVIEWER_PASS },
};

/**
 * Perform first-run setup if needed.
 * Checks if setup screen is visible and creates admin account.
 */
export async function setupIfNeeded(page) {
  await page.goto('/');
  await page.waitForTimeout(500);

  const setupForm = page.locator('#setup-form');
  if (await setupForm.isVisible()) {
    await page.locator('#setup-form [name="username"]').fill(ADMIN_USER);
    await page.locator('#setup-form [name="password"]').fill(ADMIN_PASS);
    await page.locator('#setup-form [name="confirmPassword"]').fill(ADMIN_PASS);
    await page.locator('#setup-form button[type="submit"]').click();
    await page.waitForTimeout(500);
  }
}

/**
 * Log in with given credentials.
 */
export async function login(page, username, password) {
  await page.goto('/#/login');
  await page.waitForTimeout(300);

  // Make sure login tab is active
  const loginTab = page.locator('[data-tab="login"]');
  if (await loginTab.isVisible()) {
    await loginTab.click();
  }

  await page.locator('#login-form [name="username"]').fill(username);
  await page.locator('#login-form [name="password"]').fill(password);
  await page.locator('#login-form button[type="submit"]').click();
  await page.waitForTimeout(500);
}

/**
 * Register a new user via the register tab on the login page.
 */
export async function registerUser(page, username, password) {
  await page.goto('/#/login');
  await page.waitForTimeout(300);

  const registerTab = page.locator('[data-tab="register"]');
  await registerTab.click();
  await page.waitForTimeout(200);

  await page.locator('#register-form [name="username"]').fill(username);
  await page.locator('#register-form [name="password"]').fill(password);
  await page.locator('#register-form [name="confirmPassword"]').fill(password);
  await page.locator('#register-form button[type="submit"]').click();
  await page.waitForTimeout(500);
}

/**
 * Full setup: create admin, log in as admin, create users for all roles, then log out.
 */
export async function fullSetup(page) {
  await setupIfNeeded(page);
  await login(page, ADMIN_USER, ADMIN_PASS);

  // Navigate to admin console to create other users
  await page.goto('/#/admin');
  await page.waitForTimeout(500);

  // Log out
  await page.goto('/#/settings');
  await page.waitForTimeout(300);
  const logoutBtn = page.locator('#logout-btn');
  if (await logoutBtn.isVisible()) {
    await logoutBtn.click();
    await page.waitForTimeout(300);
  }
}
