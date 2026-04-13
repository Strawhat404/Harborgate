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
  - Missing reservation now returns empty result to prevent enumeration: `repo/frontend/js/services/permissions.js:94-95`
  - Ownership/privileged checks remain in place: `repo/frontend/js/services/permissions.js:96-99`

3. Medium: Notification retry contradiction (`failed` + `retryCount < MAX_RETRIES`)
- Status: **Fixed**
- Evidence:
  - Retry selector now targets pending items with in-progress retries: `repo/frontend/js/services/notifications.js:49-53`
  - Failure still becomes terminal at max retries: `repo/frontend/js/lib/notification-logic.js:56-61`

4. Medium: `docs/api-spec.md` notifications contract stale vs implementation exports
- Status: **Fixed**
- Evidence:
  - Notifications API section matches current exported service functions: `docs/api-spec.md:121-132`

5. Medium: API/integration tests still contain stale crypto assertions (`deriveSessionKey`) and remain mostly structural
- Status: **Fixed (for the stated claim)**
- Evidence:
  - No `deriveSessionKey` assertion remains in any test file; KEK/DEK model is asserted instead (e.g., `deriveKEK`, `wrapDEK`, `unwrapDEK` expectations): `repo/unit_tests/crypto.test.js`
  - Current test files are behavioral against imported logic modules rather than file-existence/string scaffolding: `repo/unit_tests/crypto.test.js`, `repo/unit_tests/auth.test.js`, `repo/unit_tests/permissions.test.js`
  - Note: `repo/API_tests/app.test.js` referenced in the prior audit artifact no longer exists; the equivalent behavioral coverage now lives in `repo/unit_tests/`.

## Final Result
- Fixed: **5 / 5** (relative to the exact five reported issues)
- Note: although issue #5 is fixed as written, tests are still not true runtime end-to-end integration tests (manual/runtime verification is still required for full delivery confidence).
