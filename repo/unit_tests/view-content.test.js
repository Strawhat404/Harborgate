/**
 * Unit tests for the Content view (frontend/js/views/content.js).
 *
 * Calls requireRole(['admin', 'reviewer']).
 * Renders content management page with search, workflow/compliance filters,
 * a paginated table, and a create button.
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
const { renderContent } = await import('../frontend/js/views/content.js');

const ADMIN_PW = 'AdminPass-1!Strong';

describe('View — Content', () => {
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

  it('renders page header "Content Management"', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderContent(container);

    const html = container.innerHTML;
    assert.ok(html.includes('<h1>Content Management</h1>'), 'should render Content Management heading');
  });

  it('renders "Create Content" button', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderContent(container);

    const html = container.innerHTML;
    assert.ok(html.includes('id="create-content-btn"'), 'should have create content button');
    assert.ok(html.includes('Create Content'), 'button text should say Create Content');
  });

  it('renders search input', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderContent(container);

    const html = container.innerHTML;
    assert.ok(html.includes('id="content-search"'), 'should have content search input');
    assert.ok(html.includes('placeholder="Search content..."'), 'search should have placeholder');
  });

  it('renders workflow state filter (All, Draft, Review, Published, Archived)', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderContent(container);

    const html = container.innerHTML;
    assert.ok(html.includes('id="content-workflow-filter"'), 'should have workflow filter');
    assert.ok(html.includes('All States'), 'should have All States option');
    assert.ok(html.includes('>Draft</option>') || html.includes('value="draft"'), 'should have Draft option');
    assert.ok(html.includes('>Review</option>') || html.includes('value="review"'), 'should have Review option');
    assert.ok(html.includes('>Published</option>') || html.includes('value="published"'), 'should have Published option');
    assert.ok(html.includes('>Archived</option>') || html.includes('value="archived"'), 'should have Archived option');
  });

  it('renders compliance filter (All, Flagged, Clean)', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderContent(container);

    const html = container.innerHTML;
    assert.ok(html.includes('id="content-flag-filter"'), 'should have compliance flag filter');
    assert.ok(html.includes('>All</option>') || html.includes('value=""'), 'should have All option');
    assert.ok(html.includes('>Flagged</option>') || html.includes('value="flagged"'), 'should have Flagged option');
    assert.ok(html.includes('>Clean</option>') || html.includes('value="clean"'), 'should have Clean option');
  });

  it('renders content table container', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderContent(container);

    const html = container.innerHTML;
    assert.ok(html.includes('id="content-table"'), 'should have content table container');
  });
});

describe('View — Content (behavior)', () => {
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

  it('Create Content button has click handler attached', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderContent(container);

    const createBtn = document.getElementById('create-content-btn');
    assert.ok(createBtn, 'create-content-btn element should exist');
    assert.ok(createBtn._eventListeners?.click?.length > 0, 'should have click handler');
  });

  it('workflow filter has change handler attached', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderContent(container);

    const filter = document.getElementById('content-workflow-filter');
    assert.ok(filter, 'content-workflow-filter element should exist');
    assert.ok(filter._eventListeners?.change?.length > 0, 'should have change handler');
  });

  it('search input has input handler attached', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderContent(container);

    const search = document.getElementById('content-search');
    assert.ok(search, 'content-search element should exist');
    assert.ok(search._eventListeners?.input?.length > 0, 'should have input handler');
  });
});
