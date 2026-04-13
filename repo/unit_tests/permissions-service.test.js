/**
 * Behavioral tests against the ACTUAL production `services/permissions.js`.
 *
 * The audit specifically called out the need for runtime tests that prove
 * fail-closed object-level authorization (cross-user denial, orphaned
 * permissions, missing reservations) — not just static guard-string checks.
 *
 * We install a minimal in-memory IndexedDB shim so the production module
 * (and its `database.js` + `audit.js` dependencies) can run unmodified.
 */
import { describe, it, before, beforeEach } from 'node:test';
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

// Import production modules AFTER globals are in place
const DB = (await import('../frontend/js/database.js')).default;
const {
  createEntryPermission,
  consumeEntry,
  getPermissionsForReservation,
  expirePermissions,
  calculatePermissionWindow
} = await import('../frontend/js/services/permissions.js');

async function seedReservation(reservation) {
  return DB.add('reservations', reservation);
}

/**
 * Build a reservation date/time strings (local-time) for ~`minutesFromNow`
 * minutes in the future. The service reconstructs `new Date(\`${date}T${time}\`)`
 * which is parsed in LOCAL time, so we must slice local-clock components,
 * not the UTC components from toISOString().
 */
function futureLocalDateTime(minutesFromNow = 60) {
  const d = new Date(Date.now() + minutesFromNow * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
  };
}

beforeEach(async () => {
  await resetFakeIndexedDB(DB);
});

describe('permissions service — createEntryPermission (production)', () => {
  it('persists a permission scoped to the reservation owner', async () => {
    // Future reservation so the window is active
    const { date, time } = futureLocalDateTime(5);
    const resId = await seedReservation({ userId: 100, zone: 'A', date, time, status: 'approved' });
    const reservation = await DB.get('reservations', resId);

    const perm = await createEntryPermission(reservation, 'single-use');
    assert.equal(perm.userId, 100);
    assert.equal(perm.reservationId, resId);
    assert.equal(perm.policy, 'single-use');
    assert.equal(perm.maxEntries, 1);
    assert.equal(perm.status, 'active');

    const stored = await DB.get('entry_permissions', perm.id);
    assert.equal(stored.userId, 100);
    assert.equal(stored.reservationId, resId);
  });

  it('uses the documented 15-min-before / 30-min-after window', async () => {
    const start = new Date('2026-06-15T10:00:00').getTime();
    const reservation = { id: 1, userId: 1, zone: 'A', date: '2026-06-15', time: '10:00' };
    const perm = await createEntryPermission(reservation);
    const expected = calculatePermissionWindow('2026-06-15T10:00:00');
    assert.equal(perm.windowStart, expected.windowStart);
    assert.equal(perm.windowEnd, expected.windowEnd);
    assert.equal(perm.windowStart, start - 15 * 60 * 1000);
    assert.equal(perm.windowEnd, start + 30 * 60 * 1000);
  });
});

describe('permissions service — consumeEntry authorization (production)', () => {
  let permId;
  beforeEach(async () => {
    const { date, time } = futureLocalDateTime(5);
    const resId = await seedReservation({ userId: 100, zone: 'A', date, time, status: 'approved' });
    const reservation = await DB.get('reservations', resId);
    const perm = await createEntryPermission(reservation, 'multi-use');
    permId = perm.id;
  });

  it('allows the owner to consume', async () => {
    const result = await consumeEntry(permId, { id: 100, username: 'owner', role: 'visitor' });
    assert.equal(result.success, true);
    assert.equal(result.permission.usedEntries, 1);
  });

  it('allows an admin to consume any permission', async () => {
    const result = await consumeEntry(permId, { id: 999, username: 'root', role: 'admin' });
    assert.equal(result.success, true);
  });

  it('allows an operator to consume any permission', async () => {
    const result = await consumeEntry(permId, { id: 200, username: 'op', role: 'operator' });
    assert.equal(result.success, true);
  });

  it('denies a different visitor and does not increment counters', async () => {
    const before = await DB.get('entry_permissions', permId);
    const result = await consumeEntry(permId, { id: 999, username: 'mallory', role: 'visitor' });
    assert.equal(result.success, false);
    assert.match(result.error, /Not authorized/);
    const after = await DB.get('entry_permissions', permId);
    assert.equal(after.usedEntries, before.usedEntries);
    assert.equal(after.status, 'active');
  });

  it('denies a reviewer (neither owner nor operator/admin)', async () => {
    const result = await consumeEntry(permId, { id: 400, username: 'rev', role: 'reviewer' });
    assert.equal(result.success, false);
  });

  it('returns a clean error for unknown permission ids', async () => {
    const result = await consumeEntry(99999, { id: 100, username: 'owner', role: 'visitor' });
    assert.equal(result.success, false);
    assert.match(result.error, /not found/i);
  });

  it('marks single-use permissions consumed after one use', async () => {
    // Re-seed as single-use
    const { date, time } = futureLocalDateTime(5);
    const resId = await seedReservation({ userId: 100, zone: 'A', date, time, status: 'approved' });
    const reservation = await DB.get('reservations', resId);
    const perm = await createEntryPermission(reservation, 'single-use');

    const r1 = await consumeEntry(perm.id, { id: 100, username: 'owner', role: 'visitor' });
    assert.equal(r1.success, true);
    assert.equal(r1.permission.status, 'consumed');

    const r2 = await consumeEntry(perm.id, { id: 100, username: 'owner', role: 'visitor' });
    assert.equal(r2.success, false);
    assert.match(r2.error, /already fully consumed/i);
  });
});

describe('permissions service — getPermissionsForReservation (production)', () => {
  it('returns the owner\'s permissions', async () => {
    const { date, time } = futureLocalDateTime(5);
    const resId = await seedReservation({ userId: 100, zone: 'A', date, time, status: 'approved' });
    const reservation = await DB.get('reservations', resId);
    await createEntryPermission(reservation);

    const list = await getPermissionsForReservation(resId, { id: 100, username: 'owner', role: 'visitor' });
    assert.equal(list.length, 1);
    assert.equal(list[0].reservationId, resId);
  });

  it('fails closed (returns []) when no actor is supplied', async () => {
    const { date, time } = futureLocalDateTime(5);
    const resId = await seedReservation({ userId: 100, zone: 'A', date, time, status: 'approved' });
    const reservation = await DB.get('reservations', resId);
    await createEntryPermission(reservation);

    const list = await getPermissionsForReservation(resId, null);
    assert.deepEqual(list, []);
  });

  it('fails closed when the reservation does not exist (orphan / deleted)', async () => {
    // No reservation seeded — id 12345 is unknown
    const list = await getPermissionsForReservation(12345, { id: 100, username: 'owner', role: 'visitor' });
    assert.deepEqual(list, [], 'must return empty rather than enumerating orphan permissions');
  });

  it('denies a different visitor (returns [])', async () => {
    const { date, time } = futureLocalDateTime(5);
    const resId = await seedReservation({ userId: 100, zone: 'A', date, time, status: 'approved' });
    const reservation = await DB.get('reservations', resId);
    await createEntryPermission(reservation);

    const list = await getPermissionsForReservation(resId, { id: 999, username: 'mallory', role: 'visitor' });
    assert.deepEqual(list, []);
  });

  it('admin can view any reservation\'s permissions', async () => {
    const { date, time } = futureLocalDateTime(5);
    const resId = await seedReservation({ userId: 100, zone: 'A', date, time, status: 'approved' });
    const reservation = await DB.get('reservations', resId);
    await createEntryPermission(reservation);

    const list = await getPermissionsForReservation(resId, { id: 1, username: 'root', role: 'admin' });
    assert.equal(list.length, 1);
  });
});

describe('permissions service — expirePermissions (production)', () => {
  it('marks permissions as expired once windowEnd has passed', async () => {
    // Reservation in the deep past
    const reservation = { id: 1, userId: 100, zone: 'A', date: '2000-01-01', time: '10:00' };
    const perm = await createEntryPermission(reservation);
    assert.equal(perm.status, 'active');

    const expired = await expirePermissions();
    assert.ok(expired >= 1);
    const stored = await DB.get('entry_permissions', perm.id);
    assert.equal(stored.status, 'expired');
  });

  it('leaves active future-windowed permissions alone', async () => {
    const { date, time } = futureLocalDateTime(5);
    const reservation = { id: 1, userId: 100, zone: 'A', date, time };
    const perm = await createEntryPermission(reservation);

    await expirePermissions();
    const stored = await DB.get('entry_permissions', perm.id);
    assert.equal(stored.status, 'active');
  });
});
