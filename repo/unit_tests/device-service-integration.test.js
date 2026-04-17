/**
 * Device service integration tests (with real IndexedDB mock).
 * Tests: DeviceService.init, registerDevice, getDevices, getDevicesSync,
 *        sendUnlockCommand, registerAdapter, getOutbox, onEvent,
 *        setDeviceStatus, simulateHeartbeat, destroy.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
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
const { default: DeviceService } = await import('../frontend/js/services/device.js');

beforeEach(async () => {
  await resetFakeIndexedDB(DB);
  globalThis.localStorage.clear();
  DeviceService.destroy();
  DeviceService._devices = [];
  DeviceService._adapters = {};
});

afterEach(() => {
  DeviceService.destroy();
});

// =========================================================================
// registerDevice
// =========================================================================
describe('DeviceService/registerDevice', () => {
  it('registers a device and returns it with id', async () => {
    const device = await DeviceService.registerDevice({ name: 'Front Door', zone: 'lobby', type: 'door' });
    assert.ok(device.id);
    assert.equal(device.name, 'Front Door');
    assert.equal(device.status, 'online');
  });

  it('stores device in database', async () => {
    await DeviceService.registerDevice({ name: 'D1', zone: 'lobby' });
    const all = await DeviceService.getDevices();
    assert.equal(all.length, 1);
  });

  it('adds to in-memory list', async () => {
    await DeviceService.registerDevice({ name: 'D1', zone: 'lobby' });
    assert.equal(DeviceService.getDevicesSync().length, 1);
  });

  it('emits device:registered event', async () => {
    const events = [];
    DeviceService.onEvent(e => events.push(e));
    await DeviceService.registerDevice({ name: 'D1', zone: 'lobby' });
    assert.ok(events.some(e => e.type === 'device:registered'));
  });

  it('strips device secret from stored record', async () => {
    const device = await DeviceService.registerDevice({ name: 'D1', zone: 'lobby', secret: 'supersecret' });
    assert.equal(device.secret, undefined);
  });
});

// =========================================================================
// getDevices / getDevicesSync
// =========================================================================
describe('DeviceService/getDevices', () => {
  it('returns all devices from database', async () => {
    await DeviceService.registerDevice({ name: 'D1', zone: 'lobby' });
    await DeviceService.registerDevice({ name: 'D2', zone: 'dock' });
    const all = await DeviceService.getDevices();
    assert.equal(all.length, 2);
  });

  it('returns empty when no devices', async () => {
    const all = await DeviceService.getDevices();
    assert.deepEqual(all, []);
  });
});

describe('DeviceService/getDevicesSync', () => {
  it('returns a copy of in-memory devices', async () => {
    await DeviceService.registerDevice({ name: 'D1', zone: 'lobby' });
    const copy = DeviceService.getDevicesSync();
    copy.push({ fake: true });
    assert.equal(DeviceService.getDevicesSync().length, 1);
  });
});

// =========================================================================
// sendUnlockCommand
// =========================================================================
describe('DeviceService/sendUnlockCommand', () => {
  it('rejects reason shorter than 10 chars', async () => {
    const device = await DeviceService.registerDevice({ name: 'D1', zone: 'lobby' });
    const result = await DeviceService.sendUnlockCommand(device.id, 'short', 'op');
    assert.equal(result.success, false);
    assert.match(result.error, /10 characters/);
  });

  it('rejects empty reason', async () => {
    const device = await DeviceService.registerDevice({ name: 'D1', zone: 'lobby' });
    const result = await DeviceService.sendUnlockCommand(device.id, '', 'op');
    assert.equal(result.success, false);
  });

  it('rejects unknown device', async () => {
    const result = await DeviceService.sendUnlockCommand(99999, 'valid long reason', 'op');
    assert.equal(result.success, false);
    assert.match(result.error, /not found/i);
  });

  it('sends command to online device and gets acknowledged', async () => {
    const device = await DeviceService.registerDevice({ name: 'D1', zone: 'lobby' });
    const result = await DeviceService.sendUnlockCommand(device.id, 'inspecting the unit', 'operator1');
    assert.equal(result.success, true);
    assert.equal(result.status, 'acknowledged');
  });

  it('creates audit log entry', async () => {
    const device = await DeviceService.registerDevice({ name: 'D1', zone: 'lobby' });
    await DeviceService.sendUnlockCommand(device.id, 'security check complete', 'operator1');
    const logs = await DB.getAll('audit_logs');
    const unlockLog = logs.find(l => l.action === 'unlock_command');
    assert.ok(unlockLog);
    assert.equal(unlockLog.details.deviceId, device.id);
  });

  it('stores command in outbox', async () => {
    const device = await DeviceService.registerDevice({ name: 'D1', zone: 'lobby' });
    await DeviceService.sendUnlockCommand(device.id, 'checking access control', 'op');
    const outbox = await DeviceService.getOutbox();
    assert.ok(outbox.length >= 1);
  });
});

// =========================================================================
// registerAdapter
// =========================================================================
describe('DeviceService/registerAdapter', () => {
  it('rejects unknown adapter type', () => {
    assert.throws(
      () => DeviceService.registerAdapter('bluetooth', {}),
      /Unknown adapter type/
    );
  });

  it('rejects http adapter without endpoint', () => {
    assert.throws(
      () => DeviceService.registerAdapter('http', {}),
      /endpoint/i
    );
  });

  it('rejects http adapter targeting non-local host', () => {
    assert.throws(
      () => DeviceService.registerAdapter('http', { endpoint: 'https://evil.com/unlock' }),
      /local-network/i
    );
  });

  it('accepts http adapter targeting localhost', () => {
    assert.doesNotThrow(
      () => DeviceService.registerAdapter('http', { endpoint: 'http://localhost:8080/unlock' })
    );
  });

  it('accepts http adapter targeting 192.168.x.x', () => {
    assert.doesNotThrow(
      () => DeviceService.registerAdapter('http', { endpoint: 'http://192.168.1.100/unlock' })
    );
  });

  it('rejects websocket adapter without url', () => {
    assert.throws(
      () => DeviceService.registerAdapter('websocket', {}),
      /url/i
    );
  });

  it('rejects websocket adapter targeting non-local host', () => {
    assert.throws(
      () => DeviceService.registerAdapter('websocket', { url: 'ws://remote.example.com/ws' }),
      /local-network/i
    );
  });

  it('rejects mqtt adapter without topic', () => {
    assert.throws(
      () => DeviceService.registerAdapter('mqtt', { brokerUrl: 'mqtt://localhost' }),
      /topic/i
    );
  });

  it('rejects mqtt adapter without brokerUrl', () => {
    assert.throws(
      () => DeviceService.registerAdapter('mqtt', { topic: 'devices/unlock' }),
      /brokerUrl/i
    );
  });

  it('rejects mqtt adapter targeting non-local broker', () => {
    assert.throws(
      () => DeviceService.registerAdapter('mqtt', { topic: 't', brokerUrl: 'mqtt://cloud.example.com' }),
      /local-network/i
    );
  });

  it('accepts mqtt adapter targeting local broker', () => {
    assert.doesNotThrow(
      () => DeviceService.registerAdapter('mqtt', { topic: 'devices/unlock', brokerUrl: 'mqtt://10.0.0.5' })
    );
  });
});

// =========================================================================
// onEvent / _emit
// =========================================================================
describe('DeviceService/onEvent', () => {
  it('subscribes and receives events', async () => {
    const events = [];
    DeviceService.onEvent(e => events.push(e));
    await DeviceService.registerDevice({ name: 'D1', zone: 'lobby' });
    assert.ok(events.length > 0);
  });

  it('returns unsubscribe function', async () => {
    const events = [];
    const unsub = DeviceService.onEvent(e => events.push(e));
    unsub();
    await DeviceService.registerDevice({ name: 'D1', zone: 'lobby' });
    assert.equal(events.length, 0);
  });
});

// =========================================================================
// setDeviceStatus
// =========================================================================
describe('DeviceService/setDeviceStatus', () => {
  it('updates device status in memory and DB', async () => {
    const device = await DeviceService.registerDevice({ name: 'D1', zone: 'lobby' });
    await DeviceService.setDeviceStatus(device.id, 'offline');
    const synced = DeviceService.getDevicesSync();
    assert.equal(synced[0].status, 'offline');
  });

  it('ignores unknown device id', async () => {
    await DeviceService.setDeviceStatus(99999, 'offline');
    // Should not throw
  });
});

// =========================================================================
// simulateHeartbeat
// =========================================================================
describe('DeviceService/simulateHeartbeat', () => {
  it('updates lastSeen for all devices', async () => {
    const device = await DeviceService.registerDevice({ name: 'D1', zone: 'lobby' });
    const before = device.lastSeen;
    await new Promise(r => setTimeout(r, 10));
    DeviceService.simulateHeartbeat();
    const after = DeviceService.getDevicesSync()[0].lastSeen;
    assert.ok(after >= before);
  });

  it('emits devices:heartbeat event', () => {
    const events = [];
    DeviceService.onEvent(e => events.push(e));
    DeviceService.simulateHeartbeat();
    assert.ok(events.some(e => e.type === 'devices:heartbeat'));
  });
});

// =========================================================================
// destroy
// =========================================================================
describe('DeviceService/destroy', () => {
  it('clears listeners and timers', async () => {
    const events = [];
    DeviceService.onEvent(e => events.push(e));
    DeviceService.destroy();
    DeviceService.simulateHeartbeat();
    assert.equal(events.length, 0);
  });
});

// =========================================================================
// init
// =========================================================================
describe('DeviceService/init', () => {
  it('loads devices from database into memory', async () => {
    await DB.add('devices', { name: 'Pre-existing', zone: 'lobby', status: 'online', lastSeen: Date.now() });
    await DeviceService.init();
    const synced = DeviceService.getDevicesSync();
    assert.equal(synced.length, 1);
    assert.equal(synced[0].name, 'Pre-existing');
  });
});
