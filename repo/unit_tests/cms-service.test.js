/**
 * CMS service unit tests.
 * Tests: createContent, updateContent, transitionWorkflow, reviewContent,
 *        rollbackContent, generateDiff, getContentInReview, getAllContent,
 *        getWorkflowStates, requireCMSRole authorization.
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
// CMS service calls getCurrentUser() which requires _verifiedUser set by requireAuth/requireRole.
// These functions use window.location.hash for redirects, so we need a mock.
globalThis.window = globalThis.window || {};
globalThis.window.location = globalThis.window.location || { hash: '/' };

const DB = (await import('../frontend/js/database.js')).default;
const auth = await import('../frontend/js/services/auth-service.js');
const cms = await import('../frontend/js/services/cms.js');

const ADMIN_PW = 'AdminPass-1!Strong';
const REVIEWER_PW = 'ReviewPass-1!Str';
const VISITOR_PW = 'VisitorPw-1!Str';

async function loginAsAdmin() {
  await auth.setupAdmin('admin', ADMIN_PW);
  await auth.login('admin', ADMIN_PW);
  await auth.requireRole(['admin']);
}

async function loginAsReviewer() {
  await loginAsAdmin();
  await auth.registerWithRole('reviewer1', REVIEWER_PW, 'reviewer', { id: 1, username: 'admin', role: 'admin' });
  auth.logout();
  await auth.login('reviewer1', REVIEWER_PW);
  await auth.requireRole(['reviewer']);
}

async function loginAsVisitor() {
  await loginAsAdmin();
  await auth.registerWithRole('visitor1', VISITOR_PW, 'visitor', { id: 1, username: 'admin', role: 'admin' });
  auth.logout();
  await auth.login('visitor1', VISITOR_PW);
  await auth.requireRole(['visitor']);
}

beforeEach(async () => {
  await resetFakeIndexedDB(DB);
  globalThis.localStorage.clear();
});

afterEach(() => { auth.logout(); });

// =========================================================================
// getWorkflowStates
// =========================================================================
describe('cms/getWorkflowStates', () => {
  it('returns the four workflow states', () => {
    const states = cms.getWorkflowStates();
    assert.deepEqual(states, ['draft', 'review', 'published', 'archived']);
  });

  it('returns a copy (mutations do not affect internal state)', () => {
    const a = cms.getWorkflowStates();
    a.push('deleted');
    const b = cms.getWorkflowStates();
    assert.equal(b.length, 4);
  });
});

// =========================================================================
// createContent
// =========================================================================
describe('cms/createContent', () => {
  it('creates content in draft state when called by reviewer', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'Test', body: 'Hello world', author: 'reviewer1' });
    assert.equal(record.workflowState, 'draft');
    assert.equal(record.title, 'Test');
    assert.equal(record.body, 'Hello world');
    assert.equal(record.version, 1);
    assert.ok(record.id);
  });

  it('creates content when called by admin', async () => {
    await loginAsAdmin();
    const record = await cms.createContent({ title: 'Admin Post', body: 'body' });
    assert.equal(record.workflowState, 'draft');
    assert.ok(record.id);
  });

  it('rejects content creation by visitor (unauthorized)', async () => {
    await loginAsVisitor();
    await assert.rejects(() => cms.createContent({ title: 'X', body: 'Y' }), /Unauthorized/);
  });

  it('initializes history with version 1', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'T', body: 'B', author: 'reviewer1' });
    assert.equal(record.history.length, 1);
    assert.equal(record.history[0].version, 1);
    assert.equal(record.history[0].state, 'draft');
  });

  it('sets default locale to en', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'T', body: 'B' });
    assert.equal(record.locale, 'en');
  });

  it('accepts custom locale', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'T', body: 'B', locale: 'fr' });
    assert.equal(record.locale, 'fr');
  });

  it('stores multilingual variants', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({
      title: 'Test', body: 'English', variants: { es: { title: 'Prueba', body: 'Espanol' } }
    });
    assert.deepEqual(record.variants.es, { title: 'Prueba', body: 'Espanol' });
  });

  it('creates audit log entry', async () => {
    await loginAsReviewer();
    await cms.createContent({ title: 'Audited', body: 'body', author: 'reviewer1' });
    const logs = await DB.getAll('audit_logs');
    const createLog = logs.find(l => l.action === 'content_created');
    assert.ok(createLog);
    assert.equal(createLog.details.title, 'Audited');
  });

  it('sets flagged to false and empty violations', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'T', body: 'B' });
    assert.equal(record.flagged, false);
    assert.deepEqual(record.violations, []);
  });
});

// =========================================================================
// updateContent
// =========================================================================
describe('cms/updateContent', () => {
  it('updates title and body', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'Old', body: 'Old body' });
    const updated = await cms.updateContent(record.id, { title: 'New', body: 'New body' }, 'reviewer1');
    assert.equal(updated.title, 'New');
    assert.equal(updated.body, 'New body');
  });

  it('increments version on update', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'V1', body: 'B' });
    assert.equal(record.version, 1);
    const updated = await cms.updateContent(record.id, { title: 'V2' }, 'reviewer1');
    assert.equal(updated.version, 2);
  });

  it('appends history entry', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'T', body: 'B' });
    await cms.updateContent(record.id, { title: 'T2' }, 'reviewer1');
    const stored = await DB.get('content', record.id);
    assert.equal(stored.history.length, 2);
  });

  it('throws on non-existent content', async () => {
    await loginAsReviewer();
    await assert.rejects(() => cms.updateContent(99999, { title: 'X' }, 'reviewer1'), /not found/i);
  });

  it('creates audit log with before/after', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'A', body: 'B' });
    await cms.updateContent(record.id, { title: 'C' }, 'reviewer1');
    const logs = await DB.getAll('audit_logs');
    const updateLog = logs.find(l => l.action === 'content_updated');
    assert.ok(updateLog);
    assert.equal(updateLog.before.title, 'A');
    assert.equal(updateLog.after.title, 'C');
  });

  it('rejects update by visitor', async () => {
    await loginAsAdmin();
    const record = await cms.createContent({ title: 'T', body: 'B' });
    auth.logout();
    await loginAsVisitor();
    await assert.rejects(() => cms.updateContent(record.id, { title: 'X' }, 'visitor1'), /Unauthorized/);
  });
});

// =========================================================================
// transitionWorkflow
// =========================================================================
describe('cms/transitionWorkflow', () => {
  it('transitions draft → review', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'T', body: 'B' });
    const result = await cms.transitionWorkflow(record.id, 'review', 'reviewer1');
    assert.equal(result.workflowState, 'review');
  });

  it('transitions review → published', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'T', body: 'B' });
    await cms.transitionWorkflow(record.id, 'review', 'reviewer1');
    const result = await cms.transitionWorkflow(record.id, 'published', 'reviewer1');
    assert.equal(result.workflowState, 'published');
  });

  it('transitions published → archived', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'T', body: 'B' });
    await cms.transitionWorkflow(record.id, 'review', 'reviewer1');
    await cms.transitionWorkflow(record.id, 'published', 'reviewer1');
    const result = await cms.transitionWorkflow(record.id, 'archived', 'reviewer1');
    assert.equal(result.workflowState, 'archived');
  });

  it('transitions archived → draft', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'T', body: 'B' });
    await cms.transitionWorkflow(record.id, 'review', 'reviewer1');
    await cms.transitionWorkflow(record.id, 'published', 'reviewer1');
    await cms.transitionWorkflow(record.id, 'archived', 'reviewer1');
    const result = await cms.transitionWorkflow(record.id, 'draft', 'reviewer1');
    assert.equal(result.workflowState, 'draft');
  });

  it('rejects invalid transition draft → published', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'T', body: 'B' });
    await assert.rejects(
      () => cms.transitionWorkflow(record.id, 'published', 'reviewer1'),
      /Cannot transition/
    );
  });

  it('rejects invalid transition archived → published', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'T', body: 'B' });
    await cms.transitionWorkflow(record.id, 'review', 'reviewer1');
    await cms.transitionWorkflow(record.id, 'published', 'reviewer1');
    await cms.transitionWorkflow(record.id, 'archived', 'reviewer1');
    await assert.rejects(
      () => cms.transitionWorkflow(record.id, 'published', 'reviewer1'),
      /Cannot transition/
    );
  });

  it('sets publishedBy on publish', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'T', body: 'B' });
    await cms.transitionWorkflow(record.id, 'review', 'reviewer1');
    const result = await cms.transitionWorkflow(record.id, 'published', 'reviewer1');
    assert.equal(result.publishedBy, 'reviewer1');
  });

  it('clears reviewedBy when transitioning to review', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'T', body: 'B' });
    await cms.transitionWorkflow(record.id, 'review', 'reviewer1');
    const stored = await DB.get('content', record.id);
    assert.equal(stored.reviewedBy, null);
  });

  it('creates audit log with before/after state', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'T', body: 'B' });
    await cms.transitionWorkflow(record.id, 'review', 'reviewer1');
    const logs = await DB.getAll('audit_logs');
    const wfLog = logs.find(l => l.action === 'content_workflow');
    assert.ok(wfLog);
    assert.equal(wfLog.before.workflowState, 'draft');
    assert.equal(wfLog.after.workflowState, 'review');
  });

  it('creates content_publish audit entry on publish', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'T', body: 'B' });
    await cms.transitionWorkflow(record.id, 'review', 'reviewer1');
    await cms.transitionWorkflow(record.id, 'published', 'reviewer1');
    const logs = await DB.getAll('audit_logs');
    const pubLog = logs.find(l => l.action === 'content_publish');
    assert.ok(pubLog);
  });

  it('appends history entry on each transition', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'T', body: 'B' });
    await cms.transitionWorkflow(record.id, 'review', 'reviewer1');
    const stored = await DB.get('content', record.id);
    assert.equal(stored.history.length, 2);
    assert.equal(stored.history[1].state, 'review');
  });

  it('throws on non-existent content id', async () => {
    await loginAsReviewer();
    await assert.rejects(() => cms.transitionWorkflow(99999, 'review', 'x'), /not found/i);
  });
});

// =========================================================================
// reviewContent
// =========================================================================
describe('cms/reviewContent', () => {
  it('approve transitions to published', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'T', body: 'B' });
    await cms.transitionWorkflow(record.id, 'review', 'reviewer1');
    const result = await cms.reviewContent(record.id, 'approve', 'reviewer1', 'Looks good');
    assert.equal(result.workflowState, 'published');
  });

  it('reject transitions back to draft', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'T', body: 'B' });
    await cms.transitionWorkflow(record.id, 'review', 'reviewer1');
    const result = await cms.reviewContent(record.id, 'reject', 'reviewer1', 'Needs work');
    assert.equal(result.workflowState, 'draft');
  });

  it('sets publishedBy on approve', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'T', body: 'B' });
    await cms.transitionWorkflow(record.id, 'review', 'reviewer1');
    await cms.reviewContent(record.id, 'approve', 'reviewer1', 'Great content');
    const stored = await DB.get('content', record.id);
    assert.equal(stored.publishedBy, 'reviewer1');
    assert.equal(stored.workflowState, 'published');
  });

  it('throws on non-existent content', async () => {
    await loginAsReviewer();
    await assert.rejects(() => cms.reviewContent(99999, 'approve', 'x'), /not found/i);
  });
});

// =========================================================================
// rollbackContent
// =========================================================================
describe('cms/rollbackContent', () => {
  it('rolls back to a previous version', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'V1', body: 'Body V1', author: 'reviewer1' });
    await cms.updateContent(record.id, { title: 'V2', body: 'Body V2' }, 'reviewer1');
    const rolled = await cms.rollbackContent(record.id, 1, 'reviewer1');
    assert.equal(rolled.title, 'V1');
    assert.equal(rolled.body, 'Body V1');
    assert.equal(rolled.version, 3);
  });

  it('appends rollback to history', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'V1', body: 'B1' });
    await cms.updateContent(record.id, { title: 'V2', body: 'B2' }, 'reviewer1');
    await cms.rollbackContent(record.id, 1, 'reviewer1');
    const stored = await DB.get('content', record.id);
    const lastHistory = stored.history[stored.history.length - 1];
    assert.equal(lastHistory.rollbackTo, 1);
  });

  it('creates audit log for rollback', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'V1', body: 'B1' });
    await cms.updateContent(record.id, { title: 'V2', body: 'B2' }, 'reviewer1');
    await cms.rollbackContent(record.id, 1, 'reviewer1');
    const logs = await DB.getAll('audit_logs');
    const rbLog = logs.find(l => l.action === 'content_rollback');
    assert.ok(rbLog);
    assert.equal(rbLog.details.toVersion, 1);
  });

  it('throws on non-existent version', async () => {
    await loginAsReviewer();
    const record = await cms.createContent({ title: 'V1', body: 'B1' });
    await assert.rejects(() => cms.rollbackContent(record.id, 99, 'reviewer1'), /not found/i);
  });

  it('throws on non-existent content', async () => {
    await loginAsReviewer();
    await assert.rejects(() => cms.rollbackContent(99999, 1, 'reviewer1'), /not found/i);
  });
});

// =========================================================================
// generateDiff
// =========================================================================
describe('cms/generateDiff', () => {
  it('detects added lines', () => {
    const diff = cms.generateDiff('a', 'a\nb');
    const added = diff.filter(d => d.type === 'added');
    assert.equal(added.length, 1);
    assert.equal(added[0].content, 'b');
  });

  it('detects removed lines', () => {
    const diff = cms.generateDiff('a\nb', 'a');
    const removed = diff.filter(d => d.type === 'removed');
    assert.equal(removed.length, 1);
    assert.equal(removed[0].content, 'b');
  });

  it('detects unchanged lines', () => {
    const diff = cms.generateDiff('a\nb', 'a\nb');
    assert.ok(diff.every(d => d.type === 'unchanged'));
  });

  it('detects changed lines', () => {
    const diff = cms.generateDiff('a\nb', 'a\nc');
    const removed = diff.filter(d => d.type === 'removed');
    const added = diff.filter(d => d.type === 'added');
    assert.ok(removed.length >= 1);
    assert.ok(added.length >= 1);
  });

  it('handles empty old text', () => {
    const diff = cms.generateDiff('', 'new line');
    const added = diff.filter(d => d.type === 'added');
    assert.ok(added.length >= 1);
  });

  it('handles empty new text', () => {
    const diff = cms.generateDiff('old line', '');
    const removed = diff.filter(d => d.type === 'removed');
    assert.ok(removed.length >= 1);
  });
});

// =========================================================================
// getContentInReview / getAllContent
// =========================================================================
describe('cms/getContentInReview and getAllContent', () => {
  it('getContentInReview returns only review-state content', async () => {
    await loginAsReviewer();
    await cms.createContent({ title: 'Draft', body: 'B' });
    const review = await cms.createContent({ title: 'Review', body: 'B' });
    await cms.transitionWorkflow(review.id, 'review', 'reviewer1');

    const inReview = await cms.getContentInReview();
    assert.equal(inReview.length, 1);
  });

  it('getAllContent returns all content regardless of state', async () => {
    await loginAsReviewer();
    await cms.createContent({ title: 'A', body: 'B' });
    await cms.createContent({ title: 'C', body: 'D' });
    const all = await cms.getAllContent();
    assert.equal(all.length, 2);
  });

  it('getAllContent returns empty array when no content exists', async () => {
    await loginAsReviewer();
    const all = await cms.getAllContent();
    assert.deepEqual(all, []);
  });
});
