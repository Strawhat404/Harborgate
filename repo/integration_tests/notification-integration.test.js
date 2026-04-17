/**
 * Notification service integration test — full notification lifecycle.
 * No mocking of services, business logic, or database layer.
 */
import { describe, it, beforeEach } from 'node:test';
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

const DB = (await import('../frontend/js/database.js')).default;
const notifSvc = await import('../frontend/js/services/notifications.js');

beforeEach(async () => {
  await resetFakeIndexedDB(DB);
  globalThis.localStorage.clear();
});

describe('Notification Integration — full lifecycle', () => {
  it('create → deliver → retrieve by user', async () => {
    const n = await notifSvc.createNotification({
      userId: 42,
      templateId: 'reservation_approved',
      variables: { reservationId: 100 },
      type: 'success'
    });
    assert.equal(n.status, 'delivered');
    assert.equal(n.message, 'Your reservation 100 has been approved.');

    const userNotifs = await notifSvc.getUserNotifications(42);
    assert.equal(userNotifs.length, 1);
    assert.equal(userNotifs[0].userId, 42);
  });

  it('scheduled notification flow: create → process → deliver', async () => {
    const past = Date.now() - 1000;
    const n = await notifSvc.createNotification({
      userId: 1,
      templateId: 'overdue_item',
      variables: { itemDescription: 'Report' },
      scheduledFor: Date.now() + 999999999 // far future
    });
    assert.equal(n.status, 'pending');

    // Manually set scheduledFor to past
    n.scheduledFor = past;
    await DB.put('notifications', n);

    const count = await notifSvc.processScheduledNotifications();
    assert.equal(count, 1);

    const stored = await DB.get('notifications', n.id);
    assert.equal(stored.status, 'delivered');
  });

  it('retry failed notifications resets and re-delivers', async () => {
    const n = await notifSvc.createNotification({
      userId: 1, templateId: 'unlock_failed', variables: { doorName: 'Gate' },
      scheduledFor: Date.now() + 999999999
    });
    n.status = 'failed';
    n.retryCount = 3;
    await DB.put('notifications', n);

    const results = await notifSvc.retryFailedNotifications();
    assert.equal(results.length, 1);
    assert.equal(results[0].status, 'delivered');
    assert.equal(results[0].retryCount, 0); // reset
  });

  it('reservation reminders create two scheduled notifications', async () => {
    const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const reservation = {
      id: 5, userId: 10,
      date: `${futureDate.getFullYear()}-${pad(futureDate.getMonth() + 1)}-${pad(futureDate.getDate())}`,
      time: `${pad(futureDate.getHours())}:${pad(futureDate.getMinutes())}`,
      zone: 'lobby'
    };
    await notifSvc.scheduleReservationReminders(reservation);

    const all = await DB.getAll('notifications');
    assert.ok(all.length >= 2);
    assert.ok(all.every(n => n.status === 'pending'));
    assert.ok(all.every(n => n.userId === 10));
  });

  it('getUserNotifications without userId returns all', async () => {
    await notifSvc.createNotification({ userId: 1, templateId: 'unlock_success', variables: { doorName: 'A' } });
    await notifSvc.createNotification({ userId: 2, templateId: 'unlock_success', variables: { doorName: 'B' } });
    const all = await notifSvc.getUserNotifications();
    assert.equal(all.length, 2);
  });

  it('getTemplates returns all expected templates', () => {
    const templates = notifSvc.getTemplates();
    const expected = [
      'reservation_approved', 'reservation_denied',
      'reservation_reminder_24h', 'reservation_reminder_1h',
      'unlock_success', 'unlock_failed',
      'content_flagged', 'content_published',
      'overdue_item', 'missing_materials',
      'account_locked', 'user_banned'
    ];
    for (const key of expected) {
      assert.ok(templates[key], `Missing template: ${key}`);
    }
  });

  it('resolveTemplate resolves variables correctly', () => {
    const msg = notifSvc.resolveTemplate('unlock_success', { doorName: 'Front Gate' });
    assert.ok(msg.includes('Front Gate'));
  });

  it('multiple notifications for same user', async () => {
    await notifSvc.createNotification({ userId: 1, templateId: 'unlock_success', variables: { doorName: 'A' } });
    await notifSvc.createNotification({ userId: 1, templateId: 'unlock_failed', variables: { doorName: 'B' } });
    await notifSvc.createNotification({ userId: 1, templateId: 'overdue_item', variables: { itemDescription: 'X' } });
    const user1 = await notifSvc.getUserNotifications(1);
    assert.equal(user1.length, 3);
  });
});
