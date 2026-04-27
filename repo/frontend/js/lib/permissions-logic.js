/**
 * Pure entry-permission logic — no browser/DB dependencies.
 */

export const WINDOW_BEFORE_MS = 15 * 60 * 1000; // 15 min before
export const WINDOW_AFTER_MS = 30 * 60 * 1000;  // 30 min after

export function calculatePermissionWindow(reservationStartTime) {
  const start = new Date(reservationStartTime).getTime();
  return {
    windowStart: start - WINDOW_BEFORE_MS,
    windowEnd: start + WINDOW_AFTER_MS
  };
}

export function isWithinPermissionWindow(permission, now = Date.now()) {
  return now >= permission.windowStart && now <= permission.windowEnd;
}

export function createPermissionObject(startTime, policy = 'single-use') {
  const { windowStart, windowEnd } = calculatePermissionWindow(startTime);
  return {
    policy,
    maxEntries: policy === 'single-use' ? 1 : 5,
    usedEntries: 0,
    windowStart,
    windowEnd,
    status: 'active'
  };
}

export function consumeEntry(perm, now = Date.now()) {
  if (perm.status === 'consumed') return { success: false, error: 'Permission already fully consumed' };
  if (perm.status === 'expired') return { success: false, error: 'Permission has expired' };
  if (perm.status === 'cancelled') return { success: false, error: 'Permission has been cancelled' };
  if (!isWithinPermissionWindow(perm, now)) return { success: false, error: 'Outside permission time window' };

  perm.usedEntries += 1;
  if (perm.usedEntries >= perm.maxEntries) {
    perm.status = 'consumed';
  }
  return { success: true, permission: perm };
}

export function getPermissionStatusLabel(perm, now = Date.now()) {
  if (perm.status === 'consumed') return 'Consumed';
  if (perm.status === 'expired') return 'Expired';
  if (isWithinPermissionWindow(perm, now)) return 'Active';
  if (now < perm.windowStart) return 'Pending';
  return 'Expired';
}
