/**
 * Tests for the REAL production Router (frontend/js/router.js).
 *
 * The Router is a singleton that depends on window.location.hash and
 * window.addEventListener. We set up minimal window globals before
 * importing the module so it can run in Node.js unchanged.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// --- Set up window globals BEFORE importing the Router ---
let hashChangeHandler = null;

globalThis.window = globalThis.window || {};
globalThis.window.location = globalThis.window.location || { hash: '/' };
globalThis.window.addEventListener = (event, handler) => {
  if (event === 'hashchange') hashChangeHandler = handler;
};

// Import the REAL production Router
const Router = (await import('../frontend/js/router.js')).default;

describe('Router (production module)', () => {
  beforeEach(() => {
    // Reset singleton state between tests
    Router._routes = {};
    Router._currentView = null;
    globalThis.window.location.hash = '/';
    hashChangeHandler = null;
  });

  it('register() stores route handlers in _routes', () => {
    const handler = () => {};
    Router.register('/test', handler);
    assert.strictEqual(Router._routes['/test'], handler);
  });

  it('navigate() sets window.location.hash', () => {
    Router.navigate('#/dashboard');
    assert.strictEqual(globalThis.window.location.hash, '#/dashboard');
  });

  it('currentRoute() reads from window.location.hash and strips the leading #', () => {
    globalThis.window.location.hash = '#/settings';
    assert.strictEqual(Router.currentRoute(), '/settings');
  });

  it('currentRoute() returns "/" when hash is empty', () => {
    globalThis.window.location.hash = '';
    assert.strictEqual(Router.currentRoute(), '/');
  });

  it('_resolve() calls the correct handler based on hash', () => {
    let called = null;
    Router.register('/page', (path) => { called = path; });
    globalThis.window.location.hash = '#/page';
    Router._resolve();
    assert.strictEqual(called, '/page');
  });

  it('_resolve() falls back to "/" handler for unknown routes', () => {
    let called = null;
    Router.register('/', (path) => { called = path; });
    globalThis.window.location.hash = '#/nonexistent';
    Router._resolve();
    assert.strictEqual(called, '/nonexistent');
  });

  it('start() calls window.addEventListener with "hashchange"', () => {
    Router.start();
    assert.ok(hashChangeHandler !== null, 'hashchange listener should be registered');
    assert.strictEqual(typeof hashChangeHandler, 'function');
  });

  it('start() immediately resolves the current route', () => {
    let called = null;
    Router.register('/', (path) => { called = path; });
    globalThis.window.location.hash = '#/';
    Router.start();
    assert.strictEqual(called, '/');
  });

  it('hashchange listener triggers _resolve()', () => {
    let called = null;
    Router.register('/dynamic', (path) => { called = path; });
    Router.start();
    // Simulate a hashchange event
    globalThis.window.location.hash = '#/dynamic';
    hashChangeHandler();
    assert.strictEqual(called, '/dynamic');
  });

  it('multiple routes can be registered and each resolves correctly', () => {
    const visited = [];
    Router.register('/a', () => visited.push('a'));
    Router.register('/b', () => visited.push('b'));
    Router.register('/c', () => visited.push('c'));

    globalThis.window.location.hash = '#/a';
    Router._resolve();
    globalThis.window.location.hash = '#/b';
    Router._resolve();
    globalThis.window.location.hash = '#/c';
    Router._resolve();

    assert.deepStrictEqual(visited, ['a', 'b', 'c']);
  });

  it('re-registering a route overwrites the previous handler', () => {
    let value = '';
    Router.register('/x', () => { value = 'first'; });
    Router.register('/x', () => { value = 'second'; });

    globalThis.window.location.hash = '#/x';
    Router._resolve();
    assert.strictEqual(value, 'second');
  });

  it('_currentView tracks the resolved path', () => {
    Router.register('/tracked', () => {});
    globalThis.window.location.hash = '#/tracked';
    Router._resolve();
    assert.strictEqual(Router._currentView, '/tracked');
  });

  it('_currentView updates on each resolution', () => {
    Router.register('/first', () => {});
    Router.register('/second', () => {});

    globalThis.window.location.hash = '#/first';
    Router._resolve();
    assert.strictEqual(Router._currentView, '/first');

    globalThis.window.location.hash = '#/second';
    Router._resolve();
    assert.strictEqual(Router._currentView, '/second');
  });

  it('_resolve() does not update _currentView when no handler matches', () => {
    // No routes registered, no fallback
    globalThis.window.location.hash = '#/orphan';
    Router._resolve();
    assert.strictEqual(Router._currentView, null);
  });
});
