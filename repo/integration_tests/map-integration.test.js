/**
 * Map service integration test — full POI and geofence lifecycle.
 * No mocking of services, business logic, or database layer.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  installFakeIndexedDB,
  installFakeLocalStorage,
  resetFakeIndexedDB
} from '../unit_tests/indexeddb-mock.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
installFakeIndexedDB();
installFakeLocalStorage();

const DB = (await import('../frontend/js/database.js')).default;
const mapSvc = await import('../frontend/js/services/map.js');

beforeEach(async () => {
  await resetFakeIndexedDB(DB);
  globalThis.localStorage.clear();
});

describe('Map Integration — POI and geofence lifecycle', () => {
  it('full POI lifecycle: add → update → search → route → delete', async () => {
    // Add POIs
    const entry = await mapSvc.addPOI({ name: 'Main Entry', x: 0, y: 0, zone: 'lobby', type: 'entry' });
    const office = await mapSvc.addPOI({ name: 'Office', x: 500, y: 300, zone: 'office-a', type: 'general' });
    const far = await mapSvc.addPOI({ name: 'Dock', x: 5000, y: 5000, zone: 'dock', type: 'general' });

    assert.equal((await mapSvc.getAllPOIs()).length, 3);

    // Search by radius
    const nearby = mapSvc.searchByRadius([entry, office, far], { x: 0, y: 0 }, 600);
    assert.equal(nearby.length, 2);

    // Search by zone
    const lobbyPOIs = mapSvc.searchByZone([entry, office, far], 'lobby');
    assert.equal(lobbyPOIs.length, 1);

    // Route planning
    const route = mapSvc.planRoute({ x: 0, y: 0 }, { x: 500, y: 300 });
    assert.ok(route.totalDistanceFeet > 0);
    assert.ok(route.totalWalkTimeMinutes > 0);
    assert.equal(route.segments.length, 1);

    // Update POI
    office.name = 'Meeting Room';
    await mapSvc.updatePOI(office);
    const stored = await DB.get('pois', office.id);
    assert.equal(stored.name, 'Meeting Room');

    // Delete POI
    await mapSvc.deletePOI(far.id);
    assert.equal((await mapSvc.getAllPOIs()).length, 2);
  });

  it('geofence lifecycle: create → search within polygon → delete', async () => {
    const polygon = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }];
    const geo = await mapSvc.saveGeofence({ name: 'Test Zone', zone: 'lobby', points: polygon });
    assert.ok(geo.id);
    assert.equal((await mapSvc.getAllGeofences()).length, 1);

    // POIs inside and outside
    const inside = { x: 500, y: 500 };
    const outside = { x: 2000, y: 2000 };
    assert.equal(mapSvc.pointInPolygon(inside, polygon), true);
    assert.equal(mapSvc.pointInPolygon(outside, polygon), false);

    const pois = [{ ...inside, name: 'In' }, { ...outside, name: 'Out' }];
    const found = mapSvc.searchByPolygon(pois, polygon);
    assert.equal(found.length, 1);
    assert.equal(found[0].name, 'In');

    // Delete
    await mapSvc.deleteGeofence(geo.id);
    assert.equal((await mapSvc.getAllGeofences()).length, 0);
  });

  it('walk speed persistence', () => {
    assert.equal(mapSvc.getWalkSpeed(), 3); // default
    mapSvc.setWalkSpeed(4);
    assert.equal(mapSvc.getWalkSpeed(), 4);
  });

  it('nearest entry suggestion works', async () => {
    const entry1 = await mapSvc.addPOI({ name: 'Near Entry', x: 10, y: 10, type: 'entry' });
    const entry2 = await mapSvc.addPOI({ name: 'Far Entry', x: 1000, y: 1000, type: 'entry' });
    const general = await mapSvc.addPOI({ name: 'Target', x: 50, y: 50, type: 'general' });

    const allPois = [entry1, entry2, general];
    const nearest = mapSvc.suggestNearestEntry(allPois, { x: 50, y: 50 });
    assert.ok(nearest);
    assert.equal(nearest.poi.name, 'Near Entry');
  });

  it('distance calculation for known values', () => {
    assert.equal(mapSvc.distanceFeet({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
    assert.equal(mapSvc.distanceFeet({ x: 0, y: 0 }, { x: 0, y: 0 }), 0);
  });

  it('walk time calculation at various speeds', () => {
    // 1 mile at 3 mph = 20 min
    assert.equal(mapSvc.calculateWalkTime(5280, 3), 20);
    // 1 mile at 6 mph = 10 min
    assert.equal(mapSvc.calculateWalkTime(5280, 6), 10);
  });

  it('route with waypoints', () => {
    const route = mapSvc.planRoute(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      [{ x: 50, y: 50 }]
    );
    assert.equal(route.segments.length, 2);
    assert.ok(route.totalDistanceFeet > 100);
  });
});
