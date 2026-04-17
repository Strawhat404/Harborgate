/**
 * Rate-limits integration test — full CRUD and enforcement lifecycle.
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
globalThis.window = globalThis.window || {};
globalThis.window.location = globalThis.window.location || { hash: '/' };

const DB = (await import('../frontend/js/database.js')).default;
const auth = await import('../frontend/js/services/auth-service.js');
const rlSvc = await import('../frontend/js/services/rate-limits.js');
const auditSvc = await import('../frontend/js/services/audit.js');

const ADMIN_PW = 'AdminPass-1!Strong';

beforeEach(async () => {
  await resetFakeIndexedDB(DB);
  globalThis.localStorage.clear();
});

afterEach(() => { auth.logout(); });

describe('Rate-Limits Integration — full lifecycle', () => {
  it('create → enforce → update → disable → delete', async () => {
    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);
    await auth.requireRole(['admin']);

    // Create rule: max 3 login attempts per user per 60 seconds
    const created = await rlSvc.createRateLimit(
      { scope: 'user', action: 'user_login', maxCount: 3, windowSec: 60 },
      'admin'
    );
    assert.equal(created.success, true);

    // Simulate 2 login attempts
    await auditSvc.addAuditLog('user_login', 'alice', {});
    await auditSvc.addAuditLog('user_login', 'alice', {});

    // Check: should be allowed (1 remaining)
    let check = await rlSvc.checkRateLimit('user', 'alice', 'user_login');
    assert.equal(check.allowed, true);
    assert.equal(check.remaining, 1);

    // 3rd attempt
    await auditSvc.addAuditLog('user_login', 'alice', {});
    check = await rlSvc.checkRateLimit('user', 'alice', 'user_login');
    assert.equal(check.allowed, false);
    assert.equal(check.remaining, 0);

    // Update: increase limit to 5
    await rlSvc.updateRateLimit(created.id, { maxCount: 5 }, 'admin');
    check = await rlSvc.checkRateLimit('user', 'alice', 'user_login');
    assert.equal(check.allowed, true);
    assert.equal(check.remaining, 2);

    // Disable rule
    await rlSvc.updateRateLimit(created.id, { enabled: false }, 'admin');
    check = await rlSvc.checkRateLimit('user', 'alice', 'user_login');
    assert.equal(check.allowed, true);
    assert.equal(check.remaining, Infinity);

    // Delete rule
    const deleted = await rlSvc.deleteRateLimit(created.id, 'admin');
    assert.equal(deleted.success, true);
    const all = await rlSvc.getRateLimits();
    assert.equal(all.length, 0);

    // Verify audit trail
    const logs = await auditSvc.getAuditLogs();
    const actions = logs.map(l => l.action);
    assert.ok(actions.includes('rate_limit_created'));
    assert.ok(actions.includes('rate_limit_updated'));
    assert.ok(actions.includes('rate_limit_deleted'));
  });

  it('global scope counts all users', async () => {
    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);
    await auth.requireRole(['admin']);

    await rlSvc.createRateLimit(
      { scope: 'global', action: 'unlock_command', maxCount: 5, windowSec: 60 },
      'admin'
    );

    // Different actors
    for (let i = 0; i < 5; i++) {
      await auditSvc.addAuditLog('unlock_command', `user${i}`, {});
    }

    const check = await rlSvc.checkRateLimit('global', '', 'unlock_command');
    assert.equal(check.allowed, false);
  });

  it('different actions are counted independently', async () => {
    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);
    await auth.requireRole(['admin']);

    await rlSvc.createRateLimit({ scope: 'user', action: 'user_login', maxCount: 2, windowSec: 60 }, 'admin');

    await auditSvc.addAuditLog('user_login', 'alice', {});
    await auditSvc.addAuditLog('user_login', 'alice', {});
    await auditSvc.addAuditLog('unlock_command', 'alice', {}); // different action

    const loginCheck = await rlSvc.checkRateLimit('user', 'alice', 'user_login');
    assert.equal(loginCheck.allowed, false);

    // unlock_command has no rule, so it's allowed
    const unlockCheck = await rlSvc.checkRateLimit('user', 'alice', 'unlock_command');
    assert.equal(unlockCheck.allowed, true);
  });

  it('non-admin cannot create/update/delete rate limits', async () => {
    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);
    await auth.requireRole(['admin']);
    await auth.registerWithRole('visitor1', 'VisitorPw-1!Str', 'visitor', { id: 1, username: 'admin', role: 'admin' });
    auth.logout();
    await auth.login('visitor1', 'VisitorPw-1!Str');
    await auth.requireAuth();

    await assert.rejects(
      () => rlSvc.createRateLimit({ scope: 'user', action: 'test', maxCount: 1, windowSec: 1 }, 'visitor1'),
      /Unauthorized/
    );
    await assert.rejects(
      () => rlSvc.updateRateLimit(1, { maxCount: 10 }, 'visitor1'),
      /Unauthorized/
    );
    await assert.rejects(
      () => rlSvc.deleteRateLimit(1, 'visitor1'),
      /Unauthorized/
    );
  });
});
