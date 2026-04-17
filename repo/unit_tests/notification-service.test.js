/**
 * Notification service unit tests.
 * Tests: createNotification, deliverNotification, retryFailedNotifications,
 *        processScheduledNotifications, scheduleReservationReminders,
 *        getTemplates, getUserNotifications.
 */
import { describe, it, beforeEach } from 'node:test';
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
const notifSvc = await import('../frontend/js/services/notifications.js');

beforeEach(async () => {
  await resetFakeIndexedDB(DB);
  globalThis.localStorage.clear();
});

// =========================================================================
// createNotification
// =========================================================================
describe('notificationSvc/createNotification', () => {
  it('creates and immediately delivers a non-scheduled notification', async () => {
    const n = await notifSvc.createNotification({
      userId: 1,
      templateId: 'reservation_approved',
      variables: { reservationId: 42 },
      type: 'success'
    });
    assert.ok(n.id);
    assert.equal(n.status, 'delivered');
    assert.equal(n.message, 'Your reservation 42 has been approved.');
  });

  it('creates a scheduled notification that is not immediately delivered', async () => {
    const future = Date.now() + 24 * 60 * 60 * 1000;
    const n = await notifSvc.createNotification({
      userId: 1,
      templateId: 'reservation_reminder_24h',
      variables: { reservationId: 10, zone: 'lobby' },
      scheduledFor: future
    });
    assert.equal(n.status, 'pending');
    assert.equal(n.scheduledFor, future);
  });

  it('delivers past-scheduled notifications immediately', async () => {
    const past = Date.now() - 1000;
    const n = await notifSvc.createNotification({
      userId: 1,
      templateId: 'unlock_success',
      variables: { doorName: 'Main' },
      scheduledFor: past
    });
    assert.equal(n.status, 'delivered');
  });

  it('stores notification in the database', async () => {
    await notifSvc.createNotification({ userId: 5, templateId: 'unlock_success', variables: { doorName: 'D1' } });
    const all = await DB.getAll('notifications');
    assert.equal(all.length, 1);
    assert.equal(all[0].userId, 5);
  });

  it('defaults type to info', async () => {
    const n = await notifSvc.createNotification({ userId: 1, templateId: 'overdue_item', variables: { itemDescription: 'x' } });
    assert.equal(n.type, 'info');
  });
});

// =========================================================================
// deliverNotification
// =========================================================================
describe('notificationSvc/deliverNotification', () => {
  it('marks notification as delivered', async () => {
    const n = await notifSvc.createNotification({
      userId: 1, templateId: 'unlock_success', variables: { doorName: 'A' },
      scheduledFor: Date.now() + 999999999
    });
    const delivered = await notifSvc.deliverNotification(n);
    assert.equal(delivered.status, 'delivered');
    assert.ok(delivered.deliveredAt);
  });
});

// =========================================================================
// retryFailedNotifications
// =========================================================================
describe('notificationSvc/retryFailedNotifications', () => {
  it('retries failed notifications and delivers them', async () => {
    // Create a notification, then manually mark as failed
    const n = await notifSvc.createNotification({
      userId: 1, templateId: 'unlock_failed', variables: { doorName: 'B' },
      scheduledFor: Date.now() + 999999999
    });
    n.status = 'failed';
    n.retryCount = 3;
    await DB.put('notifications', n);

    const results = await notifSvc.retryFailedNotifications();
    assert.equal(results.length, 1);
    assert.equal(results[0].status, 'delivered');
  });

  it('retries partially-failed pending notifications', async () => {
    const n = await notifSvc.createNotification({
      userId: 1, templateId: 'overdue_item', variables: { itemDescription: 'x' },
      scheduledFor: Date.now() + 999999999
    });
    n.retryCount = 1;
    await DB.put('notifications', n);

    const results = await notifSvc.retryFailedNotifications();
    assert.equal(results.length, 1);
    assert.equal(results[0].status, 'delivered');
  });

  it('returns empty array when nothing to retry', async () => {
    const results = await notifSvc.retryFailedNotifications();
    assert.deepEqual(results, []);
  });
});

// =========================================================================
// processScheduledNotifications
// =========================================================================
describe('notificationSvc/processScheduledNotifications', () => {
  it('delivers due scheduled notifications', async () => {
    const past = Date.now() - 1000;
    await DB.add('notifications', {
      userId: 1, message: 'Test', status: 'pending',
      scheduledFor: past, retryCount: 0, read: false,
      type: 'info', createdAt: Date.now()
    });
    const count = await notifSvc.processScheduledNotifications();
    assert.equal(count, 1);
  });

  it('does not deliver future scheduled notifications', async () => {
    const future = Date.now() + 999999999;
    await DB.add('notifications', {
      userId: 1, message: 'Future', status: 'pending',
      scheduledFor: future, retryCount: 0, read: false,
      type: 'info', createdAt: Date.now()
    });
    const count = await notifSvc.processScheduledNotifications();
    assert.equal(count, 0);
  });

  it('returns 0 when no scheduled notifications', async () => {
    const count = await notifSvc.processScheduledNotifications();
    assert.equal(count, 0);
  });
});

// =========================================================================
// scheduleReservationReminders
// =========================================================================
describe('notificationSvc/scheduleReservationReminders', () => {
  it('creates 24h and 1h reminders for future reservation', async () => {
    const tomorrow = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const reservation = {
      id: 1,
      userId: 10,
      date: `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`,
      time: `${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`,
      zone: 'lobby'
    };
    await notifSvc.scheduleReservationReminders(reservation);

    const all = await DB.getAll('notifications');
    const templates = all.map(n => n.templateId || '');
    assert.ok(templates.some(t => t.includes('24h') || (all.find(n => n.message && n.message.includes('24 hours')))));
    assert.ok(all.length >= 2);
  });

  it('does not create reminders for past reservations', async () => {
    const past = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const reservation = {
      id: 2,
      userId: 10,
      date: `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}`,
      time: `${pad(past.getHours())}:${pad(past.getMinutes())}`,
      zone: 'dock'
    };
    await notifSvc.scheduleReservationReminders(reservation);
    const all = await DB.getAll('notifications');
    assert.equal(all.length, 0);
  });
});

// =========================================================================
// getTemplates
// =========================================================================
describe('notificationSvc/getTemplates', () => {
  it('returns a copy of all templates', () => {
    const templates = notifSvc.getTemplates();
    assert.ok(templates.reservation_approved);
    assert.ok(templates.reservation_denied);
    assert.ok(templates.unlock_success);
    assert.ok(templates.unlock_failed);
    assert.ok(templates.content_flagged);
    assert.ok(templates.content_published);
    assert.ok(templates.account_locked);
    assert.ok(templates.user_banned);
  });

  it('returns a new object each time', () => {
    const a = notifSvc.getTemplates();
    const b = notifSvc.getTemplates();
    assert.notEqual(a, b);
  });
});

// =========================================================================
// getUserNotifications
// =========================================================================
describe('notificationSvc/getUserNotifications', () => {
  it('returns notifications for a specific user', async () => {
    await notifSvc.createNotification({ userId: 1, templateId: 'unlock_success', variables: { doorName: 'A' } });
    await notifSvc.createNotification({ userId: 2, templateId: 'unlock_success', variables: { doorName: 'B' } });
    const user1 = await notifSvc.getUserNotifications(1);
    assert.equal(user1.length, 1);
  });

  it('returns all notifications when no userId specified', async () => {
    await notifSvc.createNotification({ userId: 1, templateId: 'unlock_success', variables: { doorName: 'A' } });
    await notifSvc.createNotification({ userId: 2, templateId: 'unlock_success', variables: { doorName: 'B' } });
    const all = await notifSvc.getUserNotifications();
    assert.equal(all.length, 2);
  });

  it('returns empty for user with no notifications', async () => {
    const result = await notifSvc.getUserNotifications(999);
    assert.deepEqual(result, []);
  });
});

// =========================================================================
// resolveTemplate (re-export)
// =========================================================================
describe('notificationSvc/resolveTemplate', () => {
  it('resolves template with variables', () => {
    const msg = notifSvc.resolveTemplate('reservation_approved', { reservationId: 7 });
    assert.equal(msg, 'Your reservation 7 has been approved.');
  });
});
