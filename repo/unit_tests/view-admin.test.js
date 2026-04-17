/**
 * Unit tests for the Admin view (frontend/js/views/admin.js).
 *
 * Calls requireRole(['admin']).
 * Renders admin console with tabs (Users, Audit Log, Reports, Rate Limits),
 * each containing tables and action buttons.
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
const { renderAdmin } = await import('../frontend/js/views/admin.js');

const ADMIN_PW = 'AdminPass-1!Strong';

describe('View — Admin', () => {
  let doc;

  beforeEach(async () => {
    await resetFakeIndexedDB(DB);
    globalThis.localStorage.clear();
    Store.reset();
    doc = setupDOM();

    // The admin view's bindUserActions (and other bind callbacks) call
    // document.querySelectorAll(...) which does not exist on MockDocument.
    // Delegate to body so the production code can find elements in innerHTML.
    if (!doc.querySelectorAll) {
      doc.querySelectorAll = (sel) => doc.body.querySelectorAll(sel);
    }
    if (!doc.querySelector) {
      doc.querySelector = (sel) => doc.body.querySelector(sel);
    }

    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);
    await auth.requireRole(['admin']);
  });

  afterEach(() => {
    auth.logout();
    teardownDOM();
  });

  it('renders page header "Admin Console"', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderAdmin(container);

    const html = container.innerHTML;
    assert.ok(html.includes('<h1>Admin Console</h1>'), 'should render Admin Console heading');
  });

  it('renders 4 admin tabs (Users, Audit Log, Reports, Rate Limits)', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderAdmin(container);

    const html = container.innerHTML;
    assert.ok(html.includes('admin-tabs'), 'should have admin tabs container');
    assert.ok(html.includes('data-tab="users"'), 'should have Users tab');
    assert.ok(html.includes('data-tab="audit"'), 'should have Audit Log tab');
    assert.ok(html.includes('data-tab="reports"'), 'should have Reports tab');
    assert.ok(html.includes('data-tab="rate-limits"'), 'should have Rate Limits tab');
    assert.ok(html.includes('>Users</button>'), 'Users tab label');
    assert.ok(html.includes('>Audit Log</button>'), 'Audit Log tab label');
    assert.ok(html.includes('>Reports</button>'), 'Reports tab label');
    assert.ok(html.includes('>Rate Limits</button>'), 'Rate Limits tab label');
  });

  it('users tab is initially visible', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderAdmin(container);

    const html = container.innerHTML;
    // tab-users panel has no style="display:none"
    assert.ok(html.includes('id="tab-users"'), 'should have users tab panel');
    // The users tab should NOT have display:none — check it does not appear
    // immediately after the id in the same element
    const usersIdx = html.indexOf('id="tab-users"');
    const usersSection = html.substring(usersIdx, usersIdx + 100);
    assert.ok(!usersSection.includes('display:none'), 'users tab should be visible');
  });

  it('audit tab initially hidden', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderAdmin(container);

    const html = container.innerHTML;
    assert.ok(html.includes('id="tab-audit"'), 'should have audit tab panel');
    // Extract the element snippet around tab-audit
    const auditIdx = html.indexOf('id="tab-audit"');
    const auditSection = html.substring(auditIdx, auditIdx + 100);
    assert.ok(auditSection.includes('display:none'), 'audit tab should be hidden');
  });

  it('reports tab initially hidden', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderAdmin(container);

    const html = container.innerHTML;
    const reportsIdx = html.indexOf('id="tab-reports"');
    const reportsSection = html.substring(reportsIdx, reportsIdx + 100);
    assert.ok(reportsSection.includes('display:none'), 'reports tab should be hidden');
  });

  it('rate limits tab initially hidden', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderAdmin(container);

    const html = container.innerHTML;
    const rlIdx = html.indexOf('id="tab-rate-limits"');
    const rlSection = html.substring(rlIdx, rlIdx + 100);
    assert.ok(rlSection.includes('display:none'), 'rate limits tab should be hidden');
  });

  it('users table is rendered', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderAdmin(container);

    const html = container.innerHTML;
    assert.ok(html.includes('id="users-table"'), 'should have users table container');
    assert.ok(html.includes('User Management'), 'should have User Management subheading');
  });

  it('create report button exists in reports panel', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderAdmin(container);

    const html = container.innerHTML;
    assert.ok(html.includes('id="create-report-btn"'), 'should have create report button');
    assert.ok(html.includes('Create Report'), 'button text should say Create Report');
  });

  it('create rate limit button exists in rate limits panel', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderAdmin(container);

    const html = container.innerHTML;
    assert.ok(html.includes('id="create-rate-limit-btn"'), 'should have create rate limit button');
    assert.ok(html.includes('Add Rule'), 'button text should say Add Rule');
  });
});

describe('View — Admin (behavior)', () => {
  let doc;

  beforeEach(async () => {
    await resetFakeIndexedDB(DB);
    globalThis.localStorage.clear();
    Store.reset();
    doc = setupDOM();

    if (!doc.querySelectorAll) {
      doc.querySelectorAll = (sel) => doc.body.querySelectorAll(sel);
    }
    if (!doc.querySelector) {
      doc.querySelector = (sel) => doc.body.querySelector(sel);
    }

    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);
    await auth.requireRole(['admin']);
  });

  afterEach(() => {
    auth.logout();
    teardownDOM();
  });

  it('admin tabs are rendered with data-tab attributes for click handling', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderAdmin(container);

    const html = container.innerHTML;
    // Verify all 4 tab buttons are present with their data-tab attributes
    assert.ok(html.includes('data-tab="users"'), 'should have users tab');
    assert.ok(html.includes('data-tab="audit"'), 'should have audit tab');
    assert.ok(html.includes('data-tab="reports"'), 'should have reports tab');
    assert.ok(html.includes('data-tab="rate-limits"'), 'should have rate-limits tab');
    // Verify the panel elements exist for tab switching to target
    assert.ok(html.includes('id="tab-users"'), 'should have users panel');
    assert.ok(html.includes('id="tab-audit"'), 'should have audit panel');
    assert.ok(html.includes('id="tab-reports"'), 'should have reports panel');
    assert.ok(html.includes('id="tab-rate-limits"'), 'should have rate-limits panel');
  });

  it('Create Report button has click handler attached', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderAdmin(container);

    const createReportBtn = document.getElementById('create-report-btn');
    assert.ok(createReportBtn, 'create-report-btn element should exist');
    assert.ok(createReportBtn._eventListeners?.click?.length > 0, 'should have click handler');
  });

  it('Create Rate Limit button has click handler attached', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderAdmin(container);

    const createRlBtn = document.getElementById('create-rate-limit-btn');
    assert.ok(createRlBtn, 'create-rate-limit-btn element should exist');
    assert.ok(createRlBtn._eventListeners?.click?.length > 0, 'should have click handler');
  });
});
