/**
 * Unit tests for the Settings view (frontend/js/views/settings.js).
 *
 * Calls requireAuth(). Renders settings sections for session info, appearance,
 * encryption test, and (for admin) import/export and data management.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  installFakeIndexedDB,
  installFakeLocalStorage,
  resetFakeIndexedDB
} from './indexeddb-mock.js';
import { setupDOM, teardownDOM } from './dom-mock.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
installFakeIndexedDB();
installFakeLocalStorage();

globalThis.window = { location: { hash: '/' } };

const DB = (await import('../frontend/js/database.js')).default;
const auth = await import('../frontend/js/services/auth-service.js');
const Store = (await import('../frontend/js/store.js')).default;
const { renderSettings } = await import('../frontend/js/views/settings.js');

const ADMIN_PW = 'AdminPass-1!Strong';

describe('View — Settings', () => {
  let doc;

  beforeEach(async () => {
    await resetFakeIndexedDB(DB);
    globalThis.localStorage.clear();
    Store.reset();
    doc = setupDOM();

    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);
    await auth.requireRole(['admin']);
  });

  afterEach(() => {
    auth.logout();
    teardownDOM();
  });

  it('renders page header "Settings"', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderSettings(container);

    const html = container.innerHTML;
    assert.ok(html.includes('<h1>Settings</h1>'), 'should render Settings heading');
  });

  it('renders session section with user info', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderSettings(container);

    const html = container.innerHTML;
    assert.ok(html.includes('<h2>Session</h2>'), 'should have Session section heading');
    assert.ok(html.includes('admin'), 'should display logged-in username');
    assert.ok(html.includes('Logged in as'), 'should show logged in label');
  });

  it('renders appearance section with theme selector', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderSettings(container);

    const html = container.innerHTML;
    assert.ok(html.includes('<h2>Appearance</h2>'), 'should have Appearance section');
    assert.ok(html.includes('id="theme-select"'), 'should have theme selector');
    assert.ok(html.includes('value="light"'), 'should have Light option');
    assert.ok(html.includes('value="dark"'), 'should have Dark option');
  });

  it('renders encryption test section', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderSettings(container);

    const html = container.innerHTML;
    assert.ok(html.includes('<h2>Encryption Test</h2>'), 'should have Encryption Test section');
    assert.ok(html.includes('id="enc-password"'), 'should have encryption password input');
    assert.ok(html.includes('id="enc-test"'), 'should have test message input');
    assert.ok(html.includes('id="encrypt-btn"'), 'should have Encrypt button');
    assert.ok(html.includes('id="decrypt-btn"'), 'should have Decrypt button');
  });

  it('renders logout button', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderSettings(container);

    const html = container.innerHTML;
    assert.ok(html.includes('id="logout-btn"'), 'should have logout button');
    assert.ok(html.includes('Logout'), 'button text should say Logout');
  });

  it('admin sees import/export section', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderSettings(container);

    const html = container.innerHTML;
    assert.ok(html.includes('Import / Export'), 'should have Import / Export section for admin');
    assert.ok(html.includes('id="export-btn"'), 'should have export button');
    assert.ok(html.includes('id="import-btn"'), 'should have import button');
    assert.ok(html.includes('id="backup-password"'), 'should have backup password input');
  });

  it('admin sees data management section with clear button', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderSettings(container);

    const html = container.innerHTML;
    assert.ok(html.includes('Data Management'), 'should have Data Management section');
    assert.ok(html.includes('id="clear-all-data"'), 'should have clear all data button');
    assert.ok(html.includes('Clear All Data'), 'button text should say Clear All Data');
  });
});

describe('View — Settings (behavior)', () => {
  let doc;

  beforeEach(async () => {
    await resetFakeIndexedDB(DB);
    globalThis.localStorage.clear();
    Store.reset();
    doc = setupDOM();

    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);
    await auth.requireRole(['admin']);
  });

  afterEach(() => {
    auth.logout();
    teardownDOM();
  });

  it('logout button click sets hash to /login', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderSettings(container);

    const logoutBtn = document.getElementById('logout-btn');
    assert.ok(logoutBtn, 'logout-btn element should exist');
    assert.ok(logoutBtn._eventListeners?.click?.length > 0, 'should have click handler');

    logoutBtn.click();
    assert.strictEqual(window.location.hash, '/login', 'should navigate to /login after logout');
  });

  it('theme select has change handler attached', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderSettings(container);

    const themeSelect = document.getElementById('theme-select');
    assert.ok(themeSelect, 'theme-select element should exist');
    assert.ok(themeSelect._eventListeners?.change?.length > 0, 'should have change handler');
  });

  it('non-admin does not see import/export section', async () => {
    const adminUser = auth.getCurrentUser();
    await auth.registerWithRole('v1', 'VisitorPw-1!Strong', 'visitor', { id: adminUser.id, username: 'admin', role: 'admin' });
    auth.logout();
    await auth.login('v1', 'VisitorPw-1!Strong');
    await auth.requireAuth();

    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderSettings(container);

    const html = container.innerHTML;
    assert.ok(!html.includes('id="export-btn"'), 'visitor should not see export button');
    assert.ok(!html.includes('id="import-btn"'), 'visitor should not see import button');
    assert.ok(html.includes('restricted to administrators'), 'should show restriction message');
  });
});
