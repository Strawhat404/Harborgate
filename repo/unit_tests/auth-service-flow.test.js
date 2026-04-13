/**
 * End-to-end behavioral tests against the production `services/auth-service.js`.
 *
 * Exercises the full KEK/DEK orchestration:
 *   setupAdmin → wraps shared DEK under admin's password-derived KEK
 *   login      → unwraps DEK using password, then verifies password hash
 *   register   → wraps the SAME DEK under the new user's KEK
 *
 * The audit explicitly called for tests "importing production crypto.js +
 * auth-service.js for deriveKEK/wrapDEK/unwrapDEK flow" — this file does that.
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

const DB = (await import('../frontend/js/database.js')).default;
const auth = await import('../frontend/js/services/auth-service.js');

const ADMIN_PW = 'AdminPass-1!Strong';
const USER_PW  = 'UserPass-1!!Strong';

beforeEach(async () => {
  await resetFakeIndexedDB(DB);
  globalThis.localStorage.clear();
});

afterEach(() => {
  // Cancel any pending idle timers from login()
  auth.logout();
});

describe('auth-service — first-run setup', () => {
  it('reports needsSetup when no users exist', async () => {
    assert.equal(await auth.needsSetup(), true);
  });

  it('setupAdmin creates the admin and persists wrapped keys', async () => {
    const result = await auth.setupAdmin('root', ADMIN_PW);
    assert.equal(result.success, true);
    assert.equal(await auth.needsSetup(), false);

    const wrapped = JSON.parse(localStorage.getItem('hg_wrapped_keys'));
    assert.ok(wrapped.root, 'admin DEK wrap must be persisted');
    assert.ok(wrapped.root.iv && wrapped.root.wrapped);
  });

  it('refuses to run setupAdmin twice', async () => {
    await auth.setupAdmin('root', ADMIN_PW);
    const second = await auth.setupAdmin('other', ADMIN_PW);
    assert.equal(second.success, false);
  });

  it('rejects setupAdmin with a weak password', async () => {
    const result = await auth.setupAdmin('root', 'weak');
    assert.equal(result.success, false);
    assert.ok(result.errors.length > 0);
  });
});

describe('auth-service — login KEK/DEK flow', () => {
  beforeEach(async () => {
    await auth.setupAdmin('root', ADMIN_PW);
  });

  it('logs in successfully with the right password', async () => {
    const result = await auth.login('root', ADMIN_PW);
    assert.equal(result.success, true);
    assert.equal(result.session.username, 'root');
    assert.equal(result.session.role, 'admin');
  });

  it('rejects login with the wrong password (KEK unwrap fails)', async () => {
    const result = await auth.login('root', 'WrongPass-1!Strong');
    assert.equal(result.success, false);
    assert.match(result.error, /Invalid credentials|locked/i);
  });

  it('rejects login for unknown users', async () => {
    const result = await auth.login('ghost', ADMIN_PW);
    assert.equal(result.success, false);
  });

  it('locks the account after MAX_ATTEMPTS failed logins', async () => {
    let last;
    for (let i = 0; i < 5; i++) {
      last = await auth.login('root', 'WrongPass-1!Strong');
    }
    assert.equal(last.success, false);
    assert.match(last.error, /locked/i);

    // Even with the right password, login is blocked while locked
    const blocked = await auth.login('root', ADMIN_PW);
    assert.equal(blocked.success, false);
    assert.match(blocked.error, /locked/i);
  });
});

describe('auth-service — registerWithRole authorization', () => {
  beforeEach(async () => {
    await auth.setupAdmin('root', ADMIN_PW);
    await auth.login('root', ADMIN_PW);
  });

  it('admin can create operator users; their KEK unwraps the same DEK', async () => {
    const result = await auth.registerWithRole(
      'op1', USER_PW, 'operator',
      { id: 1, username: 'root', role: 'admin' }
    );
    assert.equal(result.success, true);

    // The new user must now be able to log in
    auth.logout();
    const login = await auth.login('op1', USER_PW);
    assert.equal(login.success, true);
    assert.equal(login.session.role, 'operator');
  });

  it('non-admin actor is denied (function-level authorization)', async () => {
    const result = await auth.registerWithRole(
      'op2', USER_PW, 'operator',
      { id: 2, username: 'somebody', role: 'visitor' }
    );
    assert.equal(result.success, false);
    assert.match(result.errors[0], /administrator/i);
  });

  it('missing actor is denied (fail closed)', async () => {
    const result = await auth.registerWithRole('op3', USER_PW, 'operator', null);
    assert.equal(result.success, false);
  });

  it('rejects creating a duplicate username', async () => {
    const actor = { id: 1, username: 'root', role: 'admin' };
    const a = await auth.registerWithRole('dupe', USER_PW, 'operator', actor);
    assert.equal(a.success, true);
    const b = await auth.registerWithRole('dupe', USER_PW, 'operator', actor);
    assert.equal(b.success, false);
  });
});
