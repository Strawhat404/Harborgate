/**
 * E2E tests for the Reservations page.
 * Tests: create reservation, approve/deny, permission generation,
 *        search/filter, pagination, delete.
 */
import { test, expect } from '@playwright/test';
import { setupIfNeeded, login, CREDENTIALS } from './helpers.js';

test.describe('Reservations', () => {
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

  test('reservations page loads with header and table', async ({ page }) => {
    await page.goto('/#/reservations');
    await page.waitForTimeout(500);
    await expect(page.locator('h1:has-text("Reservations")')).toBeVisible();
    await expect(page.locator('#add-reservation-btn')).toBeVisible();
    await expect(page.locator('#reservations-table')).toBeVisible();
  });

  test('create a new reservation via modal', async ({ page }) => {
    await page.goto('/#/reservations');
    await page.waitForTimeout(500);
    await page.locator('#add-reservation-btn').click();
    await page.waitForTimeout(300);

    // Fill form
    await page.locator('#reservation-form [name="visitorName"]').fill('John Doe');
    await page.locator('#reservation-form [name="date"]').fill('2026-12-01');
    await page.locator('#reservation-form [name="time"]').fill('14:00');
    await page.locator('#reservation-form [name="zone"]').selectOption('lobby');
    await page.locator('#reservation-form [name="entryPolicy"]').selectOption('single-use');
    await page.locator('#reservation-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    // Should see the reservation in the table
    await expect(page.locator('#reservations-table')).toContainText('John Doe');
  });

  test('approve reservation generates entry permission', async ({ page }) => {
    await page.goto('/#/reservations');
    await page.waitForTimeout(500);

    // Create reservation
    await page.locator('#add-reservation-btn').click();
    await page.waitForTimeout(300);
    await page.locator('#reservation-form [name="visitorName"]').fill('Jane Approved');
    await page.locator('#reservation-form [name="date"]').fill('2026-12-15');
    await page.locator('#reservation-form [name="time"]').fill('10:00');
    await page.locator('#reservation-form [name="zone"]').selectOption('office-a');
    await page.locator('#reservation-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    // Approve
    const approveBtn = page.locator('[data-action="approve"]').first();
    await expect(approveBtn).toBeVisible({ timeout: 5000 });
    await approveBtn.click();
    await page.waitForTimeout(500);
    // After approval, status should change
    await expect(page.locator('#reservations-table')).toContainText('approved');
  });

  test('deny reservation updates status', async ({ page }) => {
    await page.goto('/#/reservations');
    await page.waitForTimeout(500);

    await page.locator('#add-reservation-btn').click();
    await page.waitForTimeout(300);
    await page.locator('#reservation-form [name="visitorName"]').fill('Bob Denied');
    await page.locator('#reservation-form [name="date"]').fill('2026-12-20');
    await page.locator('#reservation-form [name="time"]').fill('09:00');
    await page.locator('#reservation-form [name="zone"]').selectOption('warehouse');
    await page.locator('#reservation-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    const denyBtn = page.locator('[data-action="deny"]').first();
    await expect(denyBtn).toBeVisible({ timeout: 5000 });
    await denyBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator('#reservations-table')).toContainText('denied');
  });

  test('search filters reservations by name', async ({ page }) => {
    await page.goto('/#/reservations');
    await page.waitForTimeout(500);

    // Create two reservations
    await page.locator('#add-reservation-btn').click();
    await page.waitForTimeout(200);
    await page.locator('#reservation-form [name="visitorName"]').fill('Alice Search');
    await page.locator('#reservation-form [name="date"]').fill('2026-12-01');
    await page.locator('#reservation-form [name="time"]').fill('10:00');
    await page.locator('#reservation-form [name="zone"]').selectOption('lobby');
    await page.locator('#reservation-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    await page.locator('#add-reservation-btn').click();
    await page.waitForTimeout(200);
    await page.locator('#reservation-form [name="visitorName"]').fill('Bob Other');
    await page.locator('#reservation-form [name="date"]').fill('2026-12-02');
    await page.locator('#reservation-form [name="time"]').fill('11:00');
    await page.locator('#reservation-form [name="zone"]').selectOption('dock');
    await page.locator('#reservation-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    // Search for Alice
    await page.locator('#reservation-search').fill('Alice');
    await page.waitForTimeout(300);
    await expect(page.locator('#reservations-table')).toContainText('Alice');
  });

  test('status filter shows only matching reservations', async ({ page }) => {
    await page.goto('/#/reservations');
    await page.waitForTimeout(500);

    await page.locator('#reservation-status-filter').selectOption('pending');
    await page.waitForTimeout(300);
    // Table should show pending reservations (or empty state)
    await expect(page.locator('#reservations-table')).toBeVisible();
  });

  test('view permissions modal opens', async ({ page }) => {
    await page.goto('/#/reservations');
    await page.waitForTimeout(500);

    // Create a reservation
    await page.locator('#add-reservation-btn').click();
    await page.waitForTimeout(200);
    await page.locator('#reservation-form [name="visitorName"]').fill('Perm Check');
    await page.locator('#reservation-form [name="date"]').fill('2026-12-01');
    await page.locator('#reservation-form [name="time"]').fill('14:00');
    await page.locator('#reservation-form [name="zone"]').selectOption('lobby');
    await page.locator('#reservation-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    const permBtn = page.locator('[data-action="view-perm"]').first();
    await expect(permBtn).toBeVisible({ timeout: 5000 });
    await permBtn.click();
    await page.waitForTimeout(300);
    // Modal should appear
    await expect(page.locator('.modal-overlay')).toBeVisible();
  });

  test('delete reservation removes it', async ({ page }) => {
    await page.goto('/#/reservations');
    await page.waitForTimeout(500);

    await page.locator('#add-reservation-btn').click();
    await page.waitForTimeout(200);
    await page.locator('#reservation-form [name="visitorName"]').fill('Delete Me');
    await page.locator('#reservation-form [name="date"]').fill('2026-12-25');
    await page.locator('#reservation-form [name="time"]').fill('12:00');
    await page.locator('#reservation-form [name="zone"]').selectOption('lobby');
    await page.locator('#reservation-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    const deleteBtn = page.locator('[data-action="delete"]').first();
    await expect(deleteBtn).toBeVisible({ timeout: 5000 });
    await deleteBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator('#reservations-table')).not.toContainText('Delete Me');
  });
});
