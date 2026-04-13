/**
 * Minimal in-memory IndexedDB shim — just enough to exercise the production
 * `frontend/js/database.js` wrapper and any services that depend on it.
 *
 * Behavior modeled:
 *   - indexedDB.open(name, version) with onupgradeneeded + onsuccess
 *   - createObjectStore({ keyPath, autoIncrement }), createIndex, indexNames
 *   - transaction(name, mode).objectStore(name)
 *   - store.add/put/get/getAll/delete/clear/count
 *   - index.get(value)/getAll(value)
 *
 * Not modeled (intentionally): cursors, ranges, multi-store transactions,
 * structured-clone semantics. Production code under test does not need them.
 */

class FakeRequest {
  constructor() {
    this.result = undefined;
    this.error = null;
    this.onsuccess = null;
    this.onerror = null;
    this.onupgradeneeded = null;
  }
  _resolve(result) {
    this.result = result;
    queueMicrotask(() => { if (this.onsuccess) this.onsuccess({ target: this }); });
  }
  _reject(error) {
    this.error = error;
    queueMicrotask(() => { if (this.onerror) this.onerror({ target: this }); });
  }
}

class FakeIndex {
  constructor(store, name, keyPath) {
    this.store = store;
    this.name = name;
    this.keyPath = keyPath;
  }
  get(value) {
    const req = new FakeRequest();
    req._resolve(this.store._records.find(r => r[this.keyPath] === value));
    return req;
  }
  getAll(value) {
    const req = new FakeRequest();
    req._resolve(this.store._records.filter(r => r[this.keyPath] === value));
    return req;
  }
}

class FakeStore {
  constructor(name, opts) {
    this.name = name;
    this.keyPath = opts.keyPath;
    this.autoIncrement = !!opts.autoIncrement;
    this._records = [];
    this._indexes = {};
    this._nextId = 1;
  }
  get indexNames() {
    return { contains: (n) => Object.prototype.hasOwnProperty.call(this._indexes, n) };
  }
  createIndex(name, keyPath /*, opts */) {
    this._indexes[name] = new FakeIndex(this, name, keyPath);
    return this._indexes[name];
  }
  index(name) {
    if (!this._indexes[name]) throw new Error(`Index "${name}" not found on store "${this.name}"`);
    return this._indexes[name];
  }
  add(record) {
    const req = new FakeRequest();
    if (this.autoIncrement && record[this.keyPath] === undefined) {
      record[this.keyPath] = this._nextId++;
    } else if (record[this.keyPath] !== undefined && typeof record[this.keyPath] === 'number') {
      this._nextId = Math.max(this._nextId, record[this.keyPath] + 1);
    }
    this._records.push(record);
    req._resolve(record[this.keyPath]);
    return req;
  }
  put(record) {
    const req = new FakeRequest();
    const id = record[this.keyPath];
    const idx = id !== undefined ? this._records.findIndex(r => r[this.keyPath] === id) : -1;
    if (idx >= 0) {
      this._records[idx] = record;
    } else {
      if (this.autoIncrement && id === undefined) record[this.keyPath] = this._nextId++;
      this._records.push(record);
    }
    req._resolve(record[this.keyPath]);
    return req;
  }
  get(id) {
    const req = new FakeRequest();
    req._resolve(this._records.find(r => r[this.keyPath] === id));
    return req;
  }
  getAll() {
    const req = new FakeRequest();
    req._resolve([...this._records]);
    return req;
  }
  delete(id) {
    const req = new FakeRequest();
    this._records = this._records.filter(r => r[this.keyPath] !== id);
    req._resolve(undefined);
    return req;
  }
  clear() {
    const req = new FakeRequest();
    this._records = [];
    req._resolve(undefined);
    return req;
  }
  count() {
    const req = new FakeRequest();
    req._resolve(this._records.length);
    return req;
  }
}

class FakeTransaction {
  constructor(db /*, names, mode */) {
    this.db = db;
  }
  objectStore(name) {
    const store = this.db._stores[name];
    if (!store) throw new Error(`Object store "${name}" not found`);
    return store;
  }
}

class FakeDB {
  constructor(name) {
    this.name = name;
    this._stores = {};
    this._version = 0;
  }
  get objectStoreNames() {
    return { contains: (n) => Object.prototype.hasOwnProperty.call(this._stores, n) };
  }
  createObjectStore(name, opts) {
    this._stores[name] = new FakeStore(name, opts);
    return this._stores[name];
  }
  transaction(names, mode) {
    return new FakeTransaction(this, names, mode);
  }
  close() { /* no-op */ }
}

const _databases = new Map();

const fakeIndexedDB = {
  open(name, version) {
    const req = new FakeRequest();
    queueMicrotask(() => {
      let db = _databases.get(name);
      const isNew = !db;
      if (isNew) {
        db = new FakeDB(name);
        _databases.set(name, db);
      }
      const oldVersion = db._version;
      if (isNew || version > oldVersion) {
        db._version = version;
        if (req.onupgradeneeded) {
          const event = {
            oldVersion,
            newVersion: version,
            target: {
              result: db,
              transaction: { objectStore: (n) => db._stores[n] }
            }
          };
          req.onupgradeneeded(event);
        }
      }
      req.result = db;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }
};

/**
 * Install the fake IndexedDB on globalThis. Idempotent.
 */
export function installFakeIndexedDB() {
  globalThis.indexedDB = fakeIndexedDB;
}

/**
 * Wipe all in-memory databases. Call between tests for a clean slate.
 * Also resets the cached connection inside `frontend/js/database.js` if
 * `dbModule` (the imported default DB) is supplied.
 */
export async function resetFakeIndexedDB(dbModule) {
  if (dbModule && typeof dbModule.close === 'function') {
    await dbModule.close();
  }
  _databases.clear();
}

/**
 * Minimal localStorage shim — used by audit.js / auth-service.js for session
 * lookup and key-wrap persistence.
 */
export function installFakeLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); },
    key(i) { return [...store.keys()][i] ?? null; },
    get length() { return store.size; }
  };
}
