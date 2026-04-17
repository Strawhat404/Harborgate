/**
 * Minimal DOM mock for testing frontend components in Node.js.
 * Provides just enough of the DOM API to exercise component logic.
 */

class MockElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.className = '';
    this.innerHTML = '';
    this.textContent = '';
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this._eventListeners = {};
    this._classList = new Set();
    this.parentNode = null;
    this.style = {};
  }

  get classList() {
    const self = this;
    return {
      add(cls) { self._classList.add(cls); },
      remove(cls) { self._classList.delete(cls); },
      contains(cls) { return self._classList.has(cls); },
      toggle(cls) {
        if (self._classList.has(cls)) { self._classList.delete(cls); return false; }
        self._classList.add(cls); return true;
      }
    };
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
    if (name.startsWith('data-')) {
      this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    }
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  addEventListener(event, handler) {
    if (!this._eventListeners[event]) this._eventListeners[event] = [];
    this._eventListeners[event].push(handler);
  }

  removeEventListener(event, handler) {
    if (this._eventListeners[event]) {
      this._eventListeners[event] = this._eventListeners[event].filter(h => h !== handler);
    }
  }

  dispatchEvent(event) {
    const handlers = this._eventListeners[event.type] || [];
    for (const h of handlers) h(event);
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this });
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter(c => c !== this);
      this.parentNode = null;
    }
  }

  querySelector(selector) {
    // First check real children (appended MockElements)
    const fromChildren = this._queryChildren(selector)[0];
    if (fromChildren) return fromChildren;

    // Fall back to searching innerHTML string and returning a stub element
    return this._queryInnerHTML(selector);
  }

  querySelectorAll(selector) {
    const fromChildren = this._queryChildren(selector);
    if (fromChildren.length > 0) return fromChildren;

    // For innerHTML-based matches, collect all matching stubs
    return this._queryAllInnerHTML(selector);
  }

  _queryChildren(selector) {
    const results = [];
    const match = (el) => {
      if (this._matchesSelector(el, selector)) results.push(el);
      for (const child of el.children) match(child);
    };
    for (const child of this.children) match(child);
    return results;
  }

  _matchesSelector(el, selector) {
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      return el.className.includes(cls) || el._classList.has(cls);
    } else if (selector.startsWith('#')) {
      return el.attributes.id === selector.slice(1);
    } else if (selector.startsWith('[')) {
      const m = selector.match(/\[([^\]=]+)(?:="([^"]*)")?\]/);
      if (m && el.attributes[m[1]] !== undefined) {
        return !m[2] || el.attributes[m[1]] === m[2];
      }
      return false;
    } else {
      return el.tagName === selector.toUpperCase();
    }
  }

  _queryInnerHTML(selector) {
    const html = this.innerHTML;
    if (!html) return null;

    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      // Match class="...cls..." or class='...cls...'
      const regex = new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"`, 'i');
      if (regex.test(html)) return this._stubFromHTML(html, selector);
    } else if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (html.includes(`id="${id}"`)) return this._stubFromHTML(html, selector);
    } else if (selector.startsWith('[')) {
      const m = selector.match(/\[([^\]=]+)(?:="([^"]*)")?\]/);
      if (m) {
        const attrPattern = m[2] ? `${m[1]}="${m[2]}"` : m[1];
        if (html.includes(attrPattern)) return this._stubFromHTML(html, selector);
      }
    }
    return null;
  }

  _queryAllInnerHTML(selector) {
    const html = this.innerHTML;
    if (!html) return [];

    const results = [];
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      const regex = new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"`, 'gi');
      const matches = html.match(regex) || [];
      for (const m of matches) results.push(this._stubFromHTML(html, selector));
    } else if (selector.startsWith('[')) {
      const m = selector.match(/\[([^\]=]+)(?:="([^"]*)")?\]/);
      if (m) {
        const attr = m[1];
        const regex = new RegExp(`${attr}="([^"]*)"`, 'gi');
        const matches = html.match(regex) || [];
        for (const match of matches) {
          const val = match.split('="')[1]?.slice(0, -1);
          const stub = new MockElement('div');
          stub.dataset[attr.replace('data-', '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = val;
          stub.attributes[attr] = val;
          results.push(stub);
        }
      }
    }
    return results;
  }

  _stubFromHTML(html, selector) {
    // Return a stub MockElement that supports addEventListener etc.
    const stub = new MockElement('div');
    if (selector.startsWith('.')) stub.className = selector.slice(1);
    return stub;
  }
}

class MockDocument {
  constructor() {
    this.body = new MockElement('body');
    this._stubCache = {};
  }

  createElement(tag) {
    return new MockElement(tag);
  }

  getElementById(id) {
    // Search appended children first
    const search = (el) => {
      if (el.attributes.id === id) return el;
      for (const child of el.children) {
        const found = search(child);
        if (found) return found;
      }
      return null;
    };
    const found = search(this.body);
    if (found) return found;

    // Fall back to innerHTML search across all children
    for (const child of this.body.children) {
      if (child.innerHTML && child.innerHTML.includes(`id="${id}"`)) {
        // Cache stubs so the same element is returned for repeated lookups
        if (!this._stubCache[id]) {
          const stub = new MockElement('button');
          stub.attributes.id = id;
          stub.style = {};
          this._stubCache[id] = stub;
        }
        return this._stubCache[id];
      }
    }
    return null;
  }
}

/**
 * Sets up global DOM mocks. Call in beforeEach to get a fresh DOM.
 * Returns the mock document for direct access.
 */
export function setupDOM() {
  const doc = new MockDocument();
  globalThis.document = doc;
  globalThis.window = globalThis.window || {};
  globalThis.window.location = globalThis.window.location || { hash: '/' };
  globalThis.requestAnimationFrame = (cb) => cb();
  globalThis.setTimeout = globalThis.setTimeout;
  return doc;
}

/**
 * Tears down global DOM mocks.
 */
export function teardownDOM() {
  delete globalThis.document;
  delete globalThis.requestAnimationFrame;
}

export { MockElement };
