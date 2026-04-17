/**
 * Import/Export integration test — full backup and restore lifecycle.
 * No mocking of crypto, database, or service layer.
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
const Crypto = (await import('../frontend/js/crypto.js')).default;
const { exportData, importData } = await import('../frontend/js/services/importexport.js');

const BACKUP_PW = 'SecureBackup-1!X';

beforeEach(async () => {
  await resetFakeIndexedDB(DB);
  globalThis.localStorage.clear();
});

describe('Import/Export Integration — full backup and restore', () => {
  it('exports all stores and re-imports them', async () => {
    // Seed data
    await DB.add('users', { username: 'alice', role: 'admin' });
    await DB.add('roles', { name: 'admin' });
    await DB.add('reservations', { userId: 1, status: 'pending', visitorName: 'Bob' });
    await DB.add('devices', { name: 'Door 1', zone: 'lobby', status: 'online' });
    await DB.add('pois', { name: 'Entry', x: 0, y: 0, zone: 'lobby' });
    await DB.add('notifications', { userId: 1, message: 'Test', status: 'delivered', read: false });

    const exported = await exportData(BACKUP_PW);
    assert.equal(exported.encrypted, true);

    // Verify the encrypted bundle can be decrypted
    const bundle = await Crypto.decryptObject(exported.data, BACKUP_PW);
    assert.ok(bundle.stores.users.length >= 1);
    assert.ok(bundle.stores.reservations.length >= 1);
    assert.ok(bundle.stores.devices.length >= 1);

    // Clear everything
    await DB.clear('users');
    await DB.clear('roles');
    await DB.clear('reservations');
    await DB.clear('devices');
    await DB.clear('pois');
    await DB.clear('notifications');

    // Reimport
    const json = JSON.stringify(exported);
    const result = await importData(json, BACKUP_PW);
    assert.equal(result.success, true);

    // Verify data restored
    const users = await DB.getAll('users');
    assert.ok(users.length >= 1);
    const reservations = await DB.getAll('reservations');
    assert.ok(reservations.length >= 1);
  });

  it('audit logs are merged (not cleared) on import', async () => {
    await DB.add('audit_logs', { action: 'pre_import', actor: 'sys', timestamp: Date.now() });
    await DB.add('audit_logs', { action: 'exported_action', actor: 'sys', timestamp: Date.now() });
    const exported = await exportData(BACKUP_PW);

    // Add another after export
    await DB.add('audit_logs', { action: 'post_export', actor: 'sys', timestamp: Date.now() });

    const json = JSON.stringify(exported);
    await importData(json, BACKUP_PW);

    const logs = await DB.getAll('audit_logs');
    const actions = logs.map(l => l.action);
    assert.ok(actions.includes('post_export'), 'post-export log should survive import');
    assert.ok(logs.length >= 3);
  });

  it('rejects import with wrong password', async () => {
    await DB.add('users', { username: 'x', role: 'admin' });
    const exported = await exportData(BACKUP_PW);
    const json = JSON.stringify(exported);
    await assert.rejects(() => importData(json, 'WrongPassword-1!X'));
  });

  it('rejects plaintext backup', async () => {
    const json = JSON.stringify({ encrypted: false, data: '{}' });
    await assert.rejects(() => importData(json, BACKUP_PW), /not encrypted/i);
  });

  it('rejects empty password for export', async () => {
    await assert.rejects(() => exportData(''), /password/i);
  });

  it('rejects empty password for import', async () => {
    await assert.rejects(() => importData('{}', ''), /password/i);
  });

  it('ignores unknown store names in backup', async () => {
    // Create a backup with an extra store
    const bundle = {
      version: 1, exportedAt: Date.now(),
      stores: { users: [], unknown_store: [{ foo: 'bar' }] }
    };
    const encrypted = await Crypto.encryptObject(bundle, BACKUP_PW);
    const json = JSON.stringify({ encrypted: true, data: encrypted });
    const result = await importData(json, BACKUP_PW);
    assert.equal(result.success, true);
  });
});
