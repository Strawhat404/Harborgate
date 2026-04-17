/**
 * E2E tests for the Venue Map page.
 * Tests: map rendering, POI management, search modes, walk speed, route planning.
 */
import { test, expect } from '@playwright/test';
import { setupIfNeeded, login, CREDENTIALS } from './helpers.js';

test.describe('Venue Map', () => {
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

  test('map page loads with SVG and controls', async ({ page }) => {
    await page.goto('/#/map');
    await page.waitForTimeout(500);
    await expect(page.locator('h1:has-text("Venue Map")')).toBeVisible();
    await expect(page.locator('#facility-map')).toBeVisible();
    await expect(page.locator('#add-poi-btn')).toBeVisible();
    await expect(page.locator('#search-mode')).toBeVisible();
  });

  test('add POI via modal', async ({ page }) => {
    await page.goto('/#/map');
    await page.waitForTimeout(500);
    await page.locator('#add-poi-btn').click();
    await page.waitForTimeout(300);

    await page.locator('#poi-form [name="name"]').fill('Main Entrance');
    await page.locator('#poi-form [name="x"]').fill('100');
    await page.locator('#poi-form [name="y"]').fill('200');
    await page.locator('#poi-form [name="type"]').selectOption('entry');
    await page.locator('#poi-form [name="zone"]').selectOption('lobby');
    await page.locator('#poi-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    await expect(page.locator('.poi-list')).toContainText('Main Entrance');
  });

  test('delete POI removes it from list', async ({ page }) => {
    await page.goto('/#/map');
    await page.waitForTimeout(500);

    // Add POI first
    await page.locator('#add-poi-btn').click();
    await page.waitForTimeout(300);
    await page.locator('#poi-form [name="name"]').fill('Temp POI');
    await page.locator('#poi-form [name="x"]').fill('50');
    await page.locator('#poi-form [name="y"]').fill('50');
    await page.locator('#poi-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    const deleteBtn = page.locator('[data-action="delete-poi"]').first();
    await expect(deleteBtn).toBeVisible({ timeout: 5000 });
    await deleteBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator('.poi-list')).not.toContainText('Temp POI');
  });

  test('search mode selector changes available options', async ({ page }) => {
    await page.goto('/#/map');
    await page.waitForTimeout(500);

    await page.locator('#search-mode').selectOption('radius');
    await expect(page.locator('#search-params')).toBeVisible();
    await expect(page.locator('#radius-label')).toBeVisible();

    await page.locator('#search-mode').selectOption('zone');
    await expect(page.locator('#zone-select-label')).toBeVisible();

    await page.locator('#search-mode').selectOption('none');
    await expect(page.locator('#search-params')).toBeHidden();
  });

  test('walk speed input updates configuration', async ({ page }) => {
    await page.goto('/#/map');
    await page.waitForTimeout(500);
    await page.locator('#walk-speed').fill('5');
    await page.locator('#walk-speed').dispatchEvent('change');
    await page.waitForTimeout(300);
    // Speed should be stored
    const speed = await page.evaluate(() => localStorage.getItem('hg_walk_speed'));
    expect(speed).toBe('5');
  });

  test('SVG map shows zone labels', async ({ page }) => {
    await page.goto('/#/map');
    await page.waitForTimeout(500);
    const svg = page.locator('#facility-map');
    await expect(svg).toBeVisible();
    await expect(svg.locator('text:has-text("Lobby")')).toBeVisible();
    await expect(svg.locator('text:has-text("Warehouse")')).toBeVisible();
  });

  test('route button triggers route calculation', async ({ page }) => {
    await page.goto('/#/map');
    await page.waitForTimeout(500);

    // Add two POIs for routing
    await page.locator('#add-poi-btn').click();
    await page.waitForTimeout(200);
    await page.locator('#poi-form [name="name"]').fill('Start');
    await page.locator('#poi-form [name="x"]').fill('0');
    await page.locator('#poi-form [name="y"]').fill('0');
    await page.locator('#poi-form [name="type"]').selectOption('entry');
    await page.locator('#poi-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    await page.locator('#add-poi-btn').click();
    await page.waitForTimeout(200);
    await page.locator('#poi-form [name="name"]').fill('End');
    await page.locator('#poi-form [name="x"]').fill('1000');
    await page.locator('#poi-form [name="y"]').fill('1000');
    await page.locator('#poi-form button[type="submit"]').click();
    await page.waitForTimeout(500);

    const routeBtn = page.locator('[data-action="route-to"]').first();
    await expect(routeBtn).toBeVisible({ timeout: 5000 });
    await routeBtn.click();
    await page.waitForTimeout(300);
    await expect(page.locator('#route-result')).toBeVisible();
  });
});
