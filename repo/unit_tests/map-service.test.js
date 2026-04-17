/**
 * Map service unit tests.
 * Tests: addPOI, updatePOI, deletePOI, getAllPOIs, saveGeofence,
 *        getAllGeofences, deleteGeofence, setWalkSpeed, getWalkSpeed.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  installFakeIndexedDB,
  installFakeLocalStorage,
  resetFakeIndexedDB
} from './indexeddb-mock.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
installFakeIndexedDB();
installFakeLocalStorage();

const DB = (await import('../frontend/js/database.js')).default;
const mapSvc = await import('../frontend/js/services/map.js');

beforeEach(async () => {
  await resetFakeIndexedDB(DB);
  globalThis.localStorage.clear();
});

// =========================================================================
// Walk speed
// =========================================================================
describe('map/walkSpeed', () => {
  it('defaults to 3 mph when nothing stored', () => {
    assert.equal(mapSvc.getWalkSpeed(), 3);
  });

  it('persists and retrieves custom speed', () => {
    mapSvc.setWalkSpeed(4.5);
    assert.equal(mapSvc.getWalkSpeed(), 4.5);
  });

  it('overwrites previous speed', () => {
    mapSvc.setWalkSpeed(2);
    mapSvc.setWalkSpeed(5);
    assert.equal(mapSvc.getWalkSpeed(), 5);
  });
});

// =========================================================================
// POI CRUD
// =========================================================================
describe('map/addPOI', () => {
  it('creates a POI with all fields', async () => {
    const result = await mapSvc.addPOI({ name: 'Main Entrance', x: 100, y: 200, zone: 'lobby', type: 'entry', description: 'Front door' });
    assert.equal(result.name, 'Main Entrance');
    assert.equal(result.x, 100);
    assert.equal(result.y, 200);
    assert.equal(result.zone, 'lobby');
    assert.equal(result.type, 'entry');
    assert.ok(result.id);
    assert.ok(result.createdAt);
  });

  it('defaults zone to null and type to general', async () => {
    const result = await mapSvc.addPOI({ name: 'Generic', x: 50, y: 50 });
    assert.equal(result.zone, null);
    assert.equal(result.type, 'general');
  });

  it('stores POI in database', async () => {
    await mapSvc.addPOI({ name: 'P1', x: 10, y: 20 });
    const all = await mapSvc.getAllPOIs();
    assert.equal(all.length, 1);
    assert.equal(all[0].name, 'P1');
  });
});

describe('map/updatePOI', () => {
  it('updates an existing POI', async () => {
    const poi = await mapSvc.addPOI({ name: 'Old', x: 10, y: 20 });
    poi.name = 'New';
    const updated = await mapSvc.updatePOI(poi);
    assert.equal(updated.name, 'New');
    const stored = await DB.get('pois', poi.id);
    assert.equal(stored.name, 'New');
  });
});

describe('map/deletePOI', () => {
  it('removes a POI from the database', async () => {
    const poi = await mapSvc.addPOI({ name: 'Temp', x: 10, y: 20 });
    await mapSvc.deletePOI(poi.id);
    const all = await mapSvc.getAllPOIs();
    assert.equal(all.length, 0);
  });
});

describe('map/getAllPOIs', () => {
  it('returns empty array when no POIs exist', async () => {
    const all = await mapSvc.getAllPOIs();
    assert.deepEqual(all, []);
  });

  it('returns all stored POIs', async () => {
    await mapSvc.addPOI({ name: 'A', x: 10, y: 20 });
    await mapSvc.addPOI({ name: 'B', x: 30, y: 40 });
    await mapSvc.addPOI({ name: 'C', x: 50, y: 60 });
    const all = await mapSvc.getAllPOIs();
    assert.equal(all.length, 3);
  });
});

// =========================================================================
// Geofence CRUD
// =========================================================================
describe('map/saveGeofence', () => {
  it('creates a geofence with sanitized name', async () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    const result = await mapSvc.saveGeofence({ name: 'Zone <script>A', zone: 'lobby', points });
    assert.equal(result.name, 'Zone scriptA'); // angle brackets removed
    assert.ok(result.id);
    assert.deepEqual(result.points, points);
  });

  it('stores geofence in database', async () => {
    await mapSvc.saveGeofence({ name: 'Fence1', points: [{ x: 0, y: 0 }] });
    const all = await mapSvc.getAllGeofences();
    assert.equal(all.length, 1);
  });

  it('defaults zone to null', async () => {
    const result = await mapSvc.saveGeofence({ name: 'NoZone', points: [] });
    assert.equal(result.zone, null);
  });
});

describe('map/deleteGeofence', () => {
  it('removes a geofence from the database', async () => {
    const geo = await mapSvc.saveGeofence({ name: 'Temp', points: [] });
    await mapSvc.deleteGeofence(geo.id);
    const all = await mapSvc.getAllGeofences();
    assert.equal(all.length, 0);
  });
});

describe('map/getAllGeofences', () => {
  it('returns empty array when no geofences exist', async () => {
    const all = await mapSvc.getAllGeofences();
    assert.deepEqual(all, []);
  });

  it('returns all geofences', async () => {
    await mapSvc.saveGeofence({ name: 'G1', points: [] });
    await mapSvc.saveGeofence({ name: 'G2', points: [] });
    const all = await mapSvc.getAllGeofences();
    assert.equal(all.length, 2);
  });
});

// =========================================================================
// Re-exported pure functions (smoke tests)
// =========================================================================
describe('map/re-exported pure functions', () => {
  it('distanceFeet calculates correctly', () => {
    assert.equal(mapSvc.distanceFeet({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  });

  it('searchByRadius filters by distance', () => {
    const pois = [{ x: 0, y: 0 }, { x: 1000, y: 0 }];
    const result = mapSvc.searchByRadius(pois, { x: 0, y: 0 }, 500);
    assert.equal(result.length, 1);
  });

  it('searchByZone filters by zone', () => {
    const pois = [{ zone: 'A' }, { zone: 'B' }];
    assert.equal(mapSvc.searchByZone(pois, 'A').length, 1);
  });

  it('pointInPolygon detects inside point', () => {
    const polygon = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    assert.equal(mapSvc.pointInPolygon({ x: 5, y: 5 }, polygon), true);
  });

  it('searchByPolygon filters POIs within polygon', () => {
    const polygon = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const pois = [{ x: 5, y: 5 }, { x: 20, y: 20 }];
    assert.equal(mapSvc.searchByPolygon(pois, polygon).length, 1);
  });

  it('calculateWalkTime computes minutes', () => {
    assert.equal(mapSvc.calculateWalkTime(5280, 3), 20);
  });

  it('planRoute computes segments and total', () => {
    const route = mapSvc.planRoute({ x: 0, y: 0 }, { x: 5280, y: 0 });
    assert.equal(route.segments.length, 1);
    assert.equal(route.totalWalkTimeMinutes, 20);
  });

  it('constants are exported', () => {
    assert.equal(mapSvc.DEFAULT_WALK_SPEED_MPH, 3);
    assert.equal(mapSvc.FEET_PER_MILE, 5280);
  });
});
