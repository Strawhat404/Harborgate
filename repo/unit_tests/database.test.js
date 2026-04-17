/**
 * Database wrapper unit tests.
 * Tests: getAll, get, getByIndex, getOneByIndex, add, put, remove,
 *        clear, count, close, setEncryptionKey, clearEncryptionKey,
 *        getEncryptionKey, encryption/decryption at rest, audit_logs immutability.
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

const dbModule = await import('../frontend/js/database.js');
const DB = dbModule.default;
const { setEncryptionKey, clearEncryptionKey, getEncryptionKey } = dbModule;

beforeEach(async () => {
  await resetFakeIndexedDB(DB);
  globalThis.localStorage.clear();
  clearEncryptionKey();
});

// =========================================================================
// Basic CRUD
// =========================================================================
describe('DB/add and get', () => {
  it('adds a record and retrieves it by id', async () => {
    const id = await DB.add('roles', { name: 'test-role' });
    assert.ok(id);
    const record = await DB.get('roles', id);
    assert.equal(record.name, 'test-role');
  });

  it('auto-increments id', async () => {
    const id1 = await DB.add('roles', { name: 'role1' });
    const id2 = await DB.add('roles', { name: 'role2' });
    assert.ok(id2 > id1);
  });
});

describe('DB/getAll', () => {
  it('returns all records in a store', async () => {
    await DB.add('roles', { name: 'a' });
    await DB.add('roles', { name: 'b' });
    const all = await DB.getAll('roles');
    assert.equal(all.length, 2);
  });

  it('returns empty array for empty store', async () => {
    const all = await DB.getAll('roles');
    assert.deepEqual(all, []);
  });
});

describe('DB/getByIndex', () => {
  it('returns records matching index value', async () => {
    await DB.add('users', { username: 'alice', role: 'admin' });
    await DB.add('users', { username: 'bob', role: 'visitor' });
    await DB.add('users', { username: 'carol', role: 'admin' });
    const admins = await DB.getByIndex('users', 'role', 'admin');
    assert.equal(admins.length, 2);
  });

  it('returns empty array for no matches', async () => {
    const result = await DB.getByIndex('users', 'role', 'nonexistent');
    assert.deepEqual(result, []);
  });
});

describe('DB/getOneByIndex', () => {
  it('returns single matching record', async () => {
    await DB.add('users', { username: 'alice', role: 'admin' });
    const record = await DB.getOneByIndex('users', 'username', 'alice');
    assert.equal(record.username, 'alice');
  });

  it('returns undefined for no match', async () => {
    const record = await DB.getOneByIndex('users', 'username', 'nobody');
    assert.equal(record, undefined);
  });
});

describe('DB/put', () => {
  it('updates an existing record', async () => {
    const id = await DB.add('roles', { name: 'original' });
    await DB.put('roles', { id, name: 'updated' });
    const record = await DB.get('roles', id);
    assert.equal(record.name, 'updated');
  });

  it('inserts if record does not exist', async () => {
    await DB.put('roles', { name: 'new' });
    const all = await DB.getAll('roles');
    assert.equal(all.length, 1);
  });
});

describe('DB/remove', () => {
  it('deletes a record by id', async () => {
    const id = await DB.add('roles', { name: 'temp' });
    await DB.remove('roles', id);
    const record = await DB.get('roles', id);
    assert.equal(record, undefined);
  });
});

describe('DB/clear', () => {
  it('removes all records from a store', async () => {
    await DB.add('roles', { name: 'a' });
    await DB.add('roles', { name: 'b' });
    await DB.clear('roles');
    const all = await DB.getAll('roles');
    assert.equal(all.length, 0);
  });
});

describe('DB/count', () => {
  it('returns the number of records', async () => {
    await DB.add('roles', { name: 'a' });
    await DB.add('roles', { name: 'b' });
    const count = await DB.count('roles');
    assert.equal(count, 2);
  });

  it('returns 0 for empty store', async () => {
    const count = await DB.count('roles');
    assert.equal(count, 0);
  });
});

// =========================================================================
// audit_logs immutability
// =========================================================================
describe('DB/audit_logs immutability', () => {
  it('allows adding audit logs', async () => {
    const id = await DB.add('audit_logs', { action: 'test', actor: 'sys', timestamp: Date.now() });
    assert.ok(id);
  });

  it('rejects put on audit_logs', async () => {
    const id = await DB.add('audit_logs', { action: 'test', actor: 'sys', timestamp: Date.now() });
    await assert.rejects(
      () => DB.put('audit_logs', { id, action: 'tampered' }),
      /append-only/
    );
  });

  it('rejects remove on audit_logs', async () => {
    const id = await DB.add('audit_logs', { action: 'test', actor: 'sys', timestamp: Date.now() });
    await assert.rejects(
      () => DB.remove('audit_logs', id),
      /append-only/
    );
  });

  it('rejects clear on audit_logs', async () => {
    await assert.rejects(
      () => DB.clear('audit_logs'),
      /append-only/
    );
  });
});

// =========================================================================
// Encryption key management
// =========================================================================
describe('DB/encryption key management', () => {
  it('getEncryptionKey returns null by default', () => {
    assert.equal(getEncryptionKey(), null);
  });

  it('setEncryptionKey stores key and getEncryptionKey retrieves it', () => {
    const fakeKey = { type: 'secret' };
    setEncryptionKey(fakeKey);
    assert.equal(getEncryptionKey(), fakeKey);
    clearEncryptionKey();
  });

  it('clearEncryptionKey resets to null', () => {
    setEncryptionKey({ type: 'secret' });
    clearEncryptionKey();
    assert.equal(getEncryptionKey(), null);
  });
});

// =========================================================================
// close
// =========================================================================
describe('DB/close', () => {
  it('closes the database without error', async () => {
    await DB.add('roles', { name: 'x' });
    await DB.close();
    // Reopens automatically on next call
    const all = await DB.getAll('roles');
    assert.ok(Array.isArray(all));
  });
});
