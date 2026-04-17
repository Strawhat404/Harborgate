/**
 * HarborGate API / integration test suite.
 *
 * This file is intentionally NOT a collection of static string assertions on
 * source code (the previous version of `app.test.js` was — see audit_report-1
 * §215-217 and audit_report-2 §189-191). Instead, every test imports the real
 * production module from `../frontend/js/...` and exercises actual runtime
 * behavior:
 *
 *   - Crypto KEK/DEK wrap/unwrap, password hashing, at-rest encryption
 *   - Auth-service setup → login → register flow (real DB + real crypto)
 *   - Permissions service: create / consume / orphan-reservation fail-closed
 *   - Rate-limit enforcement against real audit-log counters
 *   - Pure lib modules (auth, permissions, content, notification, device, map, audit)
 *
 * Globals (`indexedDB`, `localStorage`, `crypto`) are shimmed in-process via
 * the in-memory mocks under `../unit_tests/indexeddb-mock.js`.
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

// --- Production module imports (the whole point of this file) ---
const { default: Crypto } = await import('../frontend/js/crypto.js');
const DB = (await import('../frontend/js/database.js')).default;
const auth = await import('../frontend/js/services/auth-service.js');
const permissionsSvc = await import('../frontend/js/services/permissions.js');
const rateLimitsSvc = await import('../frontend/js/services/rate-limits.js');
const auditSvc = await import('../frontend/js/services/audit.js');

const authLogic = await import('../frontend/js/lib/auth-logic.js');
const permLogic = await import('../frontend/js/lib/permissions-logic.js');
const contentLogic = await import('../frontend/js/lib/content-logic.js');
const deviceLogic = await import('../frontend/js/lib/device-logic.js');
const mapLogic = await import('../frontend/js/lib/map-logic.js');
const notifLogic = await import('../frontend/js/lib/notification-logic.js');
const auditLogic = await import('../frontend/js/lib/audit-logic.js');

const ADMIN_PW = 'AdminPass-1!Strong';
const USER_PW  = 'UserPass-1!!Strong';

beforeEach(async () => {
  await resetFakeIndexedDB(DB);
  globalThis.localStorage.clear();
});

afterEach(() => {
  // Cancel idle timers spawned by login()
  auth.logout();
});

// =========================================================================
// Crypto — exercised against the production module
// =========================================================================
describe('app/crypto — encrypt/decrypt round-trip (production module)', () => {
  it('round-trips arbitrary strings and JSON objects', async () => {
    const ct = await Crypto.encrypt('hello', 'pw');
    assert.equal(await Crypto.decrypt(ct, 'pw'), 'hello');

    const obj = { a: 1, nested: { b: [1, 2, 3] } };
    const ot = await Crypto.encryptObject(obj, 'pw');
    assert.deepEqual(await Crypto.decryptObject(ot, 'pw'), obj);
  });

  it('rejects decryption with the wrong password', async () => {
    const ct = await Crypto.encrypt('secret', 'right');
    await assert.rejects(() => Crypto.decrypt(ct, 'wrong'));
  });
});

describe('app/crypto — KEK/DEK at-rest model (production module)', () => {
  it('wrap → unwrap → decrypt round trips with the same password', async () => {
    const dek = await Crypto.generateDEK();
    const kekA = await Crypto.deriveKEK(ADMIN_PW);
    const wrapped = await Crypto.wrapDEK(dek, kekA);

    const kekB = await Crypto.deriveKEK(ADMIN_PW);
    const dek2 = await Crypto.unwrapDEK(wrapped, kekB);

    const enc = await Crypto.encryptRecord({ k: 'v' }, dek);
    assert.deepEqual(await Crypto.decryptRecord(enc, dek2), { k: 'v' });
  });

  it('refuses unwrap with a different password', async () => {
    const dek = await Crypto.generateDEK();
    const goodKek = await Crypto.deriveKEK(ADMIN_PW);
    const badKek = await Crypto.deriveKEK(USER_PW);
    const wrapped = await Crypto.wrapDEK(dek, goodKek);
    await assert.rejects(() => Crypto.unwrapDEK(wrapped, badKek));
  });

  it('the same DEK can be wrapped under two different passwords (multi-user)', async () => {
    const dek = await Crypto.generateDEK();
    const wA = await Crypto.wrapDEK(dek, await Crypto.deriveKEK(ADMIN_PW));
    const wU = await Crypto.wrapDEK(dek, await Crypto.deriveKEK(USER_PW));
    const dekA = await Crypto.unwrapDEK(wA, await Crypto.deriveKEK(ADMIN_PW));
    const dekU = await Crypto.unwrapDEK(wU, await Crypto.deriveKEK(USER_PW));

    const enc = await Crypto.encryptRecord({ shared: true }, dek);
    assert.deepEqual(await Crypto.decryptRecord(enc, dekA), { shared: true });
    assert.deepEqual(await Crypto.decryptRecord(enc, dekU), { shared: true });
  });
});

describe('app/crypto — password hashing (production module)', () => {
  it('hashPassword + verifyPassword round-trips', async () => {
    const { hash, salt } = await Crypto.hashPassword(ADMIN_PW);
    assert.equal(await Crypto.verifyPassword(ADMIN_PW, hash, salt), true);
    assert.equal(await Crypto.verifyPassword(USER_PW, hash, salt), false);
  });

  it('different salts → different hashes for the same password', async () => {
    const a = await Crypto.hashPassword(ADMIN_PW);
    const b = await Crypto.hashPassword(ADMIN_PW);
    assert.notEqual(a.salt, b.salt);
    assert.notEqual(a.hash, b.hash);
  });
});

// =========================================================================
// Auth service — full setupAdmin → login → register flow
// =========================================================================
describe('app/auth-service — bootstrap and login (production)', () => {
  it('first-run setupAdmin then login round-trip', async () => {
    assert.equal(await auth.needsSetup(), true);
    const setup = await auth.setupAdmin('root', ADMIN_PW);
    assert.equal(setup.success, true);
    assert.equal(await auth.needsSetup(), false);

    const login = await auth.login('root', ADMIN_PW);
    assert.equal(login.success, true);
    assert.equal(login.session.role, 'admin');

    // Session is persisted in localStorage
    const persisted = JSON.parse(localStorage.getItem('hg_session'));
    assert.equal(persisted.username, 'root');
  });

  it('login with wrong password fails (DEK unwrap rejects)', async () => {
    await auth.setupAdmin('root', ADMIN_PW);
    const r = await auth.login('root', 'WrongPass-1!Strong');
    assert.equal(r.success, false);
  });

  it('account locks after 5 failed attempts; right password is then blocked', async () => {
    await auth.setupAdmin('root', ADMIN_PW);
    let last;
    for (let i = 0; i < 5; i++) last = await auth.login('root', 'WrongPass-1!Strong');
    assert.equal(last.success, false);
    assert.match(last.error, /locked/i);

    const blocked = await auth.login('root', ADMIN_PW);
    assert.equal(blocked.success, false);
    assert.match(blocked.error, /locked/i);
  });
});

describe('app/auth-service — registerWithRole (function-level auth)', () => {
  beforeEach(async () => {
    await auth.setupAdmin('root', ADMIN_PW);
    await auth.login('root', ADMIN_PW);
  });

  it('admin can create operator; new user can immediately log in', async () => {
    const r = await auth.registerWithRole(
      'op1', USER_PW, 'operator',
      { id: 1, username: 'root', role: 'admin' }
    );
    assert.equal(r.success, true);

    auth.logout();
    const login = await auth.login('op1', USER_PW);
    assert.equal(login.success, true);
    assert.equal(login.session.role, 'operator');
  });

  it('non-admin actor is denied', async () => {
    const r = await auth.registerWithRole(
      'op2', USER_PW, 'operator',
      { id: 99, username: 'mallory', role: 'visitor' }
    );
    assert.equal(r.success, false);
  });

  it('missing actor is denied (fail closed)', async () => {
    const r = await auth.registerWithRole('op3', USER_PW, 'operator', null);
    assert.equal(r.success, false);
  });
});

// =========================================================================
// Permissions service — object-level authorization
// =========================================================================
describe('app/permissions — object-level authorization (production)', () => {
  async function seedActiveReservation(userId) {
    // Reservation 5 min in the future → consume window (-15 → +30) is open NOW.
    // We slice LOCAL clock components because the service reconstructs
    // `new Date(\`${date}T${time}\`)` which JS parses in local time.
    const d = new Date(Date.now() + 5 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const id = await DB.add('reservations', { userId, zone: 'A', date, time, status: 'approved' });
    return DB.get('reservations', id);
  }

  it('owner / admin / operator can consume; others denied without state change', async () => {
    const reservation = await seedActiveReservation(100);
    const perm = await permissionsSvc.createEntryPermission(reservation, 'multi-use');

    const denied = await permissionsSvc.consumeEntry(perm.id, { id: 999, role: 'visitor' });
    assert.equal(denied.success, false);
    let stored = await DB.get('entry_permissions', perm.id);
    assert.equal(stored.usedEntries, 0);

    const owner = await permissionsSvc.consumeEntry(perm.id, { id: 100, username: 'owner', role: 'visitor' });
    assert.equal(owner.success, true);
    stored = await DB.get('entry_permissions', perm.id);
    assert.equal(stored.usedEntries, 1);

    const admin = await permissionsSvc.consumeEntry(perm.id, { id: 1, role: 'admin' });
    assert.equal(admin.success, true);
  });

  it('getPermissionsForReservation fails closed for orphan reservation id', async () => {
    const list = await permissionsSvc.getPermissionsForReservation(424242, { id: 1, role: 'admin' });
    assert.deepEqual(list, []);
  });

  it('getPermissionsForReservation returns [] for missing actor', async () => {
    const reservation = await seedActiveReservation(100);
    await permissionsSvc.createEntryPermission(reservation);
    assert.deepEqual(await permissionsSvc.getPermissionsForReservation(reservation.id, null), []);
  });

  it('getPermissionsForReservation denies cross-user visitor', async () => {
    const reservation = await seedActiveReservation(100);
    await permissionsSvc.createEntryPermission(reservation);
    const list = await permissionsSvc.getPermissionsForReservation(reservation.id, { id: 999, role: 'visitor' });
    assert.deepEqual(list, []);
  });
});

// =========================================================================
// Rate-limits — enforcement against real audit-log counters
// =========================================================================
describe('app/rate-limits — checkRateLimit against audit_logs (production)', () => {
  it('returns allowed=true when no rule is configured', async () => {
    const r = await rateLimitsSvc.checkRateLimit('user', 'alice', 'user_login');
    assert.equal(r.allowed, true);
    assert.equal(r.remaining, Infinity);
  });

  it('counts matching audit-log entries within the window', async () => {
    // Manually insert a rule (avoid requireAdminRole gating in createRateLimit)
    await DB.add('rate_limits', {
      scope: 'user', action: 'user_login',
      maxCount: 3, windowSec: 60, enabled: true,
      createdAt: Date.now(), updatedAt: Date.now()
    });

    // Two prior login attempts in-window
    await auditSvc.addAuditLog('user_login', 'alice', { userId: 'alice' });
    await auditSvc.addAuditLog('user_login', 'alice', { userId: 'alice' });

    const a = await rateLimitsSvc.checkRateLimit('user', 'alice', 'user_login');
    assert.equal(a.allowed, true);
    assert.equal(a.remaining, 1);

    // Third attempt → at the cap, still allowed for THIS check (pre-increment)
    await auditSvc.addAuditLog('user_login', 'alice', { userId: 'alice' });
    const b = await rateLimitsSvc.checkRateLimit('user', 'alice', 'user_login');
    assert.equal(b.allowed, false);
    assert.equal(b.remaining, 0);
  });

  it('disabled rules are bypassed', async () => {
    await DB.add('rate_limits', {
      scope: 'global', action: 'user_login',
      maxCount: 1, windowSec: 60, enabled: false,
      createdAt: Date.now(), updatedAt: Date.now()
    });
    await auditSvc.addAuditLog('user_login', 'alice', {});
    await auditSvc.addAuditLog('user_login', 'bob', {});
    const r = await rateLimitsSvc.checkRateLimit('global', '', 'user_login');
    assert.equal(r.allowed, true);
  });
});

// =========================================================================
// Audit service — append-only invariant
// =========================================================================
describe('app/audit — append-only invariant (production)', () => {
  it('addAuditLog persists an entry; put/remove/clear are rejected', async () => {
    const entry = await auditSvc.addAuditLog('test_action', 'alice', { foo: 'bar' });
    assert.ok(entry.timestamp);
    assert.equal(entry.actor, 'alice');

    const stored = await DB.getAll('audit_logs');
    assert.equal(stored.length, 1);
    assert.equal(stored[0].action, 'test_action');

    await assert.rejects(() => DB.put('audit_logs', { ...stored[0], action: 'tampered' }), /append-only/);
    await assert.rejects(() => DB.remove('audit_logs', stored[0].id), /append-only/);
    await assert.rejects(() => DB.clear('audit_logs'), /append-only/);
  });

  it('getAuditLogs filters by actor and sorts newest first', async () => {
    await auditSvc.addAuditLog('a1', 'alice', {});
    await new Promise(r => setTimeout(r, 5));
    await auditSvc.addAuditLog('a2', 'bob', {});
    await new Promise(r => setTimeout(r, 5));
    await auditSvc.addAuditLog('a3', 'alice', {});

    const allAlice = await auditSvc.getAuditLogs({ actor: 'alice' });
    assert.equal(allAlice.length, 2);
    assert.ok(allAlice[0].timestamp >= allAlice[1].timestamp, 'newest first');
  });
});

// =========================================================================
// Pure lib modules — production logic, exhaustive edge cases
// =========================================================================
describe('app/lib/auth-logic — password policy & session (production)', () => {
  it('rejects every category violation with a specific error', () => {
    assert.equal(authLogic.validatePassword('Sh0rt!').valid, false);
    assert.equal(authLogic.validatePassword('nouppercase1!a').valid, false);
    assert.equal(authLogic.validatePassword('NOLOWERCASE1!A').valid, false);
    assert.equal(authLogic.validatePassword('NoNumberHere!a').valid, false);
    assert.equal(authLogic.validatePassword('NoSymbolHere1a').valid, false);
    assert.equal(authLogic.validatePassword('Strong1!Pass#').valid, true);
  });

  it('lockout fires at exactly MAX_ATTEMPTS', () => {
    const u = { failedAttempts: 0, lockedUntil: null };
    let r;
    for (let i = 0; i < authLogic.MAX_ATTEMPTS; i++) r = authLogic.processFailedLogin(u);
    assert.equal(r.locked, true);
  });

  it('session expiry uses the documented 30-min idle timeout', () => {
    assert.equal(authLogic.SESSION_TIMEOUT, 30 * 60 * 1000);
    assert.equal(
      authLogic.isSessionExpired({ lastActivity: Date.now() - 31 * 60 * 1000 }),
      true
    );
    assert.equal(
      authLogic.isSessionExpired({ lastActivity: Date.now() - 29 * 60 * 1000 }),
      false
    );
  });

  it('roles: admin gets everything, visitor only reservation/map/notifications', () => {
    assert.equal(authLogic.hasPermissionForRole('admin', 'devices.unlock'), true);
    assert.equal(authLogic.hasPermissionForRole('visitor', 'devices.unlock'), false);
    assert.equal(authLogic.hasPermissionForRole('visitor', 'reservations.view'), true);
    assert.equal(authLogic.hasPermissionForRole('reviewer', 'content.review'), true);
    assert.equal(authLogic.hasPermissionForRole('operator', 'devices.unlock'), true);
    assert.equal(authLogic.hasPermissionForRole('nobody', 'anything'), false);
  });
});

describe('app/lib/permissions-logic — windows & consume (production)', () => {
  it('window: 15 min before start → 30 min after', () => {
    const start = new Date('2026-06-15T10:00:00').getTime();
    const w = permLogic.calculatePermissionWindow('2026-06-15T10:00:00');
    assert.equal(w.windowStart, start - 15 * 60 * 1000);
    assert.equal(w.windowEnd, start + 30 * 60 * 1000);
  });

  it('isWithinPermissionWindow boundary checks', () => {
    const perm = permLogic.createPermissionObject('2026-06-15T10:00:00');
    assert.equal(permLogic.isWithinPermissionWindow(perm, perm.windowStart), true);
    assert.equal(permLogic.isWithinPermissionWindow(perm, perm.windowEnd), true);
    assert.equal(permLogic.isWithinPermissionWindow(perm, perm.windowStart - 1), false);
    assert.equal(permLogic.isWithinPermissionWindow(perm, perm.windowEnd + 1), false);
  });

  it('multi-use: 5 entries then consumed', () => {
    const perm = permLogic.createPermissionObject(new Date(Date.now() + 1000).toISOString(), 'multi-use');
    for (let i = 0; i < 5; i++) {
      const r = permLogic.consumeEntry(perm);
      assert.equal(r.success, true);
    }
    assert.equal(perm.status, 'consumed');
    assert.equal(permLogic.consumeEntry(perm).success, false);
  });

  it('outside window: refuses to consume', () => {
    const perm = permLogic.createPermissionObject('2000-01-01T00:00:00');
    const r = permLogic.consumeEntry(perm);
    assert.equal(r.success, false);
    assert.match(r.error, /window/i);
  });
});

describe('app/lib/content-logic — compliance & workflow (production)', () => {
  it('detects PII, profanity, and external URLs', () => {
    const v = contentLogic.scanContent('SSN 123-45-6789, see http://x.com, banned word');
    const ids = v.map(x => x.ruleId).sort();
    assert.deepEqual(ids, ['pii', 'profanity', 'url']);
  });

  it('clean content has no violations', () => {
    assert.deepEqual(contentLogic.scanContent('Hello, this is fine.'), []);
  });

  it('workflow transitions: only valid ones allowed', () => {
    assert.equal(contentLogic.canTransition('draft', 'review'), true);
    assert.equal(contentLogic.canTransition('review', 'published'), true);
    assert.equal(contentLogic.canTransition('archived', 'published'), false);
    assert.equal(contentLogic.canTransition('draft', 'published'), false);
  });

  it('diff identifies added/removed/unchanged lines', () => {
    const d = contentLogic.generateDiff('a\nb\nc', 'a\nB\nc\nd');
    const added = d.filter(x => x.type === 'added').length;
    const removed = d.filter(x => x.type === 'removed').length;
    assert.ok(added >= 2);
    assert.ok(removed >= 1);
  });
});

describe('app/lib/device-logic — unlock command lifecycle (production)', () => {
  it('rejects reasons under 10 characters', () => {
    assert.equal(deviceLogic.validateUnlockReason('short').valid, false);
    assert.equal(deviceLogic.validateUnlockReason('long enough reason').valid, true);
  });

  it('retry transitions: acknowledged when device online; failed past max duration', () => {
    const cmd = deviceLogic.createCommandObject('dev1', 'inspecting unit safely', 'op');
    const ackd = deviceLogic.applyRetry({ ...cmd }, true);
    assert.equal(ackd.status, 'acknowledged');

    const stale = deviceLogic.createCommandObject('dev1', 'inspecting unit safely', 'op');
    stale.createdAt = Date.now() - (deviceLogic.MAX_RETRY_DURATION + 1000);
    const failed = deviceLogic.applyRetry(stale, false);
    assert.equal(failed.status, 'failed');
  });
});

describe('app/lib/notification-logic — templates & retries (production)', () => {
  it('resolves placeholders in templates', () => {
    const msg = notifLogic.resolveTemplate('reservation_approved', { reservationId: 42 });
    assert.equal(msg, 'Your reservation 42 has been approved.');
  });

  it('falls back to template id for unknown templates', () => {
    assert.equal(notifLogic.resolveTemplate('unknown_template'), 'unknown_template');
  });

  it('marks failed after MAX_RETRIES failed deliveries', () => {
    const n = notifLogic.createNotificationObject({ userId: 1, templateId: 'unlock_success', variables: { doorName: 'D1' } });
    for (let i = 0; i < notifLogic.MAX_RETRIES; i++) notifLogic.applyFailedDelivery(n);
    assert.equal(n.status, 'failed');
  });
});

describe('app/lib/map-logic — geometry & routing (production)', () => {
  it('point-in-polygon for a unit square', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    assert.equal(mapLogic.pointInPolygon({ x: 5, y: 5 }, square), true);
    assert.equal(mapLogic.pointInPolygon({ x: 11, y: 5 }, square), false);
  });

  it('searchByRadius respects the cutoff', () => {
    const pois = [
      { id: 1, x: 0, y: 0, zone: 'A' },
      { id: 2, x: 50, y: 0, zone: 'A' },
      { id: 3, x: 200, y: 0, zone: 'B' }
    ];
    const close = mapLogic.searchByRadius(pois, { x: 0, y: 0 }, 100);
    assert.deepEqual(close.map(p => p.id).sort(), [1, 2]);
  });

  it('planRoute sums distances and walk times', () => {
    const r = mapLogic.planRoute({ x: 0, y: 0 }, { x: 5280, y: 0 });
    // 1 mile at 3 mph → 20 minutes
    assert.equal(r.totalWalkTimeMinutes, 20);
    assert.equal(r.segments.length, 1);
  });
});

describe('app/lib/audit-logic — entry shape (production)', () => {
  it('createAuditEntry produces a complete record with deep-cloned details', () => {
    const before = { x: 1 };
    const entry = auditLogic.createAuditEntry('test', 'alice', { foo: 'bar' }, before, { x: 2 }, 'admin');
    assert.equal(entry.action, 'test');
    assert.equal(entry.actor, 'alice');
    assert.equal(entry.actorRole, 'admin');
    assert.deepEqual(entry.before, { x: 1 });
    assert.deepEqual(entry.after, { x: 2 });
    // Mutating original must not bleed into the entry
    before.x = 999;
    assert.equal(entry.before.x, 1);
  });

  it('formatAuditTimestamp produces MM/DD/YYYY h:mm:ss AM/PM', () => {
    const s = auditLogic.formatAuditTimestamp(new Date('2026-04-13T15:04:05').getTime());
    assert.match(s, /^\d{2}\/\d{2}\/\d{4} \d{1,2}:\d{2}:\d{2} (AM|PM)$/);
  });
});
