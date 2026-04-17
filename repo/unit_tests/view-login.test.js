/**
 * Unit tests for the Login view (frontend/js/views/login.js).
 *
 * The login view does NOT call requireAuth — it is the public entry point.
 * It sets container.innerHTML with login/register forms and attaches event
 * listeners for tab switching, password validation feedback, and form submission.
 *
 * We only test the rendered markup here, not the async form handlers.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  installFakeIndexedDB,
  installFakeLocalStorage,
  resetFakeIndexedDB
} from './indexeddb-mock.js';
import { setupDOM, teardownDOM } from './dom-mock.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
installFakeIndexedDB();
installFakeLocalStorage();

// window must exist before auth-service is imported (it reads window.location)
globalThis.window = { location: { hash: '/' } };

const DB = (await import('../frontend/js/database.js')).default;
const { renderLogin } = await import('../frontend/js/views/login.js');

describe('View — Login', () => {
  let doc;

  beforeEach(async () => {
    await resetFakeIndexedDB(DB);
    globalThis.localStorage.clear();
    doc = setupDOM();
  });

  afterEach(() => {
    teardownDOM();
  });

  it('renders login form with username and password inputs', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    renderLogin(container);

    const html = container.innerHTML;
    assert.ok(html.includes('id="login-form"'), 'should contain login form');
    assert.ok(html.includes('name="username"'), 'should contain username input');
    assert.ok(html.includes('name="password"'), 'should contain password input');
  });

  it('renders register form (initially hidden)', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    renderLogin(container);

    const html = container.innerHTML;
    assert.ok(html.includes('id="register-form"'), 'should contain register form');
    assert.ok(html.includes('style="display:none"'), 'register form should be hidden');
  });

  it('renders auth tabs (Sign In / Register)', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    renderLogin(container);

    const html = container.innerHTML;
    assert.ok(html.includes('auth-tabs'), 'should contain auth tabs container');
    assert.ok(html.includes('Sign In'), 'should have Sign In tab');
    assert.ok(html.includes('Register'), 'should have Register tab');
  });

  it('renders password requirements list', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    renderLogin(container);

    const html = container.innerHTML;
    assert.ok(html.includes('id="req-length"'), 'should have length requirement');
    assert.ok(html.includes('id="req-upper"'), 'should have uppercase requirement');
    assert.ok(html.includes('id="req-lower"'), 'should have lowercase requirement');
    assert.ok(html.includes('id="req-number"'), 'should have number requirement');
    assert.ok(html.includes('id="req-symbol"'), 'should have symbol requirement');
    assert.ok(html.includes('Min 12 characters'), 'should show length rule');
  });

  it('renders HarborGate title and subtitle', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    renderLogin(container);

    const html = container.innerHTML;
    assert.ok(html.includes('HarborGate'), 'should contain app title');
    assert.ok(html.includes('Visitor Access &amp; Content Compliance') || html.includes('Visitor Access & Content Compliance'),
      'should contain subtitle');
  });

  it('login form has submit button', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    renderLogin(container);

    const html = container.innerHTML;
    // The login form has a submit button with text "Sign In"
    assert.ok(html.includes('type="submit"'), 'should have submit button');
    // There should be at least one "Sign In" button (the submit button in the login form)
    assert.ok(html.includes('>Sign In</button>'), 'login form should have Sign In submit button');
  });

  it('register form has confirm password field', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    renderLogin(container);

    const html = container.innerHTML;
    assert.ok(html.includes('name="confirmPassword"'), 'should have confirm password field');
    assert.ok(html.includes('Confirm Password'), 'should label the confirm password field');
  });

  it('register form has hidden role=visitor input', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    renderLogin(container);

    const html = container.innerHTML;
    assert.ok(html.includes('type="hidden"'), 'should have hidden input');
    assert.ok(html.includes('name="role"'), 'should have role input');
    assert.ok(html.includes('value="visitor"'), 'role should default to visitor');
  });
});

describe('View — Login (behavior)', () => {
  let doc;

  beforeEach(async () => {
    await resetFakeIndexedDB(DB);
    globalThis.localStorage.clear();
    doc = setupDOM();
  });

  afterEach(() => {
    teardownDOM();
  });

  it('login form has submit event handler attached', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    renderLogin(container);

    const loginForm = document.getElementById('login-form');
    assert.ok(loginForm, 'login-form element should exist');
    assert.ok(loginForm._eventListeners?.submit?.length > 0, 'login form should have submit handler');
  });

  it('register form has submit event handler attached', async () => {
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    renderLogin(container);

    const registerForm = document.getElementById('register-form');
    assert.ok(registerForm, 'register-form element should exist');
    assert.ok(registerForm._eventListeners?.submit?.length > 0, 'register form should have submit handler');
  });
});
