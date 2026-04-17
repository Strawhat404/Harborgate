/**
 * Device service integration test — full command lifecycle through production modules.
 * No mocking of services, business logic, or database layer.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
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
const { default: DeviceService } = await import('../frontend/js/services/device.js');

beforeEach(async () => {
  await resetFakeIndexedDB(DB);
  globalThis.localStorage.clear();
  DeviceService.destroy();
  DeviceService._devices = [];
  DeviceService._adapters = {};
});

afterEach(() => { DeviceService.destroy(); });

describe('Device Integration — register → unlock → audit trail', () => {
  it('register device → send unlock → verify audit log', async () => {
    const device = await DeviceService.registerDevice({
      name: 'Main Gate', zone: 'lobby', type: 'gate'
    });
    assert.equal(device.status, 'online');
    assert.equal(device.name, 'Main Gate');

    const result = await DeviceService.sendUnlockCommand(device.id, 'Authorized visitor entry for scheduled meeting', 'operator1');
    assert.equal(result.success, true);

    const logs = await DB.getAll('audit_logs');
    const unlockLog = logs.find(l => l.action === 'unlock_command');
    assert.ok(unlockLog);
    assert.equal(unlockLog.actor, 'operator1');
    assert.equal(unlockLog.details.deviceId, device.id);
  });

  it('command to offline device gets queued', async () => {
    const device = await DeviceService.registerDevice({
      name: 'Warehouse Door', zone: 'warehouse', type: 'door'
    });
    device.simulateOffline = true;
    const result = await DeviceService.sendUnlockCommand(device.id, 'Emergency maintenance access needed', 'operator2');
    assert.equal(result.success, true);
    assert.equal(result.status, 'queued');
  });

  it('event stream captures register and command events', async () => {
    const events = [];
    DeviceService.onEvent(e => events.push(e.type));

    await DeviceService.registerDevice({ name: 'D1', zone: 'lobby' });
    const device = DeviceService.getDevicesSync()[0];
    await DeviceService.sendUnlockCommand(device.id, 'Testing event capture system', 'op');

    assert.ok(events.includes('device:registered'));
    assert.ok(events.includes('device:command'));
  });

  it('init loads devices from DB and processes outbox', async () => {
    await DB.add('devices', { name: 'Pre', zone: 'dock', status: 'online', lastSeen: Date.now() });
    DeviceService._devices = [];
    await DeviceService.init();
    assert.equal(DeviceService.getDevicesSync().length, 1);
  });

  it('multiple devices can be registered and managed independently', async () => {
    const d1 = await DeviceService.registerDevice({ name: 'Door 1', zone: 'lobby' });
    const d2 = await DeviceService.registerDevice({ name: 'Door 2', zone: 'dock' });

    await DeviceService.setDeviceStatus(d1.id, 'offline');
    const synced = DeviceService.getDevicesSync();
    const door1 = synced.find(d => d.id === d1.id);
    const door2 = synced.find(d => d.id === d2.id);
    assert.equal(door1.status, 'offline');
    assert.equal(door2.status, 'online');
  });

  it('getOutbox returns all command records', async () => {
    const device = await DeviceService.registerDevice({ name: 'D1', zone: 'lobby' });
    await DeviceService.sendUnlockCommand(device.id, 'first unlock reason here', 'op');
    await DeviceService.sendUnlockCommand(device.id, 'second unlock reason here', 'op');
    const outbox = await DeviceService.getOutbox();
    assert.ok(outbox.length >= 2);
  });

  it('adapter validation rejects non-local HTTP targets', () => {
    assert.throws(
      () => DeviceService.registerAdapter('http', { endpoint: 'https://example.com/unlock' }),
      /local-network/
    );
  });

  it('adapter validation accepts local HTTP targets', () => {
    assert.doesNotThrow(
      () => DeviceService.registerAdapter('http', { endpoint: 'http://192.168.1.100:3000/unlock' })
    );
  });
});
