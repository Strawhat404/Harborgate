/**
 * Unit tests for the Map view (frontend/js/views/map.js).
 *
 * Calls requireAuth(). Renders an SVG venue map with zone labels, POI markers,
 * geofences, search modes, walk speed input, and action buttons.
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
const { renderMap } = await import('../frontend/js/views/map.js');

const ADMIN_PW = 'AdminPass-1!Strong';

describe('View — Map', () => {
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

  it('renders page header with "Venue Map" title', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderMap(container);

    const html = container.innerHTML;
    assert.ok(html.includes('Venue Map'), 'should render Venue Map in heading');
  });

  it('renders "Add POI" and "Draw Geofence" buttons', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderMap(container);

    const html = container.innerHTML;
    assert.ok(html.includes('id="add-poi-btn"'), 'should have Add POI button');
    assert.ok(html.includes('Add POI'), 'button text should say Add POI');
    assert.ok(html.includes('id="draw-geofence-btn"'), 'should have Draw Geofence button');
    assert.ok(html.includes('Draw Geofence'), 'button text should say Draw Geofence');
  });

  it('renders search mode selector with options (None, Radius, Zone, Polygon)', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderMap(container);

    const html = container.innerHTML;
    assert.ok(html.includes('id="search-mode"'), 'should have search mode selector');
    assert.ok(html.includes('value="none"'), 'should have None option');
    assert.ok(html.includes('value="radius"') || html.includes('Radius Search'), 'should have Radius option');
    assert.ok(html.includes('value="zone"') || html.includes('Zone Search'), 'should have Zone option');
    assert.ok(html.includes('value="polygon"') || html.includes('Polygon Search'), 'should have Polygon option');
  });

  it('renders walk speed input', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderMap(container);

    const html = container.innerHTML;
    assert.ok(html.includes('id="walk-speed"'), 'should have walk speed input');
    assert.ok(html.includes('Walk Speed'), 'should label the walk speed input');
  });

  it('renders SVG map element', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderMap(container);

    const html = container.innerHTML;
    assert.ok(html.includes('id="facility-map"'), 'should have facility map SVG');
    assert.ok(html.includes('<svg') || html.includes('facility-map'), 'should contain SVG element');
    assert.ok(html.includes('viewBox="0 0 570 270"'), 'SVG should have correct viewBox');
  });

  it('renders POI list panel', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderMap(container);

    const html = container.innerHTML;
    assert.ok(html.includes('id="poi-list"'), 'should have POI list panel');
    assert.ok(html.includes('Points of Interest'), 'should have POI heading');
  });

  it('SVG contains zone labels (Lobby, Office A, etc)', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderMap(container);

    const html = container.innerHTML;
    assert.ok(html.includes('Lobby'), 'should contain Lobby zone label');
    assert.ok(html.includes('Office A'), 'should contain Office A zone label');
    assert.ok(html.includes('Office B'), 'should contain Office B zone label');
    assert.ok(html.includes('Warehouse'), 'should contain Warehouse zone label');
    assert.ok(html.includes('Dock'), 'should contain Dock zone label');
  });
});

describe('View — Map (behavior)', () => {
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

  it('search mode selector has change handler attached', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderMap(container);

    const searchMode = document.getElementById('search-mode');
    assert.ok(searchMode, 'search-mode element should exist');
    assert.ok(searchMode._eventListeners?.change?.length > 0, 'should have change handler');
  });

  it('walk speed input has change handler attached', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderMap(container);

    const walkSpeed = document.getElementById('walk-speed');
    assert.ok(walkSpeed, 'walk-speed element should exist');
    assert.ok(walkSpeed._eventListeners?.change?.length > 0, 'should have change handler');
  });

  it('POI rendering with seeded data shows POI names in HTML', async () => {
    await DB.add('pois', { name: 'Main Entrance', x: 100, y: 50, type: 'entry', zone: 'lobby' });
    await DB.add('pois', { name: 'Cargo Bay', x: 300, y: 200, type: 'general', zone: 'dock' });

    const container = doc.createElement('div');
    doc.body.appendChild(container);
    await renderMap(container);

    const html = container.innerHTML;
    assert.ok(html.includes('Main Entrance'), 'should show first POI name');
    assert.ok(html.includes('Cargo Bay'), 'should show second POI name');
    assert.ok(html.includes('Points of Interest (2)'), 'should show correct POI count');
  });
});
