import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, teardownDOM } from './dom-mock.js';
import { createNotificationBadge, showNotification } from '../frontend/js/components/notifications.js';

describe('createNotificationBadge', () => {
  it('should return a badge span for positive count', () => {
    const badge = createNotificationBadge(5);
    assert.ok(badge.includes('notification-badge'));
    assert.ok(badge.includes('5'));
  });

  it('should return empty string for count of 0', () => {
    assert.equal(createNotificationBadge(0), '');
  });

  it('should return empty string for negative count', () => {
    assert.equal(createNotificationBadge(-1), '');
  });

  it('should return badge for count of 1', () => {
    const badge = createNotificationBadge(1);
    assert.ok(badge.includes('1'));
    assert.ok(badge.includes('notification-badge'));
  });

  it('should handle large counts', () => {
    const badge = createNotificationBadge(999);
    assert.ok(badge.includes('999'));
  });
});

describe('showNotification', () => {
  let doc;

  beforeEach(() => {
    doc = setupDOM();
  });

  afterEach(() => {
    teardownDOM();
  });

  // The module-level toastContainer caches across calls. We use a single test
  // block to exercise the real showNotification sequentially, since the module
  // state cannot be reset between individual tests without re-importing.
  it('creates toast container on first call, adds toasts with correct types, and reuses container', () => {
    // First call: creates the toast-container and appends it to body
    showNotification('Hello');
    assert.equal(doc.body.children.length, 1);
    assert.equal(doc.body.children[0].className, 'toast-container');

    const container = doc.body.children[0];

    // Adds toast with correct message text
    assert.equal(container.children.length, 1);
    assert.equal(container.children[0].textContent, 'Hello');

    // Default type is info
    assert.equal(container.children[0].className, 'toast toast-info');

    // Custom type: error
    showNotification('Error!', 'error');
    assert.equal(container.children.length, 2);
    assert.equal(container.children[1].className, 'toast toast-error');
    assert.equal(container.children[1].textContent, 'Error!');

    // Custom type: success
    showNotification('Done', 'success');
    assert.equal(container.children.length, 3);
    assert.equal(container.children[2].className, 'toast toast-success');
    assert.equal(container.children[2].textContent, 'Done');

    // Custom type: warning
    showNotification('Watch out', 'warning');
    assert.equal(container.children.length, 4);
    assert.equal(container.children[3].className, 'toast toast-warning');
    assert.equal(container.children[3].textContent, 'Watch out');

    // Multiple calls reuse the same container (still one container in body)
    assert.equal(doc.body.children.length, 1);

    // Each call adds a new toast child
    showNotification('Another');
    assert.equal(container.children.length, 5);
    assert.equal(doc.body.children.length, 1);
    assert.equal(container.children[4].textContent, 'Another');
    assert.equal(container.children[4].className, 'toast toast-info');
  });
});
