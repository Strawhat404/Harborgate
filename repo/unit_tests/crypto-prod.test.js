/**
 * Behavioral tests against the ACTUAL production crypto module.
 *
 * Unlike `crypto.test.js` (which mirrors the algorithm in-test), this file
 * imports `frontend/js/crypto.js` directly and exercises every exported
 * primitive end-to-end. Failures here mean the production code is broken,
 * not a parallel reimplementation.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const { default: Crypto } = await import('../frontend/js/crypto.js');

describe('Production Crypto — encrypt/decrypt', () => {
  it('round-trips a string with a password', async () => {
    const ct = await Crypto.encrypt('hello harborgate', 'pw-Strong1!');
    assert.notEqual(ct, 'hello harborgate');
    const pt = await Crypto.decrypt(ct, 'pw-Strong1!');
    assert.equal(pt, 'hello harborgate');
  });

  it('rejects decryption with the wrong password', async () => {
    const ct = await Crypto.encrypt('secret', 'right-Strong1!');
    await assert.rejects(() => Crypto.decrypt(ct, 'wrong-Strong1!'));
  });

  it('produces distinct ciphertexts for the same input (random salt+iv)', async () => {
    const a = await Crypto.encrypt('same', 'pw');
    const b = await Crypto.encrypt('same', 'pw');
    assert.notEqual(a, b);
  });

  it('round-trips JSON via encryptObject/decryptObject', async () => {
    const obj = { user: 'alice', perms: ['a', 'b'], n: 42 };
    const ct = await Crypto.encryptObject(obj, 'pw');
    const out = await Crypto.decryptObject(ct, 'pw');
    assert.deepEqual(out, obj);
  });

  it('handles unicode payloads', async () => {
    const msg = '\u{1F600} \u4F60\u597D \u00e9\u00e0';
    const ct = await Crypto.encrypt(msg, 'pw');
    assert.equal(await Crypto.decrypt(ct, 'pw'), msg);
  });
});

describe('Production Crypto — password hashing (PBKDF2)', () => {
  it('hashes and verifies a password', async () => {
    const { hash, salt } = await Crypto.hashPassword('TestPassword1!');
    assert.equal(await Crypto.verifyPassword('TestPassword1!', hash, salt), true);
  });

  it('fails verification with the wrong password', async () => {
    const { hash, salt } = await Crypto.hashPassword('TestPassword1!');
    assert.equal(await Crypto.verifyPassword('WrongPassword1!', hash, salt), false);
  });

  it('produces different salts for the same password', async () => {
    const a = await Crypto.hashPassword('TestPassword1!');
    const b = await Crypto.hashPassword('TestPassword1!');
    assert.notEqual(a.salt, b.salt);
    assert.notEqual(a.hash, b.hash);
  });

  it('produces the same hash for the same salt+password', async () => {
    const a = await Crypto.hashPassword('TestPassword1!');
    const b = await Crypto.hashPassword('TestPassword1!', a.salt);
    assert.equal(a.hash, b.hash);
  });
});

describe('Production Crypto — generateId', () => {
  it('generates 32-char hex IDs', () => {
    const id = Crypto.generateId();
    assert.match(id, /^[0-9a-f]{32}$/);
  });

  it('generates unique IDs across many calls', () => {
    const set = new Set();
    for (let i = 0; i < 200; i++) set.add(Crypto.generateId());
    assert.equal(set.size, 200);
  });
});

describe('Production Crypto — KEK/DEK at-rest model', () => {
  it('round-trips an encrypted record with a generated DEK', async () => {
    const dek = await Crypto.generateDEK();
    const enc = await Crypto.encryptRecord({ a: 1, b: 'two' }, dek);
    assert.equal(enc._encrypted, true);
    assert.ok(typeof enc._payload === 'string' && enc._payload.length > 0);
    const out = await Crypto.decryptRecord(enc, dek);
    assert.deepEqual(out, { a: 1, b: 'two' });
  });

  it('passes through non-encrypted records unchanged', async () => {
    const out = await Crypto.decryptRecord({ a: 1 }, null);
    assert.deepEqual(out, { a: 1 });
  });

  it('wraps a DEK with a password-derived KEK and unwraps it back', async () => {
    const kek1 = await Crypto.deriveKEK('TestPassword1!');
    const dek = await Crypto.generateDEK();
    const wrapped = await Crypto.wrapDEK(dek, kek1);
    assert.ok(wrapped.iv && wrapped.wrapped);

    const kek2 = await Crypto.deriveKEK('TestPassword1!');
    const unwrapped = await Crypto.unwrapDEK(wrapped, kek2);

    // Prove the unwrapped key actually works for decryption
    const enc = await Crypto.encryptRecord({ secret: 'value' }, dek);
    const out = await Crypto.decryptRecord(enc, unwrapped);
    assert.deepEqual(out, { secret: 'value' });
  });

  it('refuses to unwrap a DEK with the wrong password', async () => {
    const kek1 = await Crypto.deriveKEK('CorrectPassword1!');
    const dek = await Crypto.generateDEK();
    const wrapped = await Crypto.wrapDEK(dek, kek1);
    const badKek = await Crypto.deriveKEK('WrongPassword1!!');
    await assert.rejects(() => Crypto.unwrapDEK(wrapped, badKek));
  });

  it('records encrypted under one DEK cannot be decrypted with another', async () => {
    const dek1 = await Crypto.generateDEK();
    const dek2 = await Crypto.generateDEK();
    const enc = await Crypto.encryptRecord({ x: 1 }, dek1);
    await assert.rejects(() => Crypto.decryptRecord(enc, dek2));
  });

  it('multi-user wrap: two passwords can each unwrap the same DEK', async () => {
    // Mirrors auth-service._createUserWithRole: admin's DEK is re-wrapped for a new user.
    const dek = await Crypto.generateDEK();
    const adminKek = await Crypto.deriveKEK('AdminPass-1!');
    const userKek  = await Crypto.deriveKEK('UserPass-1!!');

    const adminWrap = await Crypto.wrapDEK(dek, adminKek);
    const userWrap  = await Crypto.wrapDEK(dek, userKek);

    const enc = await Crypto.encryptRecord({ shared: true }, dek);

    const fromAdmin = await Crypto.unwrapDEK(adminWrap, await Crypto.deriveKEK('AdminPass-1!'));
    const fromUser  = await Crypto.unwrapDEK(userWrap,  await Crypto.deriveKEK('UserPass-1!!'));

    assert.deepEqual(await Crypto.decryptRecord(enc, fromAdmin), { shared: true });
    assert.deepEqual(await Crypto.decryptRecord(enc, fromUser),  { shared: true });
  });
});
