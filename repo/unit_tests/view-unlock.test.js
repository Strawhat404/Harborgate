/**
 * Unit tests for the Unlock view (frontend/js/views/unlock.js).
 *
 * Calls requireRole(['admin', 'operator']).
 * Imports DeviceService to display device grid and command outbox.
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
const { renderUnlock } = await import('../frontend/js/views/unlock.js');

const ADMIN_PW = 'AdminPass-1!Strong';

describe('View — Unlock', () => {
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

  it('renders page header with "Remote Unlock" title', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderUnlock(container);

    const html = container.innerHTML;
    assert.ok(html.includes('<h1>Remote Unlock</h1>'), 'should render Remote Unlock heading');
  });

  it('renders "Add Device" button', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderUnlock(container);

    const html = container.innerHTML;
    assert.ok(html.includes('id="add-device-btn"'), 'should have add device button');
    assert.ok(html.includes('Add Device'), 'button text should say Add Device');
  });

  it('renders device grid (empty state when no devices)', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderUnlock(container);

    const html = container.innerHTML;
    assert.ok(html.includes('device-grid'), 'should have device grid');
    assert.ok(html.includes('No devices registered') || html.includes('empty-state'),
      'should show empty state when no devices exist');
  });

  it('renders Command Outbox section heading', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderUnlock(container);

    const html = container.innerHTML;
    assert.ok(html.includes('Command Outbox'), 'should have Command Outbox heading');
  });

  it('renders outbox table with correct columns', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderUnlock(container);

    const html = container.innerHTML;
    assert.ok(html.includes('<th>Device</th>'), 'should have Device column');
    assert.ok(html.includes('<th>Type</th>'), 'should have Type column');
    assert.ok(html.includes('<th>Status</th>'), 'should have Status column');
    assert.ok(html.includes('<th>Retries</th>'), 'should have Retries column');
    assert.ok(html.includes('<th>Created</th>'), 'should have Created column');
    assert.ok(html.includes('<th>Reason</th>'), 'should have Reason column');
  });
});

describe('View — Unlock (behavior)', () => {
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

  it('Add Device button has click handler attached', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderUnlock(container);

    const addBtn = document.getElementById('add-device-btn');
    assert.ok(addBtn, 'add-device-btn element should exist');
    assert.ok(addBtn._eventListeners?.click?.length > 0, 'should have click handler');
  });

  it('device card rendering with seeded data shows device name and zone', async () => {
    await DB.add('devices', { name: 'Front Door', zone: 'lobby', type: 'door', status: 'online', lastSeen: Date.now() });
    await DB.add('devices', { name: 'Dock Gate', zone: 'dock', type: 'gate', status: 'offline', lastSeen: Date.now() });

    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderUnlock(container);

    const html = container.innerHTML;
    assert.ok(html.includes('Front Door'), 'should show first device name');
    assert.ok(html.includes('Dock Gate'), 'should show second device name');
    assert.ok(html.includes('Zone: lobby'), 'should show first device zone');
    assert.ok(html.includes('Zone: dock'), 'should show second device zone');
    assert.ok(!html.includes('No devices registered'), 'should not show empty state');
  });
});
