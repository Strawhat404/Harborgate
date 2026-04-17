import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { setupDOM, teardownDOM } from './dom-mock.js';
import { installFakeIndexedDB, installFakeLocalStorage } from './indexeddb-mock.js';

// session-warning.js imports auth-service which imports database.js (needs IndexedDB)
if (!globalThis.crypto) globalThis.crypto = webcrypto;
installFakeIndexedDB();
installFakeLocalStorage();

import Store from '../frontend/js/store.js';
import { initSessionWarning } from '../frontend/js/components/session-warning.js';

describe('Session Warning Component', () => {
  let doc;

  beforeEach(() => {
    doc = setupDOM();
    Store.reset();
    initSessionWarning();
  });

  afterEach(() => {
    // Trigger sessionExpired to reset the module-level warningEl to null
    // (hideSessionWarning is called by the sessionExpired handler)
    Store.set('sessionExpired', true);
    Store.reset();
    teardownDOM();
  });

  it('initSessionWarning subscribes to Store (sessionWarning triggers overlay)', () => {
    Store.set('sessionWarning', true);
    assert.equal(doc.body.children.length, 1);
    assert.equal(doc.body.children[0].className, 'session-warning-overlay');
  });

  it('warning overlay has correct structure', () => {
    Store.set('sessionWarning', true);
    const overlay = doc.body.children[0];
    assert.equal(overlay.className, 'session-warning-overlay');
    assert.ok(overlay.innerHTML.includes('Session Expiring'));
    assert.ok(overlay.innerHTML.includes('Your session will expire in 5 minutes'));
  });

  it('warning overlay has Extend Session and Logout buttons', () => {
    Store.set('sessionWarning', true);
    const overlay = doc.body.children[0];
    assert.ok(overlay.innerHTML.includes('Extend Session'));
    assert.ok(overlay.innerHTML.includes('extend-session-btn'));
    assert.ok(overlay.innerHTML.includes('Logout'));
    assert.ok(overlay.innerHTML.includes('logout-session-btn'));
  });

  it('duplicate warnings are prevented', () => {
    Store.set('sessionWarning', true);
    Store.set('sessionWarning', true);
    // The duplicate guard in showSessionWarning prevents a second overlay
    assert.equal(doc.body.children.length, 1);
  });

  it('setting sessionExpired removes warning and shows expired notice', () => {
    Store.set('sessionWarning', true);
    assert.equal(doc.body.children.length, 1);
    assert.ok(doc.body.children[0].innerHTML.includes('Session Expiring'));

    Store.set('sessionExpired', true);
    // hideSessionWarning removes the warning overlay, showExpiredNotice adds expired overlay
    assert.equal(doc.body.children.length, 1);
    assert.ok(doc.body.children[0].innerHTML.includes('Session Expired'));
  });

  it('expired notice has Session Expired heading and Log In button', () => {
    Store.set('sessionExpired', true);
    const overlay = doc.body.children[0];
    assert.ok(overlay.innerHTML.includes('Session Expired'));
    assert.ok(overlay.innerHTML.includes('Please log in again'));
    assert.ok(overlay.innerHTML.includes('Log In'));
    assert.ok(overlay.innerHTML.includes('relogin-btn'));
  });

  it('hideSessionWarning removes overlay from DOM', () => {
    Store.set('sessionWarning', true);
    assert.equal(doc.body.children.length, 1);

    // sessionExpired triggers hideSessionWarning then showExpiredNotice.
    // We verify the warning overlay is gone and replaced by expired notice.
    Store.set('sessionExpired', true);
    // The warning overlay was removed; only the expired notice remains
    assert.equal(doc.body.children.length, 1);
    assert.ok(doc.body.children[0].innerHTML.includes('Session Expired'));
    // The Session Expiring overlay is no longer present
    const allOverlays = doc.body.children.filter(c => c.innerHTML.includes('Session Expiring'));
    assert.equal(allOverlays.length, 0);
  });

  it('warning then expiry sequence works correctly', () => {
    // Show warning
    Store.set('sessionWarning', true);
    assert.equal(doc.body.children.length, 1);
    assert.ok(doc.body.children[0].innerHTML.includes('Session Expiring'));

    // Expire the session — warning removed, expired notice shown
    Store.set('sessionExpired', true);
    assert.equal(doc.body.children.length, 1);
    assert.ok(doc.body.children[0].innerHTML.includes('Session Expired'));
    assert.ok(doc.body.children[0].innerHTML.includes('Log In'));
  });

  it('Store.set sessionWarning false after warning does not crash', () => {
    Store.set('sessionWarning', true);
    assert.equal(doc.body.children.length, 1);

    // Setting sessionWarning to false should not throw
    Store.set('sessionWarning', false);
    // The overlay is still in the DOM (only hideSessionWarning removes it,
    // and that is called by the Extend Session button or sessionExpired handler,
    // not by setting sessionWarning to false directly from outside)
    assert.ok(true, 'No error thrown');
  });
});
