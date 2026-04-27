# HarborGate — API Specification

**Project type:** `web` (client-only SPA — no backend HTTP API server)

There is no backend HTTP API. All business logic runs client-side in the browser. This document specifies the JavaScript service module APIs that form the internal contract between views/components and the service layer.

---

## Response Conventions

All service functions return plain objects or primitives. Mutation operations return a result object:

```js
{ success: true, ... }          // on success
{ success: false, error: '...' } // on failure
```

Read operations return the requested data directly (array or object), or `null` / `[]` for not-found / unauthorized.

---

## Auth Service (`services/auth-service.js`)

| Function | Parameters | Returns | Auth Required | Description |
|----------|-----------|---------|---------------|-------------|
| `setupAdmin(username, password)` | `string, string` | `{ success, user }` | — | First-run admin account creation |
| `login(username, password)` | `string, string` | `{ success, user, error? }` | — | Validates credentials, enforces lockout, creates session |
| `logout()` | — | `void` | ✓ | Clears session from storage |
| `register(username, password)` | `string, string` | `{ success, user, error? }` | — | Self-registration; assigns `visitor` role only |
| `registerWithRole(username, password, role, actor)` | `string, string, string, User` | `{ success, user, error? }` | Admin actor | Admin-only privileged registration |
| `getCurrentUser()` | — | `User \| null` | — | Returns current session user from memory |
| `requireAuth()` | — | `boolean` | — | Redirects to login if no session; returns false |
| `requireRole(roles)` | `string[]` | `boolean` | — | Redirects if current user lacks required role |
| `hasRole(roles)` | `string[]` | `boolean` | — | Returns true if current user has any of the given roles |
| `updateLocale(locale)` | `string` | `void` | ✓ | Persists preferred locale for current user |
| `resetLockout(userId, actor)` | `number, User` | `{ success }` | Admin actor | Admin resets a locked-out account |
| `banUser(userId, actor)` | `number, User` | `{ success }` | Admin actor | Bans a user account |
| `unbanUser(userId, actor)` | `number, User` | `{ success }` | Admin actor | Unbans a user account |

Password policy: minimum 12 characters, 1 uppercase, 1 lowercase, 1 number, 1 symbol. Lockout: 5 failed attempts → 15-minute cooldown. Session timeout: 30-minute idle; warning at 25 minutes.

---

## Entry Permissions Service (`services/permissions.js`)

| Function | Parameters | Returns | Auth Required | Description |
|----------|-----------|---------|---------------|-------------|
| `createEntryPermission(reservation, policy?)` | `Reservation, 'single-use'\|'multi-use'` | `Permission` | — | Creates a time-bound entry permission for an approved reservation |
| `consumeEntry(permissionId, actor?)` | `number, User?` | `{ success, permission?, error? }` | Owner/Operator/Admin | Consumes one entry use; enforces time window and ownership |
| `getPermissionsForReservation(reservationId, actor)` | `number, User` | `Permission[]` | Owner/Operator/Admin | Returns permissions for a reservation; `[]` if unauthorized or reservation missing |
| `invalidatePermissionsForReservation(reservationId, actor?)` | `number, User?` | `number` | — | Immediately sets all linked permissions to `cancelled`; returns count invalidated |
| `expirePermissions()` | — | `number` | — | Background sweep: marks permissions past `windowEnd` as `expired`; returns count |
| `calculatePermissionWindow(startTime)` | `string` | `{ windowStart, windowEnd }` | — | Pure: computes 15-min-before / 30-min-after window |
| `isWithinPermissionWindow(perm, now?)` | `Permission, number?` | `boolean` | — | Pure: checks if current time is within the permission window |
| `getPermissionStatusLabel(perm)` | `Permission` | `string` | — | Pure: returns human-readable status label |

Permission window: 15 minutes before → 30 minutes after reservation start time. Entry policies: `single-use` (1 entry, consumed on first unlock), `multi-use` (up to 5 entries). Cancellation: calling `invalidatePermissionsForReservation` on reservation delete immediately sets all linked permissions to `cancelled` — they cannot be consumed thereafter.

---

## Device Service (`services/device.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `registerDevice(name, adapter, actor)` | `string, string, User` | `{ success, device? }` | Register a new door/device; adapter restricted to local-network targets |
| `sendUnlockCommand(deviceId, reason, actor, reservationId?)` | `number, string, User, number?` | `{ success, commandId?, error? }` | Send unlock; validates reason (10+ chars), rate limit, optional permission check |
| `acknowledgeCommand(commandId)` | `number` | `{ success }` | Mark command as acknowledged (ACK within 2s) |
| `getOutbox(actor)` | `User` | `Command[]` | Returns queued/failed commands for retry display |

ACK timeout: 2 seconds. Retry: every 10 seconds for up to 2 minutes. Adapter validation: only `127.0.0.1`, `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x` targets allowed.

---

## CMS Service (`services/cms.js`)

| Function | Parameters | Returns | Auth Required | Description |
|----------|-----------|---------|---------------|-------------|
| `createContent(data, actor)` | `object, User` | `{ success, content? }` | Reviewer/Admin | Create a draft content item |
| `updateContent(id, data, actor)` | `number, object, User` | `{ success }` | Reviewer/Admin | Update a draft or rejected item |
| `submitForReview(id, actor)` | `number, User` | `{ success }` | Reviewer/Admin | Transition draft → review |
| `approveContent(id, actor)` | `number, User` | `{ success }` | Reviewer/Admin | Transition review → published; logs `content_publish` audit event |
| `rejectContent(id, reason, actor)` | `number, string, User` | `{ success }` | Reviewer/Admin | Transition review → draft |
| `archiveContent(id, actor)` | `number, User` | `{ success }` | Reviewer/Admin | Transition published → archived |
| `rollbackContent(id, versionId, actor)` | `number, number, User` | `{ success }` | Reviewer/Admin | Restore a previous version |
| `getContent(id)` | `number` | `Content \| null` | — | Get content item by ID |
| `listContent(filters?)` | `object?` | `Content[]` | — | List content with optional status/compliance filters |

Workflow: `draft → review → published → archived`. Reject returns to `draft`. Compliance scanning checks for PII, profanity, and URLs.

---

## Notifications Service (`services/notifications.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createNotification(opts)` | `{ userId, templateId, variables, type }` | `Notification` | Create a notification from a template |
| `scheduleReservationReminders(reservation)` | `Reservation` | `void` | Schedule 24h and 1h reminders for a reservation |
| `processScheduledNotifications()` | — | `number` | Deliver due scheduled notifications; returns count delivered |
| `retryFailedNotifications()` | — | `number` | Retry eligible failed notifications (up to 3 attempts) |
| `markRead(notificationId, actor)` | `number, User` | `{ success }` | Mark a notification as read (owner or admin only) |
| `getUserNotifications(userId, actor)` | `number, User` | `Notification[]` | Get notifications for a user (scoped to owner or admin) |

Retry policy: up to 3 attempts. Delivery states: `pending → delivered | failed`. Templates support variables: `{reservationId}`, `{doorName}`, `{visitorName}`, etc.

---

## Map Service (`services/map.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `addPOI(data, actor)` | `object, User` | `POI` | Add a point of interest with coordinates (feet-based) |
| `updatePOI(id, data, actor)` | `number, object, User` | `{ success }` | Update a POI |
| `deletePOI(id, actor)` | `number, User` | `{ success }` | Delete a POI |
| `searchByRadius(center, radiusFt)` | `{x,y}, number` | `POI[]` | Find POIs within radius (feet) |
| `searchByZone(zoneId)` | `string` | `POI[]` | Find POIs in an administrative zone |
| `searchByPolygon(vertices)` | `{x,y}[]` | `POI[]` | Find POIs inside a polygon geofence |
| `planRoute(from, to, speedMph?)` | `{x,y}, {x,y}, number?` | `{ path, distanceFt, walkTimeMin }` | Route planning with configurable walk speed (default 3 mph) |
| `addGeofence(data, actor)` | `object, User` | `Geofence` | Add a named polygon geofence |
| `deleteGeofence(id, actor)` | `number, User` | `{ success }` | Delete a geofence |

Coordinates are feet-based. No external map provider is used.

---

## Audit Service (`services/audit.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `addAuditLog(action, actor, details, before?, after?)` | `string, string?, object, object?, object?` | `void` | Append an immutable audit entry |
| `getAuditLogs(filters?)` | `object?` | `AuditEntry[]` | Query audit log (admin only at view layer) |

The `audit_logs` IndexedDB store is append-only — `put`, `remove`, and `clear` operations are rejected at the DB wrapper level.

---

## Rate Limits Service (`services/rate-limits.js`)

| Function | Parameters | Returns | Auth Required | Description |
|----------|-----------|---------|---------------|-------------|
| `createRule(data, actor)` | `object, User` | `Rule` | Admin | Create a rate-limit rule |
| `updateRule(id, data, actor)` | `number, object, User` | `{ success }` | Admin | Update a rule |
| `deleteRule(id, actor)` | `number, User` | `{ success }` | Admin | Delete a rule |
| `checkRateLimit(scope, scopeId, action)` | `string, string, string` | `{ allowed, remaining }` | — | Check if an action is within limits; counts against audit log |

---

## Import/Export Service (`services/importexport.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `exportData(password)` | `string` | `EncryptedBundle` | Export all data as an AES-GCM encrypted JSON bundle; plaintext export is prohibited |
| `importData(bundle, password)` | `EncryptedBundle, string` | `{ success, error? }` | Decrypt and restore data; merges audit logs |

---

## IndexedDB Stores

| Store | Key | Indexes | Notes |
|-------|-----|---------|-------|
| `users` | `id` | `username` | Passwords stored as bcrypt hashes |
| `sessions` | `id` | `userId` | In-memory key only; page reload requires re-login |
| `reservations` | `id` | `userId`, `status` | |
| `entry_permissions` | `id` | `reservationId`, `userId` | Invalidated immediately on reservation delete |
| `devices` | `id` | `name` | |
| `unlock_commands` | `id` | `deviceId`, `status` | |
| `content_items` | `id` | `status`, `authorId` | |
| `notifications` | `id` | `userId`, `status` | |
| `audit_logs` | `id` | `action`, `actor` | Append-only; mutations rejected |
| `rate_limit_rules` | `id` | `action`, `scope` | |
| `pois` | `id` | `zone` | |
| `geofences` | `id` | `name` | |
| `encryption_keys` | `userId` | — | Wrapped DEK per user |
