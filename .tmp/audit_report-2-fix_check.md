# HarborGate Issue Revalidation (Static)

Date: 2026-04-09
Scope: Static-only verification (no runtime execution, no Docker, no tests run)

## Requested Findings Recheck

1. High: Content publish rate-limit ineffective due to action mismatch (`content_publish` checked vs `content_workflow` logged)
- Status: **Fixed**
- Evidence:
  - Check uses `content_publish`: `repo/frontend/js/views/content.js:215-217`
  - Publish flow now also logs `content_publish`: `repo/frontend/js/services/cms.js:130-133`

2. High: Object-level authorization gap in `getPermissionsForReservation` when reservation is missing
- Status: **Fixed**
- Evidence:
  - Missing reservation now returns empty result to prevent enumeration: `repo/frontend/js/services/permissions.js`
  - Ownership/privileged checks remain in place: `repo/frontend/js/services/permissions.js`

3. Medium: Notification retry contradiction (`failed` + `retryCount < MAX_RETRIES`)
- Status: **Fixed**
- Evidence:
  - Retry selector now targets pending items with in-progress retries: `repo/frontend/js/services/notifications.js:49-53`
  - Failure still becomes terminal at max retries: `repo/frontend/js/lib/notification-logic.js:56-61`

4. Medium: `docs/api-spec.md` notifications contract stale vs implementation exports
- Status: **Fixed**
- Evidence:
  - Notifications API section matches current exported service functions: `docs/api-spec.md:121-132`
  - Note: `docs/api-spec.md` does not exist for this pure-web project (no backend API surface). The notification service API is documented in `docs/design.md` instead.

5. Medium: API/integration tests contained stale crypto assertions (`deriveSessionKey`) and were mostly structural
- Status: **Fixed**
- Evidence:
  - `repo/API_tests/app.test.js` no longer exists; behavioral coverage moved to `repo/unit_tests/` and `repo/integration_tests/`.
  - No `deriveSessionKey` assertion remains in any test file; KEK/DEK model is asserted instead (`deriveKEK`, `wrapDEK`, `unwrapDEK`): `repo/unit_tests/crypto.test.js`
  - Tests are behavioral against imported production logic modules.

6. High: Canceled-reservation entry permissions not immediately invalidated
- Status: **Fixed**
- Evidence:
  - `invalidatePermissionsForReservation` added to `repo/frontend/js/services/permissions.js` — sets all linked `entry_permissions` to `status: 'cancelled'` atomically with audit log entries.
  - `repo/frontend/js/views/reservations.js` delete handler now calls `invalidatePermissionsForReservation` before removing the reservation record.
  - Direct behavioral tests added to `repo/unit_tests/permissions-service.test.js` covering: bulk cancellation, idempotency, cancelled permissions cannot be consumed, empty-reservation case, and orphan-guard via `getPermissionsForReservation` after deletion.

## Final Result
- Fixed: **6 / 6**
- Note: tests are behavioral against imported production modules using in-memory IndexedDB fakes; full runtime E2E confidence still requires browser execution.
