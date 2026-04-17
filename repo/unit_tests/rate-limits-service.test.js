/**
 * Rate-Limits service unit tests.
 * Tests: getRateLimits, getRateLimitByScope, createRateLimit, updateRateLimit,
 *        deleteRateLimit, checkRateLimit, requireAdminRole authorization.
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
globalThis.window = globalThis.window || {};
globalThis.window.location = globalThis.window.location || { hash: '/' };

const DB = (await import('../frontend/js/database.js')).default;
const auth = await import('../frontend/js/services/auth-service.js');
const rlSvc = await import('../frontend/js/services/rate-limits.js');
const auditSvc = await import('../frontend/js/services/audit.js');

const ADMIN_PW = 'AdminPass-1!Strong';
const VISITOR_PW = 'VisitorPw-1!Str';

async function loginAsAdmin() {
  await auth.setupAdmin('admin', ADMIN_PW);
  await auth.login('admin', ADMIN_PW);
  await auth.requireRole(['admin']);
}

beforeEach(async () => {
  await resetFakeIndexedDB(DB);
  globalThis.localStorage.clear();
});

afterEach(() => { auth.logout(); });

// =========================================================================
// CRUD — requires admin role
// =========================================================================
describe('rateLimits/createRateLimit', () => {
  it('creates a rate limit rule as admin', async () => {
    await loginAsAdmin();
    const result = await rlSvc.createRateLimit(
      { scope: 'user', action: 'user_login', maxCount: 5, windowSec: 60 },
      'admin'
    );
    assert.equal(result.success, true);
    assert.ok(result.id);
  });

  it('rejects creation by non-admin', async () => {
    await loginAsAdmin();
    await auth.registerWithRole('v1', VISITOR_PW, 'visitor', { id: 1, username: 'admin', role: 'admin' });
    auth.logout();
    await auth.login('v1', VISITOR_PW);
    await auth.requireAuth();
    await assert.rejects(
      () => rlSvc.createRateLimit({ scope: 'user', action: 'test', maxCount: 1, windowSec: 1 }, 'v1'),
      /Unauthorized/
    );
  });

  it('rejects duplicate scope+action', async () => {
    await loginAsAdmin();
    await rlSvc.createRateLimit({ scope: 'user', action: 'user_login', maxCount: 5, windowSec: 60 }, 'admin');
    const dup = await rlSvc.createRateLimit({ scope: 'user', action: 'user_login', maxCount: 10, windowSec: 120 }, 'admin');
    assert.equal(dup.success, false);
    assert.match(dup.error, /already exists/);
  });

  it('rejects missing required fields', async () => {
    await loginAsAdmin();
    const result = await rlSvc.createRateLimit({ scope: 'user' }, 'admin');
    assert.equal(result.success, false);
  });

  it('creates audit log for creation', async () => {
    await loginAsAdmin();
    await rlSvc.createRateLimit({ scope: 'global', action: 'unlock_command', maxCount: 3, windowSec: 300 }, 'admin');
    const logs = await DB.getAll('audit_logs');
    assert.ok(logs.some(l => l.action === 'rate_limit_created'));
  });
});

describe('rateLimits/updateRateLimit', () => {
  it('updates maxCount and windowSec', async () => {
    await loginAsAdmin();
    const { id } = await rlSvc.createRateLimit({ scope: 'user', action: 'test_action', maxCount: 5, windowSec: 60 }, 'admin');
    const result = await rlSvc.updateRateLimit(id, { maxCount: 10, windowSec: 120 }, 'admin');
    assert.equal(result.success, true);
    const rule = await DB.get('rate_limits', id);
    assert.equal(rule.maxCount, 10);
    assert.equal(rule.windowSec, 120);
  });

  it('updates enabled status', async () => {
    await loginAsAdmin();
    const { id } = await rlSvc.createRateLimit({ scope: 'user', action: 'test', maxCount: 5, windowSec: 60 }, 'admin');
    await rlSvc.updateRateLimit(id, { enabled: false }, 'admin');
    const rule = await DB.get('rate_limits', id);
    assert.equal(rule.enabled, false);
  });

  it('returns error for non-existent rule', async () => {
    await loginAsAdmin();
    const result = await rlSvc.updateRateLimit(99999, { maxCount: 1 }, 'admin');
    assert.equal(result.success, false);
    assert.match(result.error, /not found/i);
  });

  it('creates audit log for update', async () => {
    await loginAsAdmin();
    const { id } = await rlSvc.createRateLimit({ scope: 'user', action: 'test2', maxCount: 5, windowSec: 60 }, 'admin');
    await rlSvc.updateRateLimit(id, { maxCount: 10 }, 'admin');
    const logs = await DB.getAll('audit_logs');
    assert.ok(logs.some(l => l.action === 'rate_limit_updated'));
  });
});

describe('rateLimits/deleteRateLimit', () => {
  it('deletes an existing rule', async () => {
    await loginAsAdmin();
    const { id } = await rlSvc.createRateLimit({ scope: 'user', action: 'del_test', maxCount: 5, windowSec: 60 }, 'admin');
    const result = await rlSvc.deleteRateLimit(id, 'admin');
    assert.equal(result.success, true);
    const rule = await DB.get('rate_limits', id);
    assert.equal(rule, undefined);
  });

  it('returns error for non-existent rule', async () => {
    await loginAsAdmin();
    const result = await rlSvc.deleteRateLimit(99999, 'admin');
    assert.equal(result.success, false);
  });

  it('creates audit log for deletion', async () => {
    await loginAsAdmin();
    const { id } = await rlSvc.createRateLimit({ scope: 'user', action: 'del_audit', maxCount: 5, windowSec: 60 }, 'admin');
    await rlSvc.deleteRateLimit(id, 'admin');
    const logs = await DB.getAll('audit_logs');
    assert.ok(logs.some(l => l.action === 'rate_limit_deleted'));
  });
});

describe('rateLimits/getRateLimits', () => {
  it('returns all rules', async () => {
    await loginAsAdmin();
    await rlSvc.createRateLimit({ scope: 'user', action: 'a', maxCount: 1, windowSec: 1 }, 'admin');
    await rlSvc.createRateLimit({ scope: 'global', action: 'b', maxCount: 2, windowSec: 2 }, 'admin');
    const all = await rlSvc.getRateLimits();
    assert.equal(all.length, 2);
  });

  it('returns empty array when no rules', async () => {
    const all = await rlSvc.getRateLimits();
    assert.deepEqual(all, []);
  });
});

describe('rateLimits/getRateLimitByScope', () => {
  it('returns matching rule', async () => {
    await loginAsAdmin();
    await rlSvc.createRateLimit({ scope: 'user', action: 'login', maxCount: 5, windowSec: 60 }, 'admin');
    const rule = await rlSvc.getRateLimitByScope('user', 'login');
    assert.ok(rule);
    assert.equal(rule.scope, 'user');
  });

  it('returns null for no match', async () => {
    const rule = await rlSvc.getRateLimitByScope('user', 'nonexistent');
    assert.equal(rule, null);
  });
});

// =========================================================================
// Enforcement
// =========================================================================
describe('rateLimits/checkRateLimit', () => {
  it('returns allowed=true when no rule configured', async () => {
    const result = await rlSvc.checkRateLimit('user', 'alice', 'user_login');
    assert.equal(result.allowed, true);
    assert.equal(result.remaining, Infinity);
  });

  it('counts audit entries within window', async () => {
    await DB.add('rate_limits', { scope: 'user', action: 'user_login', maxCount: 3, windowSec: 60, enabled: true, createdAt: Date.now(), updatedAt: Date.now() });
    await auditSvc.addAuditLog('user_login', 'alice', {});
    await auditSvc.addAuditLog('user_login', 'alice', {});
    const result = await rlSvc.checkRateLimit('user', 'alice', 'user_login');
    assert.equal(result.allowed, true);
    assert.equal(result.remaining, 1);
  });

  it('blocks when limit is reached', async () => {
    await DB.add('rate_limits', { scope: 'user', action: 'user_login', maxCount: 2, windowSec: 60, enabled: true, createdAt: Date.now(), updatedAt: Date.now() });
    await auditSvc.addAuditLog('user_login', 'alice', {});
    await auditSvc.addAuditLog('user_login', 'alice', {});
    const result = await rlSvc.checkRateLimit('user', 'alice', 'user_login');
    assert.equal(result.allowed, false);
    assert.equal(result.remaining, 0);
  });

  it('bypasses disabled rules', async () => {
    await DB.add('rate_limits', { scope: 'user', action: 'user_login', maxCount: 1, windowSec: 60, enabled: false, createdAt: Date.now(), updatedAt: Date.now() });
    await auditSvc.addAuditLog('user_login', 'alice', {});
    await auditSvc.addAuditLog('user_login', 'alice', {});
    const result = await rlSvc.checkRateLimit('user', 'alice', 'user_login');
    assert.equal(result.allowed, true);
  });

  it('global scope counts all actors', async () => {
    await DB.add('rate_limits', { scope: 'global', action: 'user_login', maxCount: 3, windowSec: 60, enabled: true, createdAt: Date.now(), updatedAt: Date.now() });
    await auditSvc.addAuditLog('user_login', 'alice', {});
    await auditSvc.addAuditLog('user_login', 'bob', {});
    await auditSvc.addAuditLog('user_login', 'carol', {});
    const result = await rlSvc.checkRateLimit('global', '', 'user_login');
    assert.equal(result.allowed, false);
  });
});
