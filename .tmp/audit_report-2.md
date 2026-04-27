# HarborGate Delivery Acceptance & Architecture Audit (Static Re-Run)

## 1. Verdict
- Overall conclusion: **Partial Pass**

## 2. Scope and Static Verification Boundary
- Reviewed: repository docs, SPA entry/routing, auth/session/role guards, core services (permissions/device/map/notifications/CMS/import-export/audit/rate-limits), shared components, and all listed unit/API test files.
- Not reviewed: runtime browser behavior, network/device adapter connectivity, actual timing behavior, Docker/nginx runtime, and real IndexedDB state transitions during execution.
- Intentionally not executed: project startup, Docker, tests, external services.
- Manual verification required for: real UI rendering/interaction quality, timed retry/scheduler behavior in a live browser session, and adapter ACK timing against real local controllers.

## 3. Repository / Requirement Mapping Summary
- Prompt core goal mapped: browser-only HarborGate system for visitor access + content governance across Visitor/Operator/Reviewer/Admin roles, with reservations -> entry permissions, remote unlock, map search/routing/geofence, notifications, CMS workflow, admin reports/rate limits/audit, local persistence, and encrypted storage.
- Main implementation areas mapped: `repo/frontend/index.html`, `repo/frontend/js/services/*.js`, `repo/frontend/js/views/*.js`, `repo/frontend/js/lib/*.js`, `repo/frontend/js/database.js`, `repo/frontend/js/crypto.js`, docs (`README.md`, `docs/design.md`, `docs/api-spec.md`), tests (`repo/unit_tests/*.test.js`, `repo/API_tests/app.test.js`).

## 4. Section-by-section Review

### 4.1 Documentation and static verifiability
#### 4.1.1 Startup / run / test / config instructions
- Conclusion: **Pass**
- Rationale: startup and test commands are documented; project structure is documented.
- Evidence: `README.md:14-29`, `repo/README.md:5-53`, `repo/run_tests.sh:1-10`

#### 4.1.2 Doc-to-code consistency / verifiability
- Conclusion: **Partial Pass**
- Rationale: most docs align, but internal API spec still describes notification service APIs that do not match implemented exports.
- Evidence: `docs/api-spec.md:107-114`, `repo/frontend/js/services/notifications.js:21-33`, `repo/frontend/js/services/notifications.js:104-109`
- Manual verification note: none

### 4.2 Delivered project vs prompt deviation
#### 4.2.1 Business-centered implementation
- Conclusion: **Pass**
- Rationale: code remains centered on prompt domains (reservations/permissions/unlock/map/notifications/CMS/admin/audit).
- Evidence: `repo/frontend/js/views/reservations.js:12-249`, `repo/frontend/js/views/unlock.js:11-211`, `repo/frontend/js/views/map.js:23-345`, `repo/frontend/js/views/content.js:33-362`, `repo/frontend/js/views/admin.js:11-437`

#### 4.2.2 Major unrelated replacement or prompt weakening
- Conclusion: **Pass**
- Rationale: no major unrelated subsystem replacing requested core problem.
- Evidence: `repo/frontend/index.html:33-175`, `docs/design.md:5-148`

### 4.3 Delivery completeness
#### 4.3.1 Core explicit requirements coverage
- Conclusion: **Partial Pass**
- Rationale: most core requirements are implemented, but one enforcement path is materially broken: content publish rate-limits check an action name never written to audit logs, so enforcement counter never advances.
- Evidence: `repo/frontend/js/views/content.js:213-217`, `repo/frontend/js/services/rate-limits.js:108-110`, `repo/frontend/js/services/cms.js:128`
- Manual verification note: runtime behavior would still need manual confirmation, but static logic already shows mismatch.

#### 4.3.2 End-to-end 0->1 deliverable completeness
- Conclusion: **Pass**
- Rationale: coherent SPA structure with docs, modules, and tests exists; not a fragment/demo-only drop.
- Evidence: `repo/frontend/index.html:1-177`, `repo/README.md:55-76`, `repo/API_tests/app.test.js:19-54`

### 4.4 Engineering and architecture quality
#### 4.4.1 Module decomposition and structure
- Conclusion: **Pass**
- Rationale: clear separation of views/components/services/lib/core modules.
- Evidence: `docs/design.md:15-38`, `repo/frontend/js/services/*.js`, `repo/frontend/js/views/*.js`, `repo/frontend/js/lib/*.js`

#### 4.4.2 Maintainability/extensibility
- Conclusion: **Partial Pass**
- Rationale: structure is maintainable, but test suite previously contained stale assertions tied to removed APIs (`deriveSessionKey`). Those have been corrected; the `repo/API_tests/` directory no longer exists — equivalent behavioral coverage now lives in `repo/unit_tests/` and `repo/integration_tests/`.
- Evidence: `repo/unit_tests/crypto.test.js`, `repo/unit_tests/auth.test.js`, `repo/frontend/js/crypto.js:102-119`, `repo/frontend/js/services/auth-service.js:159-166`

### 4.5 Engineering details and professionalism
#### 4.5.1 Error handling / logging / validation
- Conclusion: **Partial Pass**
- Rationale: good baseline validation and guarded flows exist, but notification retry path has contradictory conditions making “Retry Failed” effectively non-functional.
- Evidence: `repo/frontend/js/lib/notification-logic.js:56-61`, `repo/frontend/js/services/notifications.js:47-50`, `repo/frontend/js/views/notifications.js:162-166`

#### 4.5.2 Product-like quality vs demo-like
- Conclusion: **Partial Pass**
- Rationale: generally product-like; however the previous `repo/API_tests/app.test.js` (now removed) was largely structural string/file checks and did not meaningfully exercise high-risk service behavior. Current tests in `repo/unit_tests/` and `repo/integration_tests/` are behavioral.
- Evidence: `repo/unit_tests/permissions-service.test.js`, `repo/integration_tests/app.test.js`

### 4.6 Prompt understanding and requirement fit
#### 4.6.1 Business goal and implicit constraints fit
- Conclusion: **Partial Pass**
- Rationale: core fit is strong; remaining issues are enforcement and authorization edge correctness, not broad misunderstanding.
- Evidence: `repo/frontend/js/lib/permissions-logic.js:5-50`, `repo/frontend/js/services/device.js:11-14`, `repo/frontend/js/services/device.js:170-194`, `repo/frontend/js/services/importexport.js:15-77`

### 4.7 Aesthetics (frontend)
#### 4.7.1 Visual/interaction quality
- Conclusion: **Cannot Confirm Statistically**
- Rationale: static code suggests structured layout and interaction affordances, but rendering quality and UX polish cannot be proven without running in browser.
- Evidence: `repo/frontend/css/styles.css` (exists), `repo/frontend/js/components/modal.js:13-34`, `repo/frontend/js/components/drawer.js:5-31`, `repo/frontend/js/components/table.js:28-85`
- Manual verification note: inspect desktop/mobile rendering and interaction feedback in browser.

## 5. Issues / Suggestions (Severity-Rated)

### [High] Content publish rate-limit never accumulates usage
- Conclusion: **Fail**
- Evidence: `repo/frontend/js/views/content.js:213-217`, `repo/frontend/js/services/rate-limits.js:108-110`, `repo/frontend/js/services/cms.js:128`
- Impact: publish throttling can be effectively bypassed because checks count `content_publish` while logs record `content_workflow`.
- Minimum actionable fix: align action names end-to-end (either check `content_workflow` or emit dedicated `content_publish` audit events for approvals).

### [High] Object-level authorization gap for orphaned entry permissions
- Conclusion: **Fail**
- Evidence: `repo/frontend/js/services/permissions.js:93-99`, `repo/frontend/js/views/reservations.js:154-155`
- Impact: if reservation is deleted but linked permissions remain, authorization check is skipped (`reservation` null path), enabling unauthorized permission enumeration by reservationId.
- Minimum actionable fix: fail closed when reservation is missing (return `[]`), and/or cascade-delete linked `entry_permissions` when reservation is deleted.

### [Medium] Notification retry flow logic is contradictory
- Conclusion: **Fail**
- Evidence: `repo/frontend/js/lib/notification-logic.js:56-61`, `repo/frontend/js/services/notifications.js:49-50`
- Impact: records become `failed` only when `retryCount >= 3`, but retry selector requires `retryCount < 3`; manual “Retry Failed” path can become a no-op.
- Minimum actionable fix: redefine retry selector/state model (e.g., retry `failed` regardless of count with explicit reset policy, or mark retryable failures earlier).

### [Medium] API spec notification contract is stale vs implementation
- Conclusion: **Fail**
- Evidence: `docs/api-spec.md:107-114`, `repo/frontend/js/services/notifications.js:21-33`, `repo/frontend/js/services/notifications.js:104-109`
- Impact: reviewers/integrators can follow incorrect APIs and fail static verification quickly.
- Minimum actionable fix: update `docs/api-spec.md` notification API names/signatures to match exported functions.

### [Medium] API/integration tests contain stale and weakly behavioral assertions
- Conclusion: **Partial Fail**
- Evidence: stale: `repo/unit_tests/crypto.test.js` (previously referenced `deriveSessionKey`, now updated to KEK/DEK model); structural-only pattern previously in `repo/API_tests/app.test.js` (file no longer exists — coverage moved to `repo/unit_tests/` and `repo/integration_tests/`)
- Impact: severe regressions can pass static tests; confidence in acceptance readiness reduced.
- Minimum actionable fix: replace stale `deriveSessionKey` checks with current KEK/DEK model assertions and add behavioral tests for service-level authorization + rate-limit counting correctness.

## 6. Security Review Summary

### Authentication entry points
- Conclusion: **Pass**
- Evidence: password policy + lockout + login flow: `repo/frontend/js/services/auth-service.js:52-75`, `repo/frontend/js/services/auth-service.js:127-185`, `repo/frontend/js/lib/auth-logic.js:10-36`
- Reasoning: local auth rules and lockout semantics are implemented with explicit validation.

### Route-level authorization
- Conclusion: **Pass**
- Evidence: route guards in views: `repo/frontend/js/views/admin.js:12`, `repo/frontend/js/views/content.js:34`, `repo/frontend/js/views/unlock.js:12`, `repo/frontend/js/views/reservations.js:13`
- Reasoning: sensitive views enforce `requireRole`/`requireAuth` before rendering.

### Object-level authorization
- Conclusion: **Partial Pass**
- Evidence: positive controls: `repo/frontend/js/services/permissions.js:46-53`, `repo/frontend/js/views/reservations.js:148-152`, `repo/frontend/js/views/notifications.js:195-208`; gap: `repo/frontend/js/services/permissions.js:93-99`
- Reasoning: several object checks exist, but missing-reservation path skips ownership checks.

### Function-level authorization
- Conclusion: **Pass**
- Evidence: `repo/frontend/js/services/cms.js:15-21`, `repo/frontend/js/services/rate-limits.js:19-25`, `repo/frontend/js/services/auth-service.js:119-125`
- Reasoning: privileged service functions enforce role constraints and fail closed.

### Tenant / user data isolation
- Conclusion: **Partial Pass**
- Evidence: reservation scoping: `repo/frontend/js/views/reservations.js:17-23`; notifications scoping: `repo/frontend/js/views/notifications.js:52-55`, `repo/frontend/js/views/notifications.js:195-208`; orphan-permission gap: `repo/frontend/js/services/permissions.js:93-99`
- Reasoning: mostly role/user-scoped retrieval, with one significant edge-case leak path.

### Admin / internal / debug protection
- Conclusion: **Pass**
- Evidence: admin route + rate-limit admin-only service: `repo/frontend/js/views/admin.js:12`, `repo/frontend/js/services/rate-limits.js:19-25`
- Reasoning: no backend debug endpoints present; privileged admin features are guarded in SPA/service layers.

## 7. Tests and Logging Review

### Unit tests
- Conclusion: **Partial Pass**
- Evidence: extensive pure-logic tests exist: `repo/unit_tests/auth.test.js`, `repo/unit_tests/permissions.test.js`, `repo/unit_tests/map.test.js`, `repo/unit_tests/device-service.test.js`
- Reasoning: good logic coverage, but mostly lib-level; service/view integration risks remain under-tested.

### API / integration tests
- Conclusion: **Partial Pass**
- Evidence: `repo/unit_tests/*.test.js`, `repo/integration_tests/*.test.js`
- Reasoning: present but previously dominated by file/string checks in the now-removed `repo/API_tests/app.test.js`; current tests are behavioral against imported production modules.

### Logging categories / observability
- Conclusion: **Pass**
- Evidence: centralized audit events with action names + details + snapshots: `repo/frontend/js/services/audit.js:12-20`, `repo/frontend/js/lib/audit-logic.js:18-28`
- Reasoning: audit logs are structured and immutable at DB API level (`audit_logs` append-only constraints).

### Sensitive-data leakage risk in logs/responses
- Conclusion: **Partial Pass**
- Evidence: password hash/salt hidden in admin UI: `repo/frontend/js/views/admin.js:101-106`; global error logging prints stack: `repo/frontend/index.html:18-30`
- Reasoning: no obvious direct password display, but broad console stack logging may leak contextual internals during failures.

## 8. Test Coverage Assessment (Static Audit)

### 8.1 Test Overview
- Unit tests exist: **Yes** (`repo/unit_tests/*.test.js`) using Node `node:test`.
- Integration tests exist: **Yes** (`repo/integration_tests/*.test.js`) using Node `node:test`.
- Note: `repo/API_tests/` directory no longer exists; equivalent behavioral coverage has been moved to `repo/unit_tests/` and `repo/integration_tests/`.
- Test entry points: `repo/run_tests.sh:4-8`, `repo/unit_tests/package.json`.
- Test commands in docs: `README.md:24-29`.

### 8.2 Coverage Mapping Table
| Requirement / Risk Point | Mapped Test Case(s) | Key Assertion / Fixture / Mock | Coverage Assessment | Gap | Minimum Test Addition |
|---|---|---|---|---|---|
| Password policy + lockout | `repo/unit_tests/auth.test.js:22-126` | rule and lockout assertions (`MAX_ATTEMPTS`, `LOCKOUT_DURATION`) | sufficient | service-layer login path not directly covered | add auth-service login tests with DB stubs for failed/success flows |
| Permission window + single/multi-use | `repo/unit_tests/permissions.test.js:15-157` | boundary + consume semantics | sufficient | no service-level ownership tests | add `services/permissions.js` tests for owner/non-owner behavior |
| Unlock reason/ACK/retry constants | `repo/unit_tests/device-service.test.js:17-106` | ACK/retry transitions in pure logic | basically covered | no adapter dispatch + outbox persistence integration tests | add tests for `device.js` adapter timeout and queued writes |
| Map radius/zone/polygon/route | `repo/unit_tests/map.test.js:18-185` | geometric and walk-time assertions | sufficient | no view-level geofence canvas flow test | add DOM-level tests for geofence draw/save flow |
| Rate-limit enforcement correctness | `repo/unit_tests/` | behavioral tests for rate-limit service | insufficient | does not verify action-count alignment with audit logs | add behavioral test proving `content_publish` counter increments (or fails) against real audit actions |
| Encryption-at-rest model | `repo/unit_tests/crypto.test.js:107-177` | KEK/DEK wrap/unwrap assertions | basically covered | previously had stale `deriveSessionKey` expectations (now fixed) | verify deriveKEK/wrapDEK/unwrapDEK flow with production `crypto.js` + `auth-service.js` |
| Object-level authorization for permission fetch | `repo/unit_tests/permissions-service.test.js` | behavioral tests for missing-reservation fail-closed | covered | — | — |

### 8.3 Security Coverage Audit
- Authentication: **Basically covered** at pure-logic level (`auth.test.js`), but not fully at service/session storage behavior level.
- Route authorization: **Insufficiently covered**; API tests mainly string-match guards, not runtime navigation + redirect behavior.
- Object-level authorization: **Insufficiently covered**; existing tests do not catch orphan-permission authorization gap.
- Tenant/data isolation: **Insufficiently covered**; no behavioral test suite asserting cross-user denial across services.
- Admin/internal protection: **Basically covered** by role-guard string checks; deeper misuse scenarios remain untested.

### 8.4 Final Coverage Judgment
- **Partial Pass**
- Major pure logic risks are covered, but uncovered service-level authorization and rate-limit counting paths mean tests could still pass while severe defects remain (including one confirmed high-severity enforcement bug).

## 9. Final Notes
- This is a strict static audit only; runtime claims were not inferred.
- Prior blocker findings around hardcoded at-rest encryption passphrase are no longer present in current code.
- Remaining high-priority fixes should focus on authorization fail-closed behavior and rate-limit action alignment before acceptance.
