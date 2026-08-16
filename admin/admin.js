const ADMIN_USER   = 'cpars_admin';
const ADMIN_PASS   = 'CPARS@2025!secure';
const BETH_CODE    = '2012';
const SESSION_KEY  = 'cpars_admin_session';
const SESSION_ROLE = 'cpars_admin_role'; // 'admin' or 'readonly'

let adminSecret = '';
let userRole    = 'readonly';

/* ══════════════════════════════
   LOGIN / LOGOUT
══════════════════════════════ */
function doLogin() {
  const u = document.getElementById('adminUser').value.trim();
  const p = document.getElementById('adminPass').value.trim();
  const s = document.getElementById('adminSecret').value.trim();

  // Full admin login
  if (u === ADMIN_USER && p === ADMIN_PASS) {
    adminSecret = s;
    userRole    = 'admin';
    sessionStorage.setItem(SESSION_KEY,  'true');
    sessionStorage.setItem(SESSION_ROLE, 'admin');
    sessionStorage.setItem('cpars_admin_secret', s);
    showDashboard();
    return;
  }

  // Beth read-only passcode — just type anything in password field
  if (p === BETH_CODE || u === BETH_CODE) {
    userRole = 'readonly';
    sessionStorage.setItem(SESSION_KEY,  'true');
    sessionStorage.setItem(SESSION_ROLE, 'readonly');
    sessionStorage.removeItem('cpars_admin_secret');
    showDashboard();
    return;
  }

  document.getElementById('loginError').textContent = 'Invalid credentials. Try again.';
  document.getElementById('adminPass').value = '';
}

function showDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('dashboard').style.display   = 'block';

  // Hide admin-only actions for readonly users
  if (userRole === 'readonly') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    document.getElementById('roleTag').textContent = 'Read Only';
    document.getElementById('roleTag').style.background = '#92400e';
  } else {
    document.getElementById('roleTag').textContent = 'Admin';
  }

  loadActivity();
}

function doLogout() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_ROLE);
  sessionStorage.removeItem('cpars_admin_secret');
  location.reload();
}

// Auto-login if session active
(function autoLogin() {
  if (!sessionStorage.getItem(SESSION_KEY)) return;
  const role = sessionStorage.getItem(SESSION_ROLE) || 'readonly';
  userRole    = role;
  adminSecret = sessionStorage.getItem('cpars_admin_secret') || '';

  if (role === 'admin' && !adminSecret) {
    sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  showDashboard();
})();

/* ══════════════════════════════
   LOAD LIVE ACTIVITY FROM STRIPE
══════════════════════════════ */
let allShipments = [];

async function loadActivity() {
  const tbody = document.getElementById('activityBody');
  const errEl = document.getElementById('activityError');
  errEl.style.display = 'none';
  tbody.innerHTML = '<tr><td colspan="11"><div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading from Stripe...</div></td></tr>';

  if (userRole === 'admin' && !adminSecret) {
    errEl.style.display = 'block';
    errEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> No admin secret — please log out and log back in with your Admin Secret.';
    tbody.innerHTML = '<tr><td colspan="11"><div class="empty-state"><i class="fa-solid fa-lock"></i> Admin secret required</div></td></tr>';
    return;
  }

  try {
    const res  = await fetch('/.netlify/functions/admin-shipments', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ admin_secret: adminSecret || 'readonly' })
    });
    const data = await res.json();

    if (!res.ok || data.error) throw new Error(data.error || 'Failed to load');

    // Update stats
    document.getElementById('statRevenue').textContent = '$' + data.revenue.toFixed(2);
    document.getElementById('statTotal').textContent   = data.total;
    document.getElementById('statPaid').textContent    = data.paid;
    document.getElementById('statFailed').textContent  = data.failed;
    if (document.getElementById('statBooked')) {
      document.getElementById('statBooked').textContent = data.booked || 0;
    }

    allShipments = data.shipments;
    window._stripeShipments = data.shipments;
    renderTable(allShipments);

  } catch (err) {
    errEl.style.display = 'block';
    errEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Could not load Stripe data: ${err.message}`;
    tbody.innerHTML = '<tr><td colspan="11"><div class="empty-state"><i class="fa-solid fa-circle-xmark"></i> Failed to load</div></td></tr>';
  }
}

function renderTable(shipments) {
  const tbody = document.getElementById('activityBody');

  if (!shipments.length) {
    tbody.innerHTML = '<tr><td colspan="11"><div class="empty-state"><i class="fa-solid fa-inbox"></i> No orders found</div></td></tr>';
    return;
  }

  tbody.innerHTML = shipments.map((s, i) => {
    const payClass = s.paid ? 'pay-succeeded' : (s.status === 'canceled' ? 'pay-failed' : 'pay-pending');
    const payLabel = s.paid ? '✅ Paid' : (s.status === 'canceled' ? '❌ Failed' : '⏳ Pending');

    const bkStatus = s.booking_status || 'pending';
    const bkClass  = bkStatus === 'booked' || bkStatus === 'delivered' ? 'bk-booked'
                   : bkStatus === 'pending' ? 'bk-pending' : 'bk-pending';
    const bkLabel  = bkStatus === 'booked'    ? '📦 Booked'
                   : bkStatus === 'delivered' ? '✅ Delivered'
                   : bkStatus === 'in_transit'? '🚚 In Transit'
                   : '⏳ Pending';

    const trackingHtml = s.tracking_number
      ? `<code style="font-size:0.75rem;color:#34d399">${s.tracking_number}</code>`
      : `<span style="font-size:0.75rem;color:#f59e0b">—</span>`;

    // Find original index in allShipments for retry
    const origIdx = allShipments.findIndex(x => x.stripe_id === s.stripe_id);

    const actions = [
      s.receipt_url
        ? `<a href="${s.receipt_url}" class="action-btn" target="_blank"><i class="fa-solid fa-receipt"></i> Receipt</a>`
        : '',
      s.paid && userRole === 'admin'
        ? `<button class="action-btn retry admin-only" onclick="openRetryModal(${origIdx})"><i class="fa-solid fa-rotate"></i> Retry</button>`
        : '',
      userRole === 'admin'
        ? `<button class="action-btn track-entry admin-only" onclick="openTrackModal('${s.stripe_id}','${s.ref}')"><i class="fa-solid fa-pen"></i> Set Tracking</button>`
        : ''
    ].filter(Boolean).join('');

    return `
      <tr>
        <td><code style="font-size:0.78rem;color:#60a5fa">${s.ref}</code></td>
        <td>
          <div style="font-weight:600;color:#f1f5f9">${s.name}</div>
          <div style="font-size:0.75rem;color:#64748b">${s.email}</div>
          <div style="font-size:0.75rem;color:#64748b">${s.phone}</div>
        </td>
        <td>
          <div style="font-size:0.78rem">${s.origin}</div>
          <div style="font-size:0.78rem;color:#64748b">→ ${s.destination}</div>
        </td>
        <td>
          <div>${s.carrier}</div>
          <div style="font-size:0.75rem;color:#64748b">${s.service}</div>
        </td>
        <td style="font-size:0.78rem">${s.weight}</td>
        <td style="font-weight:700;color:#10b981">$${s.amount.toFixed(2)}</td>
        <td>${trackingHtml}</td>
        <td><span class="pay-badge ${payClass}">${payLabel}</span></td>
        <td><span class="pay-badge ${bkClass}">${bkLabel}</span></td>
        <td style="font-size:0.75rem;color:#64748b;white-space:nowrap">${s.submittedAt}</td>
        <td>${actions}</td>
      </tr>
    `;
  }).join('');
}

/* ══════════════════════════════
   SEARCH + FILTER
══════════════════════════════ */
function applyFilters() {
  const search    = (document.getElementById('searchInput').value || '').toLowerCase();
  const dateFrom  = document.getElementById('filterDateFrom').value;
  const dateTo    = document.getElementById('filterDateTo').value;
  const statusVal = document.getElementById('filterStatus').value;

  let filtered = allShipments.filter(s => {
    const matchSearch = !search ||
      s.ref.toLowerCase().includes(search) ||
      s.name.toLowerCase().includes(search) ||
      s.email.toLowerCase().includes(search) ||
      (s.tracking_number || '').toLowerCase().includes(search);

    const orderDate = new Date(s.submittedAt);
    const matchFrom = !dateFrom || orderDate >= new Date(dateFrom);
    const matchTo   = !dateTo   || orderDate <= new Date(dateTo + 'T23:59:59');

    const matchStatus = !statusVal ||
      (statusVal === 'paid'     && s.paid) ||
      (statusVal === 'failed'   && !s.paid) ||
      (statusVal === 'booked'   && (s.booking_status === 'booked' || s.booking_status === 'delivered')) ||
      (statusVal === 'pending'  && s.booking_status === 'pending' && s.paid);

    return matchSearch && matchFrom && matchTo && matchStatus;
  });

  renderTable(filtered);
}

function clearFilters() {
  document.getElementById('searchInput').value    = '';
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value   = '';
  document.getElementById('filterStatus').value   = '';
  renderTable(allShipments);
}

/* ══════════════════════════════
   RETRY BOOKING MODAL
══════════════════════════════ */
let retryTargetIndex = null;

function openRetryModal(index) {
  retryTargetIndex = index;
  document.getElementById('retryResult').style.display = 'none';
  document.getElementById('retryResult').className = 'modal-result';

  ['r-ref','r-name','r-email','r-phone','r-origin-zip','r-origin-street',
   'r-origin-city','r-dest-zip','r-dest-street','r-dest-city','r-weight',
   'r-carrier-code','r-service-code'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  if (index !== null && allShipments[index]) {
    const s = allShipments[index];
    document.getElementById('r-ref').value          = s.ref          !== '—' ? s.ref          : '';
    document.getElementById('r-name').value         = s.name         !== '—' ? s.name         : '';
    document.getElementById('r-email').value        = s.email        !== '—' ? s.email        : '';
    document.getElementById('r-phone').value        = s.phone        !== '—' ? s.phone        : '';
    document.getElementById('r-origin-zip').value   = s.origin_zip   !== '—' ? s.origin_zip   : '';
    document.getElementById('r-dest-zip').value     = s.destination_zip !== '—' ? s.destination_zip : '';
    const wParts = (s.weight || '').split(' ');
    document.getElementById('r-weight').value       = wParts[0] || '';
    document.getElementById('r-weight-unit').value  = wParts[1] || 'lbs';
  }

  document.getElementById('retryModal').classList.add('open');
}

function closeRetryModal() {
  document.getElementById('retryModal').classList.remove('open');
  retryTargetIndex = null;
}

async function submitRetry() {
  const btn    = document.getElementById('retrySubmitBtn');
  const result = document.getElementById('retryResult');

  const payload = {
    admin_secret:    adminSecret,
    ref:             document.getElementById('r-ref').value.trim(),
    name:            document.getElementById('r-name').value.trim(),
    email:           document.getElementById('r-email').value.trim(),
    phone:           document.getElementById('r-phone').value.trim(),
    origin_zip:      document.getElementById('r-origin-zip').value.trim(),
    origin_street:   document.getElementById('r-origin-street').value.trim(),
    origin_city:     document.getElementById('r-origin-city').value.trim(),
    destination_zip: document.getElementById('r-dest-zip').value.trim(),
    dest_street:     document.getElementById('r-dest-street').value.trim(),
    dest_city:       document.getElementById('r-dest-city').value.trim(),
    weight:          document.getElementById('r-weight').value.trim(),
    weight_unit:     document.getElementById('r-weight-unit').value,
    carrier_code:    document.getElementById('r-carrier-code').value.trim(),
    service_code:    document.getElementById('r-service-code').value.trim(),
  };

  if (!payload.origin_zip || !payload.destination_zip || !payload.weight) {
    result.className = 'modal-result error';
    result.style.display = 'block';
    result.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Origin ZIP, Destination ZIP and Weight are required.';
    return;
  }

  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Booking...';
  result.style.display = 'none';

  try {
    const res  = await fetch('/.netlify/functions/retry-booking', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      result.className = 'modal-result success';
      result.style.display = 'block';
      result.innerHTML = `
        <i class="fa-solid fa-circle-check"></i> <strong>Booking successful!</strong><br/>
        Tracking: <strong>${data.tracking_number}</strong><br/>
        ${data.label_url ? `<a href="${data.label_url}" target="_blank" style="color:#86efac;text-decoration:underline">📄 Download Label PDF</a>` : ''}
      `;
      setTimeout(() => { closeRetryModal(); loadActivity(); }, 3000);
    } else {
      result.className = 'modal-result error';
      result.style.display = 'block';
      result.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${data.error || 'Booking failed.'}`;
    }
  } catch (err) {
    result.className = 'modal-result error';
    result.style.display = 'block';
    result.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Network error: ${err.message}`;
  }

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Retry Booking';
}

/* ══════════════════════════════
   MANUAL TRACKING ENTRY MODAL
══════════════════════════════ */
function openTrackModal(stripeId, ref) {
  document.getElementById('tm-stripe-id').value   = stripeId;
  document.getElementById('tm-ref').textContent   = ref;
  document.getElementById('tm-tracking').value    = '';
  document.getElementById('trackModalResult').style.display = 'none';
  document.getElementById('trackModal').classList.add('open');
}

function closeTrackModal() {
  document.getElementById('trackModal').classList.remove('open');
}

async function submitTrackingEntry() {
  const btn       = document.getElementById('trackSubmitBtn');
  const result    = document.getElementById('trackModalResult');
  const stripeId  = document.getElementById('tm-stripe-id').value;
  const tracking  = document.getElementById('tm-tracking').value.trim();

  if (!tracking) {
    result.className = 'modal-result error';
    result.style.display = 'block';
    result.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Please enter a tracking number.';
    return;
  }

  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

  try {
    const res  = await fetch('/.netlify/functions/admin-set-tracking', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ admin_secret: adminSecret, stripe_id: stripeId, tracking_number: tracking })
    });
    const data = await res.json();

    if (data.success) {
      result.className = 'modal-result success';
      result.style.display = 'block';
      result.innerHTML = `<i class="fa-solid fa-circle-check"></i> Tracking number saved: <strong>${tracking}</strong>`;
      setTimeout(() => { closeTrackModal(); loadActivity(); }, 2000);
    } else {
      result.className = 'modal-result error';
      result.style.display = 'block';
      result.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${data.error || 'Failed to save.'}`;
    }
  } catch (err) {
    result.className = 'modal-result error';
    result.style.display = 'block';
    result.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${err.message}`;
  }

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Tracking';
}
