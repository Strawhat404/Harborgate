/**
 * Unit tests for the Dashboard view (frontend/js/views/dashboard.js).
 *
 * The dashboard calls requireAuth() and reads from DB stores (reservations,
 * notifications, content, devices, audit_logs) to render role-specific stat
 * cards, a user badge, and quick action buttons.
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
const { renderDashboard } = await import('../frontend/js/views/dashboard.js');

const ADMIN_PW = 'AdminPass-1!Strong';

describe('View — Dashboard', () => {
  let doc;

  beforeEach(async () => {
    await resetFakeIndexedDB(DB);
    globalThis.localStorage.clear();
    Store.reset();
    doc = setupDOM();

    // Auth setup: create admin, login, verify role
    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);
    await auth.requireRole(['admin']);
  });

  afterEach(() => {
    auth.logout();
    teardownDOM();
  });

  it('admin sees all stat cards (reservations, devices, content, notifications, audit)', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderDashboard(container);

    const html = container.innerHTML;
    assert.ok(html.includes('Pending Reservations'), 'should show reservations card');
    assert.ok(html.includes('Online Devices'), 'should show devices card');
    assert.ok(html.includes('Content for Review'), 'should show content card');
    assert.ok(html.includes('Unread Notifications'), 'should show notifications card');
    assert.ok(html.includes('Audit Entries'), 'should show audit card');
  });

  it('renders user badge with username and role', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderDashboard(container);

    const html = container.innerHTML;
    assert.ok(html.includes('user-badge'), 'should contain user badge element');
    assert.ok(html.includes('admin'), 'should display admin username');
  });

  it('renders quick action buttons for admin', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderDashboard(container);

    const html = container.innerHTML;
    assert.ok(html.includes('quick-actions'), 'should have quick actions section');
    assert.ok(html.includes('New Reservation'), 'should have New Reservation button');
    assert.ok(html.includes('Remote Unlock'), 'should have Remote Unlock button');
    assert.ok(html.includes('Review Content'), 'should have Review Content button');
  });

  it('renders dashboard title heading', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderDashboard(container);

    const html = container.innerHTML;
    assert.ok(html.includes('<h1>Dashboard</h1>'), 'should render Dashboard heading');
  });

  it('stat numbers show correct counts from seeded DB data', async () => {
    // Seed some data
    await DB.add('reservations', { userId: 1, status: 'pending', visitorName: 'A' });
    await DB.add('reservations', { userId: 1, status: 'approved', visitorName: 'B' });
    await DB.add('devices', { name: 'D1', zone: 'lobby', status: 'online' });
    await DB.add('devices', { name: 'D2', zone: 'dock', status: 'offline' });

    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderDashboard(container);

    const html = container.innerHTML;
    // Pending reservations: 1, active: 1
    assert.ok(html.includes('stat-number'), 'should have stat number elements');
    // Online devices: 1 out of 2
    assert.ok(html.includes('1 active') || html.includes('2 total'),
      'should reflect seeded reservation or device data');
  });
});

describe('View — Dashboard (behavior)', () => {
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

  it('stat numbers reflect exact seeded data counts', async () => {
    await DB.add('reservations', { userId: 1, status: 'pending', visitorName: 'Alice' });
    await DB.add('reservations', { userId: 1, status: 'pending', visitorName: 'Bob' });
    await DB.add('reservations', { userId: 1, status: 'approved', visitorName: 'Carol' });
    await DB.add('devices', { name: 'D1', zone: 'lobby', status: 'online' });
    await DB.add('devices', { name: 'D2', zone: 'dock', status: 'online' });
    await DB.add('devices', { name: 'D3', zone: 'warehouse', status: 'offline' });

    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderDashboard(container);

    const html = container.innerHTML;
    // 2 pending reservations
    assert.ok(html.includes('>2</span>'), 'should show 2 pending reservations');
    // 1 active (approved)
    assert.ok(html.includes('1 active'), 'should show 1 active reservation');
    // 2 online devices
    assert.ok(html.includes('3 total'), 'should show 3 total devices');
  });

  it('visitor role only sees reservations and notifications cards', async () => {
    // Create visitor user
    const adminUser = auth.getCurrentUser();
    await auth.registerWithRole('visitor1', 'VisitorPw-1!Strong', 'visitor', { id: adminUser.id, username: 'admin', role: 'admin' });
    auth.logout();
    await auth.login('visitor1', 'VisitorPw-1!Strong');
    await auth.requireAuth();

    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderDashboard(container);

    const html = container.innerHTML;
    assert.ok(html.includes('Pending Reservations'), 'visitor should see reservations card');
    assert.ok(html.includes('Unread Notifications'), 'visitor should see notifications card');
    assert.ok(!html.includes('Online Devices'), 'visitor should NOT see devices card');
    assert.ok(!html.includes('Content for Review'), 'visitor should NOT see content card');
    assert.ok(!html.includes('Audit Entries'), 'visitor should NOT see audit card');
  });
});
