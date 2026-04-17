/**
 * Object-level authorization tests against REAL production services.
 *
 * Tests cross-user authorization boundaries by calling the actual service
 * functions (permissions.js, auth-service.js) with real data in the DB.
 * No re-implemented guard logic — all assertions hit the production code paths.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  installFakeIndexedDB,
  installFakeLocalStorage,
  resetFakeIndexedDB
} from './indexeddb-mock.js';

// --- Install global fakes before any production imports ---
if (!globalThis.crypto) globalThis.crypto = webcrypto;
installFakeIndexedDB();
installFakeLocalStorage();
globalThis.window = globalThis.window || {};
globalThis.window.location = globalThis.window.location || { hash: '/' };

// --- Import REAL production modules ---
const DB = (await import('../frontend/js/database.js')).default;
const auth = await import('../frontend/js/services/auth-service.js');
const permissionsSvc = await import('../frontend/js/services/permissions.js');

const ADMIN_PW = 'AdminPass-1!Strong';
const USER_PW = 'UserPass-1!!Strong';

/**
 * Create an approved reservation for the given userId whose time is 5 minutes
 * in the future so the permission window is active.
 */
async function seedActiveReservation(userId) {
  const d = new Date(Date.now() + 5 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const id = await DB.add('reservations', {
    userId,
    zone: 'A',
    date,
    time,
    status: 'approved'
  });
  return DB.get('reservations', id);
}

/**
 * Bootstrap the DB with an admin account and log in so crypto DEK is active.
 * Returns the admin actor object.
 */
async function setupAdminAndLogin() {
  await auth.setupAdmin('root', ADMIN_PW);
  const loginResult = await auth.login('root', ADMIN_PW);
  assert.ok(loginResult.success, 'admin login must succeed for test setup');
  return { id: loginResult.session.userId, username: 'root', role: 'admin' };
}

/**
 * Create a user with a given role via the admin actor.
 * Returns an actor-shaped object { id, username, role }.
 */
async function createUser(adminActor, username, role) {
  const result = await auth.registerWithRole(username, USER_PW, role, adminActor);
  assert.ok(result.success, `creating ${role} user "${username}" must succeed`);
  return { id: result.userId, username, role };
}

// --------------------------------------------------------------------------

beforeEach(async () => {
  await resetFakeIndexedDB(DB);
  globalThis.localStorage.clear();
});

afterEach(() => {
  auth.logout();
});

// ==========================================================================
// consumeEntry authorization (real service)
// ==========================================================================
describe('Object-Level Auth — consumeEntry (real service)', () => {
  it('owner (visitor who created reservation) can consume their own permission', async () => {
    const admin = await setupAdminAndLogin();
    const visitor = await createUser(admin, 'visitor1', 'visitor');

    const reservation = await seedActiveReservation(visitor.id);
    const permission = await permissionsSvc.createEntryPermission(reservation, 'single-use');

    const result = await permissionsSvc.consumeEntry(permission.id, visitor);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.permission.usedEntries, 1);
  });

  it('admin can consume any permission', async () => {
    const admin = await setupAdminAndLogin();
    const visitor = await createUser(admin, 'visitor1', 'visitor');

    const reservation = await seedActiveReservation(visitor.id);
    const permission = await permissionsSvc.createEntryPermission(reservation, 'single-use');

    const result = await permissionsSvc.consumeEntry(permission.id, admin);
    assert.strictEqual(result.success, true);
  });

  it('operator can consume any permission', async () => {
    const admin = await setupAdminAndLogin();
    const visitor = await createUser(admin, 'visitor1', 'visitor');
    const operator = await createUser(admin, 'op1', 'operator');

    const reservation = await seedActiveReservation(visitor.id);
    const permission = await permissionsSvc.createEntryPermission(reservation, 'single-use');

    const result = await permissionsSvc.consumeEntry(permission.id, operator);
    assert.strictEqual(result.success, true);
  });

  it('different visitor cannot consume another visitor\'s permission', async () => {
    const admin = await setupAdminAndLogin();
    const visitor1 = await createUser(admin, 'visitor1', 'visitor');
    const visitor2 = await createUser(admin, 'visitor2', 'visitor');

    const reservation = await seedActiveReservation(visitor1.id);
    const permission = await permissionsSvc.createEntryPermission(reservation, 'single-use');

    const result = await permissionsSvc.consumeEntry(permission.id, visitor2);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Not authorized'));

    // Verify no state change — permission should still be unconsumed
    const perm = await DB.get('entry_permissions', permission.id);
    assert.strictEqual(perm.usedEntries, 0);
  });

  it('reviewer cannot consume (not owner, not operator/admin)', async () => {
    const admin = await setupAdminAndLogin();
    const visitor = await createUser(admin, 'visitor1', 'visitor');
    const reviewer = await createUser(admin, 'reviewer1', 'reviewer');

    const reservation = await seedActiveReservation(visitor.id);
    const permission = await permissionsSvc.createEntryPermission(reservation, 'single-use');

    const result = await permissionsSvc.consumeEntry(permission.id, reviewer);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Not authorized'));
  });

  it('null actor passes through (no authorization check) — legacy compat', async () => {
    // When actor is null, the production code skips the ownership check entirely.
    // This tests the actual behavior: null actor is allowed through.
    const admin = await setupAdminAndLogin();
    const visitor = await createUser(admin, 'visitor1', 'visitor');

    const reservation = await seedActiveReservation(visitor.id);
    const permission = await permissionsSvc.createEntryPermission(reservation, 'single-use');

    const result = await permissionsSvc.consumeEntry(permission.id, null);
    // The production code allows null actor through (no guard triggered)
    assert.strictEqual(result.success, true);
  });
});

// ==========================================================================
// getPermissionsForReservation authorization (real service)
// ==========================================================================
describe('Object-Level Auth — getPermissionsForReservation (real service)', () => {
  it('owner can view their own reservation\'s permissions', async () => {
    const admin = await setupAdminAndLogin();
    const visitor = await createUser(admin, 'visitor1', 'visitor');

    const reservation = await seedActiveReservation(visitor.id);
    await permissionsSvc.createEntryPermission(reservation, 'single-use');

    const perms = await permissionsSvc.getPermissionsForReservation(reservation.id, visitor);
    assert.strictEqual(perms.length, 1);
  });

  it('admin can view any reservation\'s permissions', async () => {
    const admin = await setupAdminAndLogin();
    const visitor = await createUser(admin, 'visitor1', 'visitor');

    const reservation = await seedActiveReservation(visitor.id);
    await permissionsSvc.createEntryPermission(reservation, 'single-use');

    const perms = await permissionsSvc.getPermissionsForReservation(reservation.id, admin);
    assert.strictEqual(perms.length, 1);
  });

  it('different visitor returns empty array (fail closed)', async () => {
    const admin = await setupAdminAndLogin();
    const visitor1 = await createUser(admin, 'visitor1', 'visitor');
    const visitor2 = await createUser(admin, 'visitor2', 'visitor');

    const reservation = await seedActiveReservation(visitor1.id);
    await permissionsSvc.createEntryPermission(reservation, 'single-use');

    const perms = await permissionsSvc.getPermissionsForReservation(reservation.id, visitor2);
    assert.strictEqual(perms.length, 0);
  });

  it('null actor returns empty array (fail closed)', async () => {
    const admin = await setupAdminAndLogin();
    const visitor = await createUser(admin, 'visitor1', 'visitor');

    const reservation = await seedActiveReservation(visitor.id);
    await permissionsSvc.createEntryPermission(reservation, 'single-use');

    const perms = await permissionsSvc.getPermissionsForReservation(reservation.id, null);
    assert.strictEqual(perms.length, 0);
  });

  it('operator can view any reservation\'s permissions', async () => {
    const admin = await setupAdminAndLogin();
    const visitor = await createUser(admin, 'visitor1', 'visitor');
    const operator = await createUser(admin, 'op1', 'operator');

    const reservation = await seedActiveReservation(visitor.id);
    await permissionsSvc.createEntryPermission(reservation, 'single-use');

    const perms = await permissionsSvc.getPermissionsForReservation(reservation.id, operator);
    assert.strictEqual(perms.length, 1);
  });

  it('reviewer returns empty array (not owner, not privileged)', async () => {
    const admin = await setupAdminAndLogin();
    const visitor = await createUser(admin, 'visitor1', 'visitor');
    const reviewer = await createUser(admin, 'reviewer1', 'reviewer');

    const reservation = await seedActiveReservation(visitor.id);
    await permissionsSvc.createEntryPermission(reservation, 'single-use');

    const perms = await permissionsSvc.getPermissionsForReservation(reservation.id, reviewer);
    assert.strictEqual(perms.length, 0);
  });
});

// ==========================================================================
// registerWithRole authorization (real service)
// ==========================================================================
describe('Object-Level Auth — registerWithRole (real service)', () => {
  it('admin actor can create users with roles', async () => {
    const admin = await setupAdminAndLogin();

    const result = await auth.registerWithRole('newop', USER_PW, 'operator', admin);
    assert.strictEqual(result.success, true);
    assert.ok(result.userId);
  });

  it('admin actor can create users with any valid role', async () => {
    const admin = await setupAdminAndLogin();

    const visitorResult = await auth.registerWithRole('newvisitor', USER_PW, 'visitor', admin);
    assert.strictEqual(visitorResult.success, true);

    const reviewerResult = await auth.registerWithRole('newreviewer', USER_PW, 'reviewer', admin);
    assert.strictEqual(reviewerResult.success, true);
  });

  it('visitor actor is denied', async () => {
    const admin = await setupAdminAndLogin();
    const visitor = await createUser(admin, 'visitor1', 'visitor');

    const result = await auth.registerWithRole('hacker', USER_PW, 'admin', visitor);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors[0].includes('admin'));
  });

  it('operator actor is denied', async () => {
    const admin = await setupAdminAndLogin();
    const operator = await createUser(admin, 'op1', 'operator');

    const result = await auth.registerWithRole('hacker', USER_PW, 'admin', operator);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors[0].includes('admin'));
  });

  it('reviewer actor is denied', async () => {
    const admin = await setupAdminAndLogin();
    const reviewer = await createUser(admin, 'reviewer1', 'reviewer');

    const result = await auth.registerWithRole('hacker', USER_PW, 'admin', reviewer);
    assert.strictEqual(result.success, false);
  });

  it('null actor is denied', async () => {
    await setupAdminAndLogin();

    const result = await auth.registerWithRole('hacker', USER_PW, 'admin', null);
    assert.strictEqual(result.success, false);
    assert.ok(result.errors[0].includes('admin'));
  });

  it('undefined actor is denied', async () => {
    await setupAdminAndLogin();

    const result = await auth.registerWithRole('hacker', USER_PW, 'admin', undefined);
    assert.strictEqual(result.success, false);
  });
});
