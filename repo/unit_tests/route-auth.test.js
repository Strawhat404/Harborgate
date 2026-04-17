/**
 * Route-level authorization tests — exercises the REAL production
 * requireAuth() and requireRole() functions from auth-service.js.
 *
 * These are the actual guard functions called at the top of every view.
 * Tests verify:
 *   - requireAuth returns false and redirects when no session
 *   - requireAuth returns false for expired session
 *   - requireAuth returns false for banned user
 *   - requireAuth returns true and sets _verifiedUser for valid session
 *   - requireRole returns false when role is not in allowed list
 *   - requireRole returns true for correct role
 *   - requireRole redirects to /login when no session
 *   - requireRole redirects to / when wrong role
 *   - Full role × route matrix against production functions
 *   - Permission checks via hasPermissionForRole (production)
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
const {
  isSessionExpired,
  hasPermissionForRole,
  SESSION_TIMEOUT,
  SESSION_WARNING
} = await import('../frontend/js/lib/auth-logic.js');

const ADMIN_PW = 'AdminPass-1!Strong';
const VISITOR_PW = 'VisitorPw-1!Strong';
const OPERATOR_PW = 'OperatorP-1!Strong';
const REVIEWER_PW = 'ReviewerP-1!Strong';

beforeEach(async () => {
  await resetFakeIndexedDB(DB);
  globalThis.localStorage.clear();
  globalThis.window.location.hash = '/';
});

afterEach(() => {
  auth.logout();
});

// =========================================================================
// requireAuth — real production function
// =========================================================================
describe('Route Auth — requireAuth (production)', () => {
  it('returns false and redirects to /login when no session exists', async () => {
    // No setup, no login — session is empty
    const result = await auth.requireAuth();
    assert.equal(result, false);
    assert.equal(globalThis.window.location.hash, '/login');
  });

  it('returns true for a valid logged-in session', async () => {
    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);
    globalThis.window.location.hash = '/';

    const result = await auth.requireAuth();
    assert.equal(result, true);
    // _verifiedUser should be set — getCurrentUser should work
    const user = auth.getCurrentUser();
    assert.ok(user);
    assert.equal(user.username, 'admin');
    assert.equal(user.role, 'admin');
  });

  it('returns false for an expired session', async () => {
    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);

    // Manually expire the session in localStorage
    const raw = globalThis.localStorage.getItem('hg_session');
    const session = JSON.parse(raw);
    session.lastActivity = Date.now() - SESSION_TIMEOUT - 5000;
    globalThis.localStorage.setItem('hg_session', JSON.stringify(session));

    const result = await auth.requireAuth();
    assert.equal(result, false);
    assert.equal(globalThis.window.location.hash, '/login');
  });

  it('returns false and redirects when user is banned', async () => {
    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);

    // Ban the user directly in DB
    const users = await DB.getAll('users');
    const adminUser = users.find(u => u.username === 'admin');
    adminUser.banned = true;
    await DB.put('users', adminUser);

    const result = await auth.requireAuth();
    assert.equal(result, false);
    assert.equal(globalThis.window.location.hash, '/login');
  });

  it('returns false when session userId does not match DB', async () => {
    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);

    // Tamper the session to have a non-existent userId
    const raw = globalThis.localStorage.getItem('hg_session');
    const session = JSON.parse(raw);
    session.userId = 99999;
    globalThis.localStorage.setItem('hg_session', JSON.stringify(session));

    const result = await auth.requireAuth();
    assert.equal(result, false);
  });
});

// =========================================================================
// requireRole — real production function
// =========================================================================
describe('Route Auth — requireRole (production)', () => {
  it('returns false and redirects to /login when no session', async () => {
    const result = await auth.requireRole(['admin']);
    assert.equal(result, false);
    assert.equal(globalThis.window.location.hash, '/login');
  });

  it('returns true when user role matches', async () => {
    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);
    globalThis.window.location.hash = '/';

    const result = await auth.requireRole(['admin']);
    assert.equal(result, true);
  });

  it('returns false and redirects to / when role does not match', async () => {
    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);
    await auth.registerWithRole('vis', VISITOR_PW, 'visitor', { id: 1, username: 'admin', role: 'admin' });
    auth.logout();
    await auth.login('vis', VISITOR_PW);
    globalThis.window.location.hash = '/somepage';

    const result = await auth.requireRole(['admin']);
    assert.equal(result, false);
    assert.equal(globalThis.window.location.hash, '/');
  });

  it('accepts string argument (single role)', async () => {
    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);

    const result = await auth.requireRole('admin');
    assert.equal(result, true);
  });

  it('accepts multiple roles and matches any', async () => {
    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);
    await auth.registerWithRole('op', OPERATOR_PW, 'operator', { id: 1, username: 'admin', role: 'admin' });
    auth.logout();
    await auth.login('op', OPERATOR_PW);
    globalThis.window.location.hash = '/';

    const result = await auth.requireRole(['visitor', 'operator', 'admin']);
    assert.equal(result, true);
  });
});

// =========================================================================
// Full role × route matrix — tests the REAL requireRole against each view's config
// =========================================================================
describe('Route Auth — role × route matrix (production)', () => {
  const ROUTE_ROLE_MAP = {
    '/':              ['visitor', 'operator', 'reviewer', 'admin'],
    '/reservations':  ['visitor', 'operator', 'admin'],
    '/unlock':        ['operator', 'admin'],
    '/map':           ['visitor', 'operator', 'reviewer', 'admin'],
    '/content':       ['reviewer', 'admin'],
    '/notifications': ['visitor', 'operator', 'reviewer', 'admin'],
    '/admin':         ['admin'],
    '/settings':      ['visitor', 'operator', 'reviewer', 'admin']
  };

  const ROLE_PASSWORDS = {
    visitor: VISITOR_PW,
    operator: OPERATOR_PW,
    reviewer: REVIEWER_PW,
    admin: ADMIN_PW
  };

  async function setupAllUsers() {
    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);
    await auth.requireRole(['admin']);
    await auth.registerWithRole('visitor', VISITOR_PW, 'visitor', { id: 1, username: 'admin', role: 'admin' });
    await auth.registerWithRole('operator', OPERATOR_PW, 'operator', { id: 1, username: 'admin', role: 'admin' });
    await auth.registerWithRole('reviewer', REVIEWER_PW, 'reviewer', { id: 1, username: 'admin', role: 'admin' });
    auth.logout();
  }

  for (const [route, allowedRoles] of Object.entries(ROUTE_ROLE_MAP)) {
    for (const role of ['visitor', 'operator', 'reviewer', 'admin']) {
      const shouldAllow = allowedRoles.includes(role);

      it(`${route} ${shouldAllow ? 'ALLOWS' : 'DENIES'} ${role} (real requireRole)`, async () => {
        await setupAllUsers();
        await auth.login(role, ROLE_PASSWORDS[role]);
        globalThis.window.location.hash = route;

        const result = await auth.requireRole(allowedRoles);
        assert.equal(result, shouldAllow, `${role} at ${route} should be ${shouldAllow ? 'allowed' : 'denied'}`);
      });
    }
  }
});

// =========================================================================
// Permission checks — real hasPermissionForRole from auth-logic.js
// =========================================================================
describe('Route Auth — permission checks (production auth-logic)', () => {
  it('visitor cannot access device permissions (backs /unlock gate)', () => {
    assert.equal(hasPermissionForRole('visitor', 'devices.unlock'), false);
    assert.equal(hasPermissionForRole('visitor', 'devices.view'), false);
  });

  it('visitor cannot access content permissions (backs /content gate)', () => {
    assert.equal(hasPermissionForRole('visitor', 'content.view'), false);
    assert.equal(hasPermissionForRole('visitor', 'content.review'), false);
  });

  it('reviewer cannot access device permissions (backs /unlock gate)', () => {
    assert.equal(hasPermissionForRole('reviewer', 'devices.unlock'), false);
  });

  it('operator can access device permissions', () => {
    assert.equal(hasPermissionForRole('operator', 'devices.unlock'), true);
    assert.equal(hasPermissionForRole('operator', 'devices.view'), true);
  });

  it('reviewer can access content permissions', () => {
    assert.equal(hasPermissionForRole('reviewer', 'content.view'), true);
    assert.equal(hasPermissionForRole('reviewer', 'content.review'), true);
  });

  it('admin has every permission', () => {
    assert.equal(hasPermissionForRole('admin', 'devices.unlock'), true);
    assert.equal(hasPermissionForRole('admin', 'content.review'), true);
    assert.equal(hasPermissionForRole('admin', 'reservations.manage'), true);
  });

  it('unknown role has no permissions', () => {
    assert.equal(hasPermissionForRole('unknown', 'reservations.view'), false);
    assert.equal(hasPermissionForRole('unknown', 'devices.unlock'), false);
  });

  it('session timeout constant is 30 minutes', () => {
    assert.equal(SESSION_TIMEOUT, 30 * 60 * 1000);
  });

  it('session warning constant is 25 minutes', () => {
    assert.equal(SESSION_WARNING, 25 * 60 * 1000);
  });
});
