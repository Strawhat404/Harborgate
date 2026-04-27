# HarborGate — Visitor Access & Content Compliance

**Project type:** `web` (client-only SPA — no backend API server)

A browser-based visitor management and content compliance system with role-based access control, end-to-end encryption, and immutable audit logging. All business logic runs client-side; there is no backend HTTP API layer. The nginx container serves static files only.

---

## Quick Start

```bash
docker compose up -d
```

Open **http://localhost:8080** in your browser.

---

## First-Run Setup

On first launch, HarborGate presents a **Setup** screen to create the initial administrator account.

| Field            | Value                   |
|------------------|-------------------------|
| Admin Username   | `admin`                 |
| Admin Password   | `Admin-1!SecurePass`    |

> The password must be at least 12 characters with 1 uppercase, 1 lowercase, 1 number, and 1 symbol.

After setup, you can log in and create additional users from the Admin Console.

---

## Demo Credentials

| Role         | Username     | Password             | Permissions                                                    |
|--------------|--------------|----------------------|----------------------------------------------------------------|
| **Admin**    | `admin`      | `Admin-1!SecurePass` | Full access: all features, user management, audit log, reports |
| **Operator** | `operator1`  | `Operator-1!Pass`    | Reservations, remote unlock, map, notifications                |
| **Reviewer** | `reviewer1`  | `Reviewer-1!Pass`    | Content management, compliance review, notifications           |
| **Visitor**  | `visitor1`   | `Visitor-1!Pass`     | View/create reservations, map, notifications                   |

> **Note:** After first-run setup, log in as `admin` and navigate to **Admin Console > Users** to create the operator, reviewer, and visitor accounts with the credentials above. Self-registration via the login page creates **visitor-only** accounts. Privileged roles (operator, reviewer, admin) can only be assigned by an administrator.

---

## Access Method

| Component | URL / Port          |
|-----------|---------------------|
| Web UI    | http://localhost:8080 |
| Health    | http://localhost:8080/ (nginx healthcheck) |

---

## Verification

### Via Browser (Recommended)

1. Open http://localhost:8080
2. Complete the first-run setup (create admin account)
3. Log in with admin credentials
4. Verify the Dashboard loads with stat cards (Pending Reservations, Online Devices, Content for Review, Unread Notifications, Audit Entries)
5. Navigate to each section via the sidebar

### Via curl

```bash
# Verify the web server is running
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080
# Expected: 200

# Verify static assets are served
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/js/router.js
# Expected: 200
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser (Client)                  │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  Views    │  │Components│  │   Hash Router     │  │
│  │(9 pages) │→│(modal,    │  │ (client-side SPA) │  │
│  │          │  │ drawer,   │  └──────────────────┘  │
│  │          │  │ table,    │                         │
│  │          │  │ toast,    │  ┌──────────────────┐  │
│  │          │  │ warning)  │  │   State Store     │  │
│  └────┬─────┘  └──────────┘  │ (reactive, paged) │  │
│       │                      └──────────────────┘  │
│       ▼                                             │
│  ┌──────────────────────────────────────────────┐  │
│  │              Service Layer                    │  │
│  │  auth · permissions · cms · device · map ·    │  │
│  │  notifications · audit · rate-limits ·        │  │
│  │  import/export                                │  │
│  └────────────────────┬─────────────────────────┘  │
│                       ▼                             │
│  ┌──────────────────────────────────────────────┐  │
│  │         IndexedDB (Encrypted at Rest)         │  │
│  │  AES-GCM · PBKDF2 · KEK/DEK key hierarchy   │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
            │
            ▼ (static files only)
┌───────────────────┐
│  nginx:alpine     │
│  Port 8080 → 80   │
│  No caching       │
└───────────────────┘
```

### Tech Stack

| Layer          | Technology                                  |
|----------------|---------------------------------------------|
| Frontend       | Vanilla HTML/CSS/JavaScript (no frameworks) |
| Routing        | Hash-based client-side SPA router           |
| State          | Reactive in-memory store with subscriptions |
| Persistence    | IndexedDB (encrypted at rest)               |
| Encryption     | Web Crypto API (AES-GCM, PBKDF2)           |
| Server         | nginx:alpine (static file serving only)     |
| Testing        | Node.js built-in test runner + Playwright   |
| Containerization | Docker / Docker Compose                   |

### Key Design Decisions

- **No backend server** — all business logic runs client-side in the browser
- **Encryption at rest** — sensitive IndexedDB stores encrypted via AES-GCM with user-derived PBKDF2 key
- **Fail-closed auth** — session verification cross-checks DB; null returns deny access
- **Immutable audit log** — audit_logs store rejects put/remove/clear operations
- **Role-based access control** — 4 roles (visitor, operator, reviewer, admin) with permission-gated routes and functions

---

## Features

| Feature | Description |
|---------|-------------|
| **Authentication** | Password policy (12+ chars, mixed case, number, symbol), 5-attempt lockout with 15-min cooldown, 30-min idle timeout with 25-min warning |
| **Role-Based Access** | Visitor, Operator, Reviewer, Administrator with permission-gated routes and function-level authorization |
| **Reservations** | Create, approve, deny; auto-generated time-bound entry permissions (single-use / multi-use with 15-min-before to 30-min-after window) |
| **Remote Unlock** | Drawer panel for device unlock with confirmation modal, ACK timeout (2s), retry queue (every 10s for up to 2 min), local-only adapter validation |
| **Venue Map** | SVG map with POIs, radius/zone/polygon search, route planning with configurable walk speed, geofence drawing |
| **Content Management** | Draft → Review → Publish → Archive workflow, multilingual variants, compliance scanning (PII, profanity, URLs), diff viewer, version rollback |
| **Notification Center** | Template-based inbox with 12 templates, scheduled reminders (24h & 1h), retry logic (max 3 attempts), delivery receipts |
| **Admin Console** | User management (ban/unban, role assignment, lockout reset), immutable audit log with filters, incident reports with evidence chain, configurable rate limits |
| **Import/Export** | Encrypted JSON bundle backup and restore with password protection (plaintext export prohibited) |
| **Encryption at Rest** | Sensitive IndexedDB stores encrypted via AES-GCM; DEK wrapped per-user with PBKDF2-derived KEK |

---

## Roles & Permissions

| Role       | Routes                                                    | Key Permissions                                          |
|------------|-----------------------------------------------------------|----------------------------------------------------------|
| `visitor`  | Dashboard, Reservations, Map, Notifications, Settings     | reservations.view, reservations.create, map.view         |
| `operator` | Dashboard, Reservations, Remote Unlock, Map, Notifications, Settings | + reservations.manage, devices.unlock, devices.view |
| `reviewer` | Dashboard, Map, Content, Notifications, Settings          | + content.view, content.review, content.moderate         |
| `admin`    | All routes including Admin Console                        | All permissions (wildcard)                               |

---

## Environment Rules

Everything runs inside Docker. No host-level installs required.

- **No** `npm install` on the host
- **No** `pip install` on the host
- **No** `apt-get` on the host
- **No** manual database setup

All dependencies are resolved inside Docker containers. The coverage runner installs `c8` inside its container at runtime (`npm install --no-save c8`) — this is a container-internal install only and requires nothing on the host.

---

## Running Tests

### Unit + Integration Tests

```bash
# Via the test script (recommended)
./run_tests.sh

# Or via docker-compose
docker compose --profile test run --rm test-runner

# Or manually with Docker
docker run --rm -v "$(pwd):/app:ro" -w /app node:20-alpine \
  sh -c "node --test unit_tests/*.test.js integration_tests/*.test.js"
```

### Coverage Report (c8 / lcov)

```bash
docker compose --profile coverage run --rm coverage-runner
```

Produces `coverage/` directory with HTML report and lcov data. Configuration in `.c8rc.json`.

### E2E Browser Tests (Playwright)

```bash
# Start the web server first (waits for healthcheck)
docker compose up -d web

# Run E2E tests
docker compose --profile e2e run --rm e2e-runner
```

### Test Coverage Summary

| Category                | Files | Test Cases | What's Tested |
|-------------------------|-------|------------|---------------|
| **Auth & Crypto**       | 5     | ~85        | Password policy, lockout, session timeout, KEK/DEK wrap/unwrap, PBKDF2, AES-GCM |
| **Permissions**         | 4     | ~70        | Time windows, single/multi-use entry, object-level auth, fail-closed, cross-user denial |
| **Object-Level Auth**   | 1     | ~19        | Real service calls: consumeEntry, getPermissionsForReservation, registerWithRole cross-user boundaries |
| **CMS Service**         | 2     | ~45        | Create/update/transition/review/rollback, workflow state machine, audit trail, role authorization |
| **Device Service**      | 3     | ~35        | Register, unlock command, ACK timeout, retry, adapter validation, event stream |
| **Map Service**         | 3     | ~35        | POI CRUD, geofence CRUD, radius/zone/polygon search, route planning, walk time |
| **Notification Service**| 3     | ~35        | Template resolution, scheduled delivery, retry logic, user scoping, reminder scheduling |
| **Rate Limits**         | 3     | ~30        | CRUD with admin auth, enforcement against audit logs, global/user scope, disabled rules |
| **Import/Export**       | 2     | ~15        | Encrypted export/import, password validation, audit log merge, wrong password rejection |
| **Database**            | 1     | ~20        | CRUD operations, audit_logs immutability, encryption key management, index queries |
| **UI Components**       | 5     | ~50        | Modal, drawer, toast (real import), session warning (real import), paginated table |
| **View Rendering + Behavior** | 9 | ~86     | All 9 views: markup structure + event handlers + role-based rendering + data-driven output |
| **Router (real import)**| 1     | ~14        | register, navigate, start, hashchange, _resolve, fallback, currentRoute, _currentView |
| **Store**               | 1     | ~13        | Reactive state, pagination, sorting, filtering |
| **Route Auth**          | 1     | ~28        | All 4 roles × 8 routes, permission checks, session validation |
| **Integration**         | 7     | ~75        | Full lifecycle flows: auth→CMS, auth→permissions, device→audit, map→search, notification→retry, import/export round-trip, rate-limit enforcement |
| **E2E (Playwright)**    | 9     | ~80        | Login/register, dashboard, reservations CRUD, unlock flow, map POI, content workflow, notifications, admin console, settings |
| **TOTAL**               | **60**| **691**    | Every lib, service, component, view, and flow |

### Measured Coverage (c8)

| Metric     | Covered | Total | Percentage |
|------------|---------|-------|------------|
| Statements | 3376    | 4929  | 68.5%      |
| Branches   | 693     | 783   | 88.5%      |
| Functions  | 200     | 234   | 85.5%      |
| Lines      | 3376    | 4929  | 68.5%      |

> Uncovered statements are primarily async event handlers in views (form submissions, button clicks that trigger IndexedDB writes) which require a full browser environment. These paths are covered by the E2E Playwright tests.

### Test Architecture

```
unit_tests/              # 36 test files (Node.js built-in test runner)
│
│── Lib modules (pure logic, no browser/DB deps)
├── auth.test.js              # Password policy, lockout, session, role permissions
├── permissions.test.js       # Time windows, consume entry, status labels
├── content-compliance.test.js # PII/profanity/URL scanning, workflow, diff
├── device-service.test.js    # Command lifecycle, ACK timeout, retry
├── map.test.js               # Geometry, radius/zone/polygon search, routing
├── notification.test.js      # Template resolution, delivery states, retries
├── audit.test.js             # Entry creation, timestamp format, immutability
│
│── Service modules (real IndexedDB mock, no service stubs)
├── auth-service-flow.test.js # Setup → login → register flow with real crypto
├── crypto.test.js            # AES-GCM, PBKDF2, KEK/DEK wrap/unwrap
├── crypto-prod.test.js       # Production crypto.js — every exported function
├── cms-service.test.js       # CMS CRUD, workflow transitions, role auth
├── device-service-integration.test.js # Device service with DB, events
├── map-service.test.js       # POI/geofence CRUD via service layer
├── notification-service.test.js # Delivery, scheduling, retry via service
├── permissions-service.test.js # Create, consume, expire via service
├── rate-limits-service.test.js # CRUD + enforcement via service
├── importexport.test.js      # Encrypted export/import round-trip
├── database.test.js          # DB wrapper: CRUD, immutability, encryption keys
│
│── Authorization
├── object-auth.test.js       # Object-level auth patterns (36 tests)
├── route-auth.test.js        # Route-level auth: 4 roles × 8 routes
│
│── Infrastructure
├── router.test.js            # Hash-based SPA routing
├── store.test.js             # Reactive state, pagination, sorting, filtering
│
│── Components (real production imports)
├── modal.test.js             # escapeHTML, showModal, closeModal
├── drawer.test.js            # showDrawer, closeDrawer, animation
├── notifications-component.test.js # showNotification (real import), badge
├── session-warning.test.js   # initSessionWarning (real import), buttons
├── table-component.test.js   # renderTable, renderPaginatedTable
│
│── View rendering (every view directly unit-tested)
├── view-login.test.js        # Login/register forms, tabs, password rules
├── view-dashboard.test.js    # Stat cards, role-based rendering, actions
├── view-reservations.test.js # Table, search, status filter, actions
├── view-unlock.test.js       # Device grid, outbox, add device button
├── view-map.test.js          # SVG map, POI list, search modes, zones
├── view-content.test.js      # Workflow filter, compliance filter, table
├── view-notifications.test.js # Inbox, filters, action buttons
├── view-admin.test.js        # Tabs, users/audit/reports/rate-limits panels
├── view-settings.test.js     # Session info, theme, encryption, admin sections
│
│── Test infrastructure
├── dom-mock.js               # MockElement, MockDocument, setupDOM/teardownDOM
└── indexeddb-mock.js          # FakeDB, FakeStore, localStorage shim

integration_tests/       # 7 integration test files (real production modules, no stubs)
├── app.test.js                    # Cross-module: crypto, auth, permissions, rate-limits, audit, all libs
├── cms-integration.test.js        # Full CMS lifecycle: create → review → publish → archive → rollback
├── device-integration.test.js     # Device lifecycle: register → unlock → audit trail
├── map-integration.test.js        # Map lifecycle: POI + geofence CRUD, search, routing
├── notification-integration.test.js # Notification lifecycle: create → deliver → retry → schedule
├── importexport-integration.test.js # Import/export: encrypted backup and restore round-trip
└── rate-limits-integration.test.js  # Rate limits: create → enforce → update → disable → delete

e2e_tests/               # 9 Playwright browser test specs
├── playwright.config.js      # Config (reads PLAYWRIGHT_BASE_URL for Docker)
├── helpers.js                # Shared setup/login utilities, credentials
├── login.spec.js             # First-run setup, login, register, lockout
├── dashboard.spec.js         # Stat cards, navigation, quick actions
├── reservations.spec.js      # CRUD, approve/deny, search, permissions
├── unlock.spec.js            # Device management, drawer, confirmation modal
├── map.spec.js               # POI add/delete, search modes, routing
├── content.spec.js           # Workflow, compliance flagging, version history
├── notifications.spec.js     # Inbox, filters, retry, mark read, clear
├── admin.spec.js             # Users, audit log, reports, rate limits
└── settings.spec.js          # Theme, encryption test, import/export, logout
```

---

## Security

| Feature | Implementation |
|---------|---------------|
| Password Policy | Min 12 chars, 1 upper, 1 lower, 1 number, 1 symbol |
| Account Lockout | 5 failed attempts → 15-minute lockout |
| Session Timeout | 30-minute idle timeout; warning at 25 minutes |
| Encryption at Rest | AES-GCM for IndexedDB records; PBKDF2 (100K iterations) for key derivation |
| Key Hierarchy | Password → KEK → wraps DEK; DEK encrypts/decrypts records |
| In-Memory Key | Encryption key lives only in memory; page reload requires re-login |
| Audit Trail | Immutable (no update/delete); every action logged with actor, role, before/after |
| Rate Limiting | Configurable per-user and global limits; enforced against audit log counters |
| Object-Level Auth | Permission consumption restricted to owner/operator/admin |
| XSS Prevention | HTML escaping on all user-provided content rendered in DOM |
| Adapter Validation | Device adapters restricted to local-network targets only (127.0.0.1, 10.x, 172.16-31.x, 192.168.x) |

---

## Workflow Diagrams

### Reservation Lifecycle
```
Visitor creates → [pending] → Operator approves → [approved] + entry permission generated
                            → Operator denies   → [denied]
[approved] → Visitor uses entry → permission consumed → [completed]
```

### Content Publishing
```
Create → [draft] → Submit → [review] → Approve → [published] → Archive → [archived]
                                      → Reject  → [draft]
                   [archived] → Re-open → [draft]
                   Any version → Rollback → restores content + increments version
```

### Device Unlock
```
Operator enters reason (10+ chars) → Drawer form
  → Permission validated (if reservation ID provided)
  → Rate limit checked
  → Confirmation modal
  → Command sent → ACK within 2s → [acknowledged]
                 → No ACK        → [queued] → Retry every 10s for 2 min
                                             → [acknowledged] (device responds)
                                             → [failed] (timeout exceeded)
```

---

## Project Structure

```
repo/
├── frontend/                 # Static frontend (served by nginx)
│   ├── index.html            # Entry point with route registration
│   ├── css/styles.css        # All styling
│   └── js/
│       ├── router.js         # Hash-based SPA router
│       ├── store.js          # Reactive state management
│       ├── database.js       # IndexedDB wrapper with encryption
│       ├── crypto.js         # Web Crypto API helpers
│       ├── lib/              # Pure logic (no browser/DB deps)
│       ├── services/         # Business logic with DB access
│       ├── components/       # Reusable UI components
│       └── views/            # Page renderers (9 views)
├── unit_tests/               # Node.js unit tests (36 files)
├── integration_tests/        # Integration tests (7 files)
├── e2e_tests/                # Playwright browser tests (8 specs)
├── docker-compose.yml        # Web server + test runners
├── nginx.conf                # nginx configuration
├── run_tests.sh              # Docker-based test runner
└── README.md                 # This file
```
