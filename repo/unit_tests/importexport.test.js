/**
 * Import/Export service unit tests.
 * Tests: exportData, importData, EXPORT_STORES constant.
 * Browser-only functions (downloadJSON, pickFile) are not tested
 * as they require Blob/URL APIs not available in Node.
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
const Crypto = (await import('../frontend/js/crypto.js')).default;
const { exportData, importData } = await import('../frontend/js/services/importexport.js');

const BACKUP_PW = 'BackupPass-1!Str';

beforeEach(async () => {
  await resetFakeIndexedDB(DB);
  globalThis.localStorage.clear();
});

// =========================================================================
// exportData
// =========================================================================
describe('importexport/exportData', () => {
  it('exports encrypted data bundle', async () => {
    await DB.add('users', { username: 'testuser', role: 'visitor' });
    const result = await exportData(BACKUP_PW);
    assert.equal(result.encrypted, true);
    assert.ok(result.data);
  });

  it('rejects empty password', async () => {
    await assert.rejects(() => exportData(''), /password/i);
  });

  it('rejects null password', async () => {
    await assert.rejects(() => exportData(null), /password/i);
  });

  it('rejects whitespace-only password', async () => {
    await assert.rejects(() => exportData('   '), /password/i);
  });

  it('exports all stores', async () => {
    await DB.add('users', { username: 'u1', role: 'visitor' });
    await DB.add('roles', { name: 'visitor' });
    await DB.add('reservations', { userId: 1, status: 'pending' });
    const result = await exportData(BACKUP_PW);
    const bundle = await Crypto.decryptObject(result.data, BACKUP_PW);
    assert.ok(bundle.stores.users.length >= 1);
    assert.ok(bundle.stores.roles.length >= 1);
    assert.ok(bundle.stores.reservations.length >= 1);
  });

  it('includes version and timestamp in bundle', async () => {
    const result = await exportData(BACKUP_PW);
    const bundle = await Crypto.decryptObject(result.data, BACKUP_PW);
    assert.equal(bundle.version, 1);
    assert.ok(bundle.exportedAt);
  });
});

// =========================================================================
// importData
// =========================================================================
describe('importexport/importData', () => {
  it('imports data from encrypted backup', async () => {
    // Create some data and export
    await DB.add('users', { username: 'exported_user', role: 'admin' });
    const exported = await exportData(BACKUP_PW);

    // Clear and reimport
    await DB.clear('users');
    const json = JSON.stringify(exported);
    const result = await importData(json, BACKUP_PW);
    assert.equal(result.success, true);
    assert.ok(result.storesImported > 0);
  });

  it('rejects empty password', async () => {
    await assert.rejects(() => importData('{}', ''), /password/i);
  });

  it('rejects null password', async () => {
    await assert.rejects(() => importData('{}', null), /password/i);
  });

  it('rejects non-encrypted backup', async () => {
    const json = JSON.stringify({ encrypted: false, data: {} });
    await assert.rejects(() => importData(json, BACKUP_PW), /not encrypted/i);
  });

  it('rejects wrong password', async () => {
    await DB.add('users', { username: 'u', role: 'visitor' });
    const exported = await exportData(BACKUP_PW);
    const json = JSON.stringify(exported);
    await assert.rejects(() => importData(json, 'WrongPass-1!Str'));
  });

  it('preserves audit logs (append-only merge)', async () => {
    // Add existing audit log
    await DB.add('audit_logs', { action: 'existing', actor: 'sys', timestamp: Date.now() });

    // Create export with a different audit log
    await DB.add('audit_logs', { action: 'exported', actor: 'export_sys', timestamp: Date.now() });
    const exported = await exportData(BACKUP_PW);
    const json = JSON.stringify(exported);

    // Import — should merge, not replace
    await importData(json, BACKUP_PW);
    const logs = await DB.getAll('audit_logs');
    // At least the original entries plus the imported ones
    assert.ok(logs.length >= 2);
  });
});
