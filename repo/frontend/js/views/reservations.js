import DB from '../database.js';
import Store from '../store.js';
import { requireRole, getCurrentUser, hasRole } from '../services/auth-service.js';
import { createEntryPermission, getPermissionsForReservation, getPermissionStatusLabel, invalidatePermissionsForReservation } from '../services/permissions.js';
import { scheduleReservationReminders, createNotification } from '../services/notifications.js';
import { addAuditLog } from '../services/audit.js';
import { checkRateLimit } from '../services/rate-limits.js';
import { showModal, closeModal } from '../components/modal.js';
import { renderPaginatedTable } from '../components/table.js';
import { showNotification } from '../components/notifications.js';

export async function renderReservations(container) {
  if (!await requireRole(['visitor', 'operator', 'admin'])) return;
  const user = getCurrentUser();
  const canManage = hasRole(['admin', 'operator']);

  // Service-layer isolation: load only the actor's own records for non-privileged roles
  let reservations;
  if (canManage) {
    reservations = await DB.getAll('reservations');
  } else {
    reservations = await DB.getByIndex('reservations', 'userId', user.id);
  }

  container.innerHTML = `
    <div class="view-header">
      <h1>Reservations</h1>
      <button class="btn btn-primary" id="add-reservation-btn">+ New Reservation</button>
    </div>
    <div class="filters">
      <input type="text" id="reservation-search" placeholder="Search..." class="input" />
      <select id="reservation-status-filter" class="input">
        <option value="">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="denied">Denied</option>
        <option value="completed">Completed</option>
      </select>
    </div>
    <div id="reservations-table"></div>
  `;

  const columns = [
    { key: 'visitorName', label: 'Visitor', sortable: true },
    { key: 'date', label: 'Date', sortable: true },
    { key: 'time', label: 'Time', sortable: true },
    { key: 'zone', label: 'Zone', sortable: true },
    { key: 'entryPolicy', label: 'Entry Policy' },
    { key: 'status', label: 'Status', sortable: true, render: (val) => `<span class="badge badge-${val}">${val}</span>` },
    { key: 'permissionStatus', label: 'Permission' },
    { key: 'actions', label: 'Actions', render: (_, row) => {
      let btns = `<button class="btn btn-sm" data-action="view-perm" data-id="${row.id}">Permissions</button>`;
      if (canManage && row.status === 'pending') {
        btns += ` <button class="btn btn-sm btn-primary" data-action="approve" data-id="${row.id}">Approve</button>`;
        btns += ` <button class="btn btn-sm btn-danger" data-action="deny" data-id="${row.id}">Deny</button>`;
      }
      btns += ` <button class="btn btn-sm btn-danger" data-action="delete" data-id="${row.id}">Delete</button>`;
      return btns;
    }}
  ];

  // Attach permission status
  for (const r of reservations) {
    const perms = await getPermissionsForReservation(r.id, user);
    r.permissionStatus = perms.length > 0
      ? perms.map(p => `<span class="badge badge-${p.status}">${getPermissionStatusLabel(p)}</span>`).join(' ')
      : '<span class="badge badge-pending">None</span>';
    r.entryPolicy = r.entryPolicy || 'single-use';
  }

  const tableId = 'reservations';
  Store.initTable(tableId, reservations, { pageSize: 10, sortKey: 'date', sortDir: 'desc' });

  function refresh() {
    renderPaginatedTable(document.getElementById('reservations-table'), tableId, columns, bindActions);
  }

  refresh();

  document.getElementById('reservation-search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    Store.setTableFilter(tableId, q ? (r => r.visitorName.toLowerCase().includes(q) || r.zone.toLowerCase().includes(q)) : null);
    refresh();
  });

  document.getElementById('reservation-status-filter').addEventListener('change', (e) => {
    const s = e.target.value;
    Store.setTableFilter(tableId, s ? (r => r.status === s) : null);
    refresh();
  });

  document.getElementById('add-reservation-btn').addEventListener('click', () => openReservationForm());

  function bindActions() {
    document.querySelectorAll('[data-action="approve"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        // Service-level: only admin/operator may approve
        if (!canManage) { showNotification('Not authorized to approve reservations', 'error'); return; }
        const r = await DB.get('reservations', Number(btn.dataset.id));
        if (!r) return;
        const before = { ...r };
        r.status = 'approved';
        await DB.put('reservations', r);
        // Only create permission if none exists yet for this reservation
        const existingPerms = await getPermissionsForReservation(r.id, user);
        if (existingPerms.length === 0) {
          await createEntryPermission(r, r.entryPolicy || 'single-use');
        }
        await scheduleReservationReminders(r);
        await createNotification({
          userId: r.userId,
          templateId: 'reservation_approved',
          variables: { reservationId: r.id },
          type: 'success'
        });
        await addAuditLog('reservation_approved', user.username, { reservationId: r.id }, before, r);
        showNotification('Reservation approved', 'success');
        renderReservations(container);
      });
    });

    document.querySelectorAll('[data-action="deny"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        // Service-level: only admin/operator may deny
        if (!canManage) { showNotification('Not authorized to deny reservations', 'error'); return; }
        const r = await DB.get('reservations', Number(btn.dataset.id));
        if (!r) return;
        const before = { ...r };
        r.status = 'denied';
        await DB.put('reservations', r);
        await createNotification({
          userId: r.userId,
          templateId: 'reservation_denied',
          variables: { reservationId: r.id },
          type: 'warning'
        });
        await addAuditLog('reservation_denied', user.username, { reservationId: r.id }, before, r);
        showNotification('Reservation denied', 'warning');
        renderReservations(container);
      });
    });

    document.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reservation = await DB.get('reservations', Number(btn.dataset.id));
        if (!reservation) return;

        // Object-level authorization: only the owner or privileged roles may delete
        if (reservation.userId !== user.id && !canManage) {
          showNotification('Not authorized to delete this reservation', 'error');
          return;
        }

        await DB.remove('reservations', reservation.id);
        await invalidatePermissionsForReservation(reservation.id, user);
        await addAuditLog('reservation_deleted', user.username, { reservationId: reservation.id });
        showNotification('Reservation deleted', 'success');
        renderReservations(container);
      });
    });

    document.querySelectorAll('[data-action="view-perm"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const perms = await getPermissionsForReservation(Number(btn.dataset.id), user);
        showModal('Entry Permissions', perms.length === 0
          ? '<p>No permissions generated yet. Reservation must be approved first.</p><div class="form-actions"><button class="btn btn-secondary" id="close-perm-modal">Close</button></div>'
          : `<table class="data-table">
              <thead><tr><th>Policy</th><th>Used</th><th>Max</th><th>Window</th><th>Status</th></tr></thead>
              <tbody>${perms.map(p => `<tr>
                <td>${p.policy}</td>
                <td>${p.usedEntries}</td>
                <td>${p.maxEntries}</td>
                <td>${new Date(p.windowStart).toLocaleString()} — ${new Date(p.windowEnd).toLocaleString()}</td>
                <td><span class="badge badge-${p.status}">${getPermissionStatusLabel(p)}</span></td>
              </tr>`).join('')}</tbody>
            </table>
            <div class="form-actions"><button class="btn btn-secondary" id="close-perm-modal">Close</button></div>`
        );
        document.getElementById('close-perm-modal').addEventListener('click', closeModal);
      });
    });
  }

  function openReservationForm() {
    showModal('New Reservation', `
      <form id="reservation-form">
        <label class="form-label">Visitor Name
          <input type="text" name="visitorName" class="input" required />
        </label>
        <label class="form-label">Date
          <input type="date" name="date" class="input" required />
        </label>
        <label class="form-label">Time
          <input type="time" name="time" class="input" required />
        </label>
        <label class="form-label">Zone
          <select name="zone" class="input" required>
            <option value="">Select zone...</option>
            <option value="lobby">Lobby</option>
            <option value="office-a">Office A</option>
            <option value="office-b">Office B</option>
            <option value="warehouse">Warehouse</option>
            <option value="dock">Dock</option>
          </select>
        </label>
        <label class="form-label">Entry Policy
          <select name="entryPolicy" class="input">
            <option value="single-use">Single-use (1 entry)</option>
            <option value="multi-use">Multi-use (up to 5 entries)</option>
          </select>
        </label>
        <label class="form-label">Notes
          <textarea name="notes" class="input" rows="3"></textarea>
        </label>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Create</button>
          <button type="button" class="btn btn-secondary" id="cancel-reservation">Cancel</button>
        </div>
      </form>
    `);

    document.getElementById('cancel-reservation').addEventListener('click', closeModal);
    document.getElementById('reservation-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd);

      // Rate-limit: user-scoped and global reservation creation rules
      const [userRl, globalRl] = await Promise.all([
        checkRateLimit('user', String(user.id), 'reservation_created'),
        checkRateLimit('global', '', 'reservation_created')
      ]);
      if (!userRl.allowed || !globalRl.allowed) {
        showNotification('Reservation rate limit reached. Please try again later.', 'error');
        return;
      }

      data.userId = user.id;
      data.status = 'pending';
      data.createdAt = Date.now();
      const reservationId = await DB.add('reservations', data);
      data.id = reservationId;
      // Entry permission is generated on approval, not creation, to avoid duplicates
      await addAuditLog('reservation_created', user.username, { reservationId, visitorName: data.visitorName, zone: data.zone });
      showNotification('Reservation created', 'success');
      closeModal();
      renderReservations(container);
    });
  }
}
