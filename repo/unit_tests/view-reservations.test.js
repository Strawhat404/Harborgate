/**
 * Unit tests for the Reservations view (frontend/js/views/reservations.js).
 *
 * Calls requireRole(['visitor', 'operator', 'admin']).
 * Uses Store, renderPaginatedTable, search/filter UI.
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
const { renderReservations } = await import('../frontend/js/views/reservations.js');

const ADMIN_PW = 'AdminPass-1!Strong';

describe('View — Reservations', () => {
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

  it('renders page header with "Reservations" title', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderReservations(container);

    const html = container.innerHTML;
    assert.ok(html.includes('<h1>Reservations</h1>'), 'should render Reservations heading');
  });

  it('renders "New Reservation" button', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderReservations(container);

    const html = container.innerHTML;
    assert.ok(html.includes('id="add-reservation-btn"'), 'should have add reservation button');
    assert.ok(html.includes('New Reservation'), 'button text should say New Reservation');
  });

  it('renders search input and status filter dropdown', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderReservations(container);

    const html = container.innerHTML;
    assert.ok(html.includes('id="reservation-search"'), 'should have search input');
    assert.ok(html.includes('placeholder="Search..."'), 'search should have placeholder');
    assert.ok(html.includes('id="reservation-status-filter"'), 'should have status filter');
  });

  it('renders reservations table container', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderReservations(container);

    const html = container.innerHTML;
    assert.ok(html.includes('id="reservations-table"'), 'should have reservations table container');
  });

  it('status filter has all options (All, Pending, Approved, Denied, Completed)', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderReservations(container);

    const html = container.innerHTML;
    assert.ok(html.includes('All Statuses'), 'should have All Statuses option');
    assert.ok(html.includes('>Pending</option>') || html.includes('value="pending"'), 'should have Pending option');
    assert.ok(html.includes('>Approved</option>') || html.includes('value="approved"'), 'should have Approved option');
    assert.ok(html.includes('>Denied</option>') || html.includes('value="denied"'), 'should have Denied option');
    assert.ok(html.includes('>Completed</option>') || html.includes('value="completed"'), 'should have Completed option');
  });
});

describe('View — Reservations (behavior)', () => {
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

  it('Add Reservation button has click handler attached', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderReservations(container);

    const addBtn = document.getElementById('add-reservation-btn');
    assert.ok(addBtn, 'add-reservation-btn element should exist');
    assert.ok(addBtn._eventListeners?.click?.length > 0, 'should have click handler');
  });

  it('search input has input handler attached', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderReservations(container);

    const searchInput = document.getElementById('reservation-search');
    assert.ok(searchInput, 'reservation-search element should exist');
    assert.ok(searchInput._eventListeners?.input?.length > 0, 'should have input handler');
  });

  it('status filter has change handler attached', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderReservations(container);

    const filter = document.getElementById('reservation-status-filter');
    assert.ok(filter, 'reservation-status-filter element should exist');
    assert.ok(filter._eventListeners?.change?.length > 0, 'should have change handler');
  });
});
