/**
 * CMS integration test — full workflow through production modules.
 * No mocking of services, business logic, or database layer.
 * Tests the complete content lifecycle: create → review → publish → archive → rollback.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  installFakeIndexedDB,
  installFakeLocalStorage,
  resetFakeIndexedDB
} from '../unit_tests/indexeddb-mock.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
installFakeIndexedDB();
installFakeLocalStorage();
globalThis.window = globalThis.window || {};
globalThis.window.location = globalThis.window.location || { hash: '/' };

const DB = (await import('../frontend/js/database.js')).default;
const auth = await import('../frontend/js/services/auth-service.js');
const cms = await import('../frontend/js/services/cms.js');
const auditSvc = await import('../frontend/js/services/audit.js');

const ADMIN_PW = 'AdminPass-1!Strong';
const REVIEWER_PW = 'ReviewPass-1!Str';

beforeEach(async () => {
  await resetFakeIndexedDB(DB);
  globalThis.localStorage.clear();
});

afterEach(() => { auth.logout(); });

describe('CMS Integration — full content lifecycle', () => {
  it('complete workflow: create → submit → approve → archive', async () => {
    // Setup admin + reviewer
    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);
    await auth.requireRole(['admin']);
    await auth.registerWithRole('rev', REVIEWER_PW, 'reviewer', { id: 1, username: 'admin', role: 'admin' });
    auth.logout();

    // Reviewer creates content
    await auth.login('rev', REVIEWER_PW);
    await auth.requireRole(['reviewer']);
    const content = await cms.createContent({ title: 'Article', body: 'First draft', author: 'rev' });
    assert.equal(content.workflowState, 'draft');

    // Update content
    const updated = await cms.updateContent(content.id, { title: 'Article v2', body: 'Revised' }, 'rev');
    assert.equal(updated.version, 2);

    // Submit for review
    const inReview = await cms.transitionWorkflow(content.id, 'review', 'rev');
    assert.equal(inReview.workflowState, 'review');

    // Verify getContentInReview
    const reviewList = await cms.getContentInReview();
    assert.equal(reviewList.length, 1);

    // Approve (publish)
    const published = await cms.reviewContent(content.id, 'approve', 'rev', 'Approved');
    assert.equal(published.workflowState, 'published');
    assert.equal(published.publishedBy, 'rev');

    // Archive
    const archived = await cms.transitionWorkflow(content.id, 'archived', 'rev');
    assert.equal(archived.workflowState, 'archived');

    // Rollback to v1
    const rolled = await cms.rollbackContent(content.id, 1, 'rev');
    assert.equal(rolled.title, 'Article');
    assert.equal(rolled.body, 'First draft');
    assert.equal(rolled.version, 3); // create=1, update=2, rollback=3

    // Verify audit trail
    const logs = await auditSvc.getAuditLogs();
    const actions = logs.map(l => l.action);
    assert.ok(actions.includes('content_created'));
    assert.ok(actions.includes('content_updated'));
    assert.ok(actions.includes('content_workflow'));
    assert.ok(actions.includes('content_publish'));
    assert.ok(actions.includes('content_rollback'));
  });

  it('reject sends content back to draft', async () => {
    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);
    await auth.requireRole(['admin']);
    await auth.registerWithRole('rev', REVIEWER_PW, 'reviewer', { id: 1, username: 'admin', role: 'admin' });
    auth.logout();
    await auth.login('rev', REVIEWER_PW);
    await auth.requireRole(['reviewer']);

    const content = await cms.createContent({ title: 'Bad Article', body: 'Needs work' });
    await cms.transitionWorkflow(content.id, 'review', 'rev');
    const rejected = await cms.reviewContent(content.id, 'reject', 'rev', 'Please revise');
    assert.equal(rejected.workflowState, 'draft');
  });

  it('visitor cannot create content', async () => {
    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);
    await auth.requireRole(['admin']);
    await auth.registerWithRole('v1', 'VisitorPw-1!Str', 'visitor', { id: 1, username: 'admin', role: 'admin' });
    auth.logout();
    await auth.login('v1', 'VisitorPw-1!Str');
    await auth.requireAuth();
    await assert.rejects(() => cms.createContent({ title: 'X', body: 'Y' }), /Unauthorized/);
  });

  it('diff generation works through service layer', async () => {
    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);
    await auth.requireRole(['admin']);
    const diff = cms.generateDiff('line1\nline2', 'line1\nline3\nline4');
    assert.ok(diff.some(d => d.type === 'removed'));
    assert.ok(diff.some(d => d.type === 'added'));
    assert.ok(diff.some(d => d.type === 'unchanged'));
  });

  it('getAllContent returns all items regardless of state', async () => {
    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);
    await auth.requireRole(['admin']);
    await cms.createContent({ title: 'A', body: 'B' });
    const c2 = await cms.createContent({ title: 'C', body: 'D' });
    await cms.transitionWorkflow(c2.id, 'review', 'admin');
    const all = await cms.getAllContent();
    assert.equal(all.length, 2);
  });

  it('multilingual variant round-trips through create and update', async () => {
    await auth.setupAdmin('admin', ADMIN_PW);
    await auth.login('admin', ADMIN_PW);
    await auth.requireRole(['admin']);
    const content = await cms.createContent({
      title: 'Hello', body: 'World', locale: 'en',
      variants: { es: { title: 'Hola', body: 'Mundo' } }
    });
    assert.deepEqual(content.variants.es, { title: 'Hola', body: 'Mundo' });

    const updated = await cms.updateContent(content.id, {
      variants: { ...content.variants, fr: { title: 'Bonjour', body: 'Le Monde' } }
    }, 'admin');
    assert.ok(updated.variants.es);
    assert.ok(updated.variants.fr);
  });
});
