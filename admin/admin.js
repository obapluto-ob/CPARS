/* ── Carrier brand map (admin) ── */
const ADMIN_CARRIER_BRANDS = {
  ups:            { short: 'UPS', label: 'UPS', bg: '#f59e0b', accent: '#f59e0b' },
  fedex_walleted: { short: 'FX', label: 'FedEx', bg: '#7c3aed', accent: '#7c3aed' },
  fedex:          { short: 'FX', label: 'FedEx', bg: '#7c3aed', accent: '#7c3aed' },
  stamps_com:     { short: 'SC', label: 'Stamps.com', bg: '#2563eb', accent: '#2563eb' },
  usps:           { short: 'USPS', label: 'USPS', bg: '#2563eb', accent: '#2563eb' },
  globalpost:     { short: 'GP', label: 'GlobalPost', bg: '#0ea5e9', accent: '#0ea5e9' },
  dhl_express:    { short: 'DHL', label: 'DHL Express', bg: '#dc2626', accent: '#dc2626' },
  dhl:            { short: 'DHL', label: 'DHL', bg: '#dc2626', accent: '#dc2626' },
  ontrac:         { short: 'OT', label: 'OnTrac', bg: '#16a34a', accent: '#16a34a' },
};

function carrierLogoHtml(carrierCode, carrierName) {
  const key = (carrierCode || carrierName || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const cp = ADMIN_CARRIER_BRANDS[key] ||
    ADMIN_CARRIER_BRANDS[Object.keys(ADMIN_CARRIER_BRANDS).find(k => key.includes(k)) || ''] ||
    { short: 'CP', label: carrierName || 'Carrier', bg: '#1a56db', accent: '#1a56db' };

  return `<div class="admin-carrier-logo" style="background:${cp.bg};border-bottom:3px solid ${cp.accent};overflow:hidden;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;letter-spacing:0.04em;">${cp.short}</div>`;
}

const ADMIN_USER   = 'cpars_admin';
const ADMIN_PASS   = 'CPARS@2025!secure';
const BETH_CODE    = '2012';
const SESSION_KEY  = 'cpars_admin_session';
const SESSION_ROLE = 'cpars_admin_role';
const REMEMBER_KEY = 'cpars_admin_remember';

let userRole = 'readonly';

/* ══════════════════════════════
   PASSWORD TOGGLE
══════════════════════════════ */
function togglePassVis() {
  const inp  = document.getElementById('adminPass');
  const icon = document.getElementById('passToggleIcon');
  const show = inp.type === 'password';
  inp.type   = show ? 'text' : 'password';
  icon.className = show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
}

/* ══════════════════════════════
   LOGIN / LOGOUT
══════════════════════════════ */
function doLogin() {
  const u = (document.getElementById('adminUser').value || '').trim();
  const p = (document.getElementById('adminPass').value || '').trim();
  const remember = document.getElementById('rememberMe').checked;

  let role = null;
  if (u === ADMIN_USER && p === ADMIN_PASS) role = 'admin';
  else if (p === BETH_CODE || u === BETH_CODE) role = 'readonly';

  if (!role) {
    document.getElementById('loginError').textContent = 'Invalid credentials. Try again.';
    document.getElementById('adminPass').value = '';
    return;
  }

  userRole = role;
  sessionStorage.setItem(SESSION_KEY,  'true');
  sessionStorage.setItem(SESSION_ROLE, role);

  if (remember) {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify({ u, p, role }));
  } else {
    localStorage.removeItem(REMEMBER_KEY);
  }

  showDashboard();
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
  localStorage.removeItem(REMEMBER_KEY);
  location.reload();
}

// Auto-login if session active or remembered
(function autoLogin() {
  // Session still active (tab not closed)
  if (sessionStorage.getItem(SESSION_KEY)) {
    userRole = sessionStorage.getItem(SESSION_ROLE) || 'readonly';
    showDashboard();
    return;
  }
  // Remembered on this device
  try {
    const saved = JSON.parse(localStorage.getItem(REMEMBER_KEY) || 'null');
    if (saved && saved.role) {
      userRole = saved.role;
      sessionStorage.setItem(SESSION_KEY,  'true');
      sessionStorage.setItem(SESSION_ROLE, saved.role);
      // Pre-fill fields so user sees what was saved
      document.getElementById('adminUser').value  = saved.u || '';
      document.getElementById('adminPass').value  = saved.p || '';
      document.getElementById('rememberMe').checked = true;
      showDashboard();
    }
  } catch(e) { localStorage.removeItem(REMEMBER_KEY); }
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

  const secret = userRole === 'admin' ? 'cpars_admin_token' : 'cpars_readonly_2012';

  try {
    const res  = await fetch('/.netlify/functions/admin-shipments', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ admin_secret: secret })
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
    if (document.getElementById('statMargin')) {
      document.getElementById('statMargin').textContent = '$' + (data.totalMargin || 0).toFixed(2);
    }

    allShipments = data.shipments;
    window._stripeShipments = data.shipments;
    renderOperationalAlerts(data.shipments);
    renderTable(allShipments);
    updateTopbarStats(data);

  } catch (err) {
    errEl.style.display = 'block';
    errEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Could not load Stripe data: ${err.message}`;
    tbody.innerHTML = '<tr><td colspan="11"><div class="empty-state"><i class="fa-solid fa-circle-xmark"></i> Failed to load</div></td></tr>';
  }
}

function renderOperationalAlerts(shipments) {
  const host = document.getElementById('operationalAlerts');
  if (!host) return;

  const pending  = shipments.filter(s => s.paid && (s.booking_status === 'pending' || !s.booking_status)).length;
  const missingDest = shipments.filter(s => s.paid && (!s.destination || s.destination === '—' || /zip:/i.test(String(s.destination)))).length;
  const failed = shipments.filter(s => !s.paid && s.status === 'canceled').length;

  host.innerHTML = `
    <div class="alert-banner${pending ? ' warn' : ''}">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <span><strong>${pending}</strong> paid orders are still pending booking.</span>
    </div>
    <div class="alert-banner${missingDest ? ' danger' : ''}">
      <i class="fa-solid fa-location-crosshairs"></i>
      <span><strong>${missingDest}</strong> paid orders need destination / ZIP verification.</span>
    </div>
    <div class="alert-banner${failed ? ' danger' : ''}">
      <i class="fa-solid fa-circle-xmark"></i>
      <span><strong>${failed}</strong> failed or canceled orders need attention.</span>
    </div>
  `;
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
                   : bkStatus === 'refunded' ? 'bk-refunded' : 'bk-pending';
    const bkLabel  = bkStatus === 'booked'    ? '📦 Booked'
                   : bkStatus === 'delivered' ? '✅ Delivered'
                   : bkStatus === 'in_transit'? '🚚 In Transit'
                   : bkStatus === 'refunded'  ? '↩️ Refunded'
                   : '⏳ Pending';

    const trackingHtml = s.tracking_number
      ? `<code style="font-size:0.75rem;color:#34d399">${s.tracking_number}</code>`
      : `<span style="font-size:0.75rem;color:#f59e0b">—</span>`;

    // Find original index in allShipments for retry
    const origIdx = allShipments.findIndex(x => x.stripe_id === s.stripe_id);

    const actions = [
      s.receipt_url
        ? `<a href="${s.receipt_url}" class="action-btn" target="_blank" title="View Receipt"><i class="fa-solid fa-receipt"></i></a>`
        : '',
      s.label_url
        ? `<a href="${s.label_url}" class="action-btn label-btn" target="_blank" title="Download Label PDF"><i class="fa-solid fa-file-pdf"></i></a>`
        : '',
      s.paid && userRole === 'admin'
        ? `<button class="action-btn retry admin-only" onclick="openRetryModal(${origIdx})" title="Retry Booking"><i class="fa-solid fa-rotate"></i></button>`
        : '',
      userRole === 'admin'
        ? `<button class="action-btn track-entry admin-only" onclick="openTrackModal('${s.stripe_id}','${s.ref}')" title="Set Tracking"><i class="fa-solid fa-pen"></i></button>`
        : '',
      userRole === 'admin'
        ? `<button class="action-btn email-btn admin-only" onclick="openEmailModal(${origIdx})" title="Email Customer"><i class="fa-solid fa-envelope"></i></button>`
        : '',
      s.paid && userRole === 'admin'
        ? `<button class="action-btn refund-btn admin-only" onclick="openRefundModal('${s.stripe_id}','${s.ref}',${s.amount})" title="Issue Refund"><i class="fa-solid fa-rotate-left"></i></button>`
        : ''
    ].filter(Boolean).join('');

    return `
      <tr class="clickable-row" onclick="openDrawer(${origIdx})">
        <td data-label="Reference"><code style="font-size:0.78rem;color:#60a5fa">${s.ref}</code></td>
        <td data-label="Client">
          <div style="font-weight:600;color:#f1f5f9">${s.name}</div>
          <div style="font-size:0.75rem;color:#64748b">${s.email}</div>
          <div style="font-size:0.75rem;color:#64748b">${s.phone}</div>
        </td>
        <td data-label="Route">
          <div style="font-size:0.78rem">${s.origin}</div>
          <div style="font-size:0.78rem;color:#64748b">→ ${s.destination}</div>
        </td>
        <td data-label="Carrier">
          <div style="display:flex;align-items:center;gap:8px">
            ${carrierLogoHtml(s.carrier_code, s.carrier)}
            <div>
              <div>${s.carrier}</div>
              <div style="font-size:0.75rem;color:#64748b">${s.service}</div>
            </div>
          </div>
        </td>
        <td data-label="Weight" style="font-size:0.78rem">${s.weight}</td>
        <td data-label="Amount" style="font-weight:700;color:#10b981">$${s.amount.toFixed(2)}</td>
        <td data-label="Tracking">${trackingHtml}</td>
        <td data-label="Payment"><span class="pay-badge ${payClass}">${payLabel}</span></td>
        <td data-label="Booking"><span class="pay-badge ${bkClass}">${bkLabel}</span></td>
        <td data-label="Date" style="font-size:0.75rem;color:#64748b;white-space:nowrap">${s.submittedAt}</td>
        <td><div style="display:flex;flex-wrap:wrap;gap:4px" onclick="event.stopPropagation()">${actions}</div></td>
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
    // Store stripe_id for patch
    document.getElementById('retryModal').dataset.stripeId = s.stripe_id || '';
    document.getElementById('r-ref').value          = s.ref          !== '—' ? s.ref          : '';
    document.getElementById('r-name').value         = s.name         !== '—' ? s.name         : '';
    document.getElementById('r-email').value        = s.email        !== '—' ? s.email        : '';
    document.getElementById('r-phone').value        = s.phone        !== '—' ? s.phone        : '';
    document.getElementById('r-origin-zip').value   = s.origin_zip   !== '—' ? s.origin_zip   : '';
    document.getElementById('r-dest-zip').value     = s.destination_zip !== '—' ? s.destination_zip : '';
    // Parse street + city from full address string ("555 Butterfield Rd, Houston, TX, 77090")
    const parseAddr = (full, zip) => {
      if (!full || full === '—') return { street: '', city: '' };
      const parts = full.split(',').map(p => p.trim()).filter(Boolean);
      // Remove ZIP from end if present
      const filtered = parts.filter(p => p !== zip);
      const street = filtered[0] || '';
      const city   = filtered.slice(1).join(', ');
      return { street, city };
    };
    const orig = parseAddr(s.origin,      s.origin_zip);
    const dest = parseAddr(s.destination, s.destination_zip);
    document.getElementById('r-origin-street').value = orig.street;
    document.getElementById('r-origin-city').value   = orig.city;
    document.getElementById('r-dest-street').value   = dest.street;
    document.getElementById('r-dest-city').value     = dest.city;
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

/* Patch missing metadata on an existing Stripe PaymentIntent */
async function submitPatchMetadata() {
  const btn      = document.getElementById('retryPatchBtn');
  const result   = document.getElementById('retryResult');
  const stripeId = document.getElementById('retryModal').dataset.stripeId;

  if (!stripeId) {
    result.className = 'modal-result error';
    result.style.display = 'block';
    result.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> No Stripe ID found — open this modal from a table row, not Manual Retry.';
    return;
  }

  const originStreet = document.getElementById('r-origin-street').value.trim();
  const originCity   = document.getElementById('r-origin-city').value.trim();
  const originZip    = document.getElementById('r-origin-zip').value.trim();
  const destStreet   = document.getElementById('r-dest-street').value.trim();
  const destCity     = document.getElementById('r-dest-city').value.trim();
  const destZip      = document.getElementById('r-dest-zip').value.trim();

  const payload = {
    admin_secret:    'cpars_admin_token',
    stripe_id:       stripeId,
    name:            document.getElementById('r-name').value.trim(),
    phone:           document.getElementById('r-phone').value.trim(),
    origin:          [originStreet, originCity, originZip].filter(Boolean).join(', '),
    destination:     [destStreet, destCity, destZip].filter(Boolean).join(', '),
    origin_zip:      originZip,
    destination_zip: destZip,
    weight_declared: document.getElementById('r-weight').value.trim(),
    weight_unit:     document.getElementById('r-weight-unit').value,
  };

  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
  result.style.display = 'none';

  try {
    const res  = await fetch('/.netlify/functions/admin-patch-metadata', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      result.className = 'modal-result success';
      result.style.display = 'block';
      result.innerHTML = '<i class="fa-solid fa-circle-check"></i> Details saved to Stripe. Table will refresh.';
      setTimeout(() => { loadActivity(); }, 1800);
    } else {
      result.className = 'modal-result error';
      result.style.display = 'block';
      result.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> ' + (data.error || 'Save failed.');
    }
  } catch (err) {
    result.className = 'modal-result error';
    result.style.display = 'block';
    result.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> ' + err.message;
  }

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Details to Stripe';
}

async function submitRetry() {
  const btn    = document.getElementById('retrySubmitBtn');
  const result = document.getElementById('retryResult');

  const payload = {
    admin_secret:    'cpars_admin_token',
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
    } else if (data.insufficient_funds) {
      result.className = 'modal-result error';
      result.style.display = 'block';
      result.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:10px">
          <i class="fa-solid fa-triangle-exclamation" style="color:#fbbf24;font-size:1.3rem;margin-top:2px;flex-shrink:0"></i>
          <div>
            <strong style="color:#fbbf24;display:block;margin-bottom:6px">ShipEngine — Insufficient Funds</strong>
            Your ShipEngine account balance is too low to purchase this label.<br/>
            <a href="https://app.shipengine.com" target="_blank"
               style="color:#fbbf24;text-decoration:underline;font-weight:700;display:inline-flex;align-items:center;gap:5px;margin-top:8px">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Top Up Balance at ShipEngine
            </a><br/>
            <span style="font-size:0.8rem;color:#94a3b8;margin-top:6px;display:block">Once topped up, come back and click Retry Booking again.</span>
          </div>
        </div>
      `;
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
      body:    JSON.stringify({ admin_secret: 'cpars_admin_token', stripe_id: stripeId, tracking_number: tracking })
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

/* ══════════════════════════════
   EMAIL CUSTOMER MODAL
══════════════════════════════ */
let emailTargetIndex = null;

function openEmailModal(index) {
  emailTargetIndex = index;
  const s = allShipments[index] || {};
  document.getElementById('em-to-email').value  = s.email  !== '—' ? s.email  : '';
  document.getElementById('em-to-name').value   = s.name   !== '—' ? s.name   : '';
  document.getElementById('em-ref').value       = s.ref    !== '—' ? s.ref    : '';
  document.getElementById('em-carrier').value   = s.carrier !== '—' ? s.carrier : '';
  document.getElementById('em-service').value   = s.service !== '—' ? s.service : '';
  document.getElementById('em-amount').value    = s.amount ? '$' + s.amount.toFixed(2) : '';
  document.getElementById('em-tracking').value  = s.tracking_number || '';
  document.getElementById('em-message').value   = '';
  document.getElementById('em-subject').value   = 'Update on Your CPARS Shipment';
  document.getElementById('emailModalResult').style.display = 'none';
  document.getElementById('emailModal').classList.add('open');
}

function closeEmailModal() {
  document.getElementById('emailModal').classList.remove('open');
  emailTargetIndex = null;
}

async function submitEmailCustomer() {
  const btn    = document.getElementById('emailSubmitBtn');
  const result = document.getElementById('emailModalResult');
  const s      = allShipments[emailTargetIndex] || {};

  const payload = {
    admin_secret:    'cpars_admin_token',
    to_email:        document.getElementById('em-to-email').value.trim(),
    to_name:         document.getElementById('em-to-name').value.trim(),
    ref:             document.getElementById('em-ref').value.trim(),
    subject_note:    document.getElementById('em-subject').value.trim(),
    message:         document.getElementById('em-message').value.trim(),
    tracking_number: document.getElementById('em-tracking').value.trim(),
    tracking_url:    s.ref ? `https://cparstransportation.com/?track=${s.ref}&email=${encodeURIComponent(document.getElementById('em-to-email').value.trim())}` : '',
    label_url:       s.label_url || '',
    carrier:         document.getElementById('em-carrier').value.trim(),
    service:         document.getElementById('em-service').value.trim(),
    amount:          document.getElementById('em-amount').value.trim(),
  };

  if (!payload.to_email || !payload.message) {
    result.className = 'modal-result error';
    result.style.display = 'block';
    result.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Email and message are required.';
    return;
  }

  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
  result.style.display = 'none';

  try {
    const res  = await fetch('/.netlify/functions/admin-send-email', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      result.className = 'modal-result success';
      result.style.display = 'block';
      result.innerHTML = `<i class="fa-solid fa-circle-check"></i> Email sent to <strong>${payload.to_email}</strong>`;
      setTimeout(() => closeEmailModal(), 2500);
    } else {
      result.className = 'modal-result error';
      result.style.display = 'block';
      result.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${data.error || 'Failed to send email.'}`;
    }
  } catch (err) {
    result.className = 'modal-result error';
    result.style.display = 'block';
    result.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Network error: ${err.message}`;
  }

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Email';
}

/* ══════════════════════════════
   REFUND MODAL
══════════════════════════════ */
function openRefundModal(stripeId, ref, amount) {
  document.getElementById('rf-stripe-id').value  = stripeId;
  document.getElementById('rf-ref').textContent  = ref;
  document.getElementById('rf-amount').textContent = '$' + parseFloat(amount).toFixed(2);
  document.getElementById('rf-partial').value    = '';
  document.getElementById('rf-reason').value     = 'requested_by_customer';
  document.getElementById('refundModalResult').style.display = 'none';
  document.getElementById('refundModal').classList.add('open');
}

function closeRefundModal() {
  document.getElementById('refundModal').classList.remove('open');
}

async function submitRefund() {
  const btn      = document.getElementById('refundSubmitBtn');
  const result   = document.getElementById('refundModalResult');
  const stripeId = document.getElementById('rf-stripe-id').value;
  const partial  = document.getElementById('rf-partial').value.trim();
  const reason   = document.getElementById('rf-reason').value;

  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
  result.style.display = 'none';

  const payload = {
    admin_secret: 'cpars_admin_token',
    stripe_id:    stripeId,
    reason
  };
  if (partial) payload.amount_cents = Math.round(parseFloat(partial) * 100);

  try {
    const res  = await fetch('/.netlify/functions/admin-refund', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      result.className = 'modal-result success';
      result.style.display = 'block';
      result.innerHTML = `<i class="fa-solid fa-circle-check"></i> Refund of <strong>$${data.amount_refunded}</strong> issued. ID: ${data.refund_id}`;
      setTimeout(() => { closeRefundModal(); loadActivity(); }, 3000);
    } else {
      result.className = 'modal-result error';
      result.style.display = 'block';
      result.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${data.error || 'Refund failed.'}`;
    }
  } catch (err) {
    result.className = 'modal-result error';
    result.style.display = 'block';
    result.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Network error: ${err.message}`;
  }

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Issue Refund';
}

/* ══════════════════════════════
   EXPORT CSV
══════════════════════════════ */
function exportCSV() {
  const rows = [
    ['Reference','Name','Email','Phone','Origin','Destination','Carrier','Service','Weight','Amount','Tracking','Payment','Booking','Date']
  ];
  allShipments.forEach(s => {
    rows.push([
      s.ref, s.name, s.email, s.phone,
      s.origin, s.destination, s.carrier, s.service,
      s.weight, '$' + s.amount.toFixed(2),
      s.tracking_number || '',
      s.paid ? 'Paid' : s.status,
      s.booking_status,
      s.submittedAt
    ].map(v => `"${String(v || '').replace(/"/g, '""')}"`));
  });
  const csv  = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `cpars-orders-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ══════════════════════════════
   TOPBAR MINI-STATS
══════════════════════════════ */
function updateTopbarStats(data) {
  const el = document.getElementById('topbarStats');
  if (!el) return;
  document.getElementById('tmsRevenue').textContent = '$' + data.revenue.toFixed(2);
  document.getElementById('tmsTotal').textContent   = data.total + ' orders';
  const pending = (data.shipments || allShipments).filter(s => s.paid && s.booking_status === 'pending').length;
  document.getElementById('tmsPending').textContent = pending + ' pending';
  el.style.display = 'flex';
}

/* ══════════════════════════════
   REFUNDED BADGE — patch renderTable
   to show refunded status
══════════════════════════════ */
// Override bkLabel to include refunded
const _origRenderTable = renderTable;
// We patch inline below via the renderTable rewrite

/* ══════════════════════════════
   ORDER DETAIL DRAWER
══════════════════════════════ */
function openDrawer(index) {
  const s = allShipments[index];
  if (!s) return;

  document.getElementById('drawerRef').textContent = s.ref;

  const statusEl = document.getElementById('drawerStatus');
  statusEl.textContent = s.paid ? '✅ Paid' : (s.status === 'canceled' ? '❌ Failed' : '⏳ Pending');
  statusEl.className = 'pay-badge ' + (s.paid ? 'pay-succeeded' : s.status === 'canceled' ? 'pay-failed' : 'pay-pending');

  const bk = s.booking_status || 'pending';
  const bkLabel = bk === 'booked' ? '📦 Booked' : bk === 'delivered' ? '✅ Delivered' : bk === 'in_transit' ? '🚚 In Transit' : bk === 'refunded' ? '↩️ Refunded' : '⏳ Pending';

  // Show address verification banner if paid but destination missing
  const needsAddrVerify = s.paid && s.booking_status !== 'booked' && s.booking_status !== 'refunded' &&
    (!s.destination || s.destination === '\u2014' || s.destination.startsWith('ZIP:') || s.destination === '');

  const addrBanner = needsAddrVerify && userRole === 'admin' ? `
    <div style="background:#7c1d1d;border:1px solid #ef4444;border-radius:10px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:flex-start;gap:12px;">
      <i class="fa-solid fa-triangle-exclamation" style="color:#fca5a5;font-size:1.2rem;margin-top:2px;flex-shrink:0"></i>
      <div style="flex:1">
        <strong style="color:#fca5a5;display:block;margin-bottom:4px">Destination Address Missing</strong>
        <span style="color:#fecaca;font-size:0.83rem">This paid order cannot be booked until the destination address is filled in. Click below to verify and save it.</span>
        <div style="margin-top:10px">
          <button class="drawer-btn" style="background:#ef4444;border-color:#ef4444;" onclick="closeDrawer();openRetryModal(${index})">
            <i class="fa-solid fa-pen-to-square"></i> Fill Destination Address
          </button>
        </div>
      </div>
    </div>` : '';

  document.getElementById('drawerBody').innerHTML = addrBanner + `
    <div class="drawer-section">
      <div class="drawer-row"><span>Reference</span><strong style="font-family:monospace;color:#60a5fa">${s.ref}</strong></div>
      <div class="drawer-row"><span>Stripe ID</span><code style="font-size:0.75rem;color:#94a3b8">${s.stripe_id}</code></div>
      <div class="drawer-row"><span>Date</span><strong>${s.submittedAt}</strong></div>
      <div class="drawer-row"><span>Booking</span><strong>${bkLabel}</strong></div>
    </div>
    <div class="drawer-section">
      <div class="drawer-label">Client</div>
      <div class="drawer-row"><span>Name</span><strong>${s.name}</strong></div>
      <div class="drawer-row"><span>Email</span><strong>${s.email}</strong></div>
      <div class="drawer-row"><span>Phone</span><strong>${s.phone}</strong></div>
    </div>
    <div class="drawer-section">
      <div class="drawer-label">Shipment</div>
      <div class="drawer-row"><span>From</span><strong>${s.origin}</strong></div>
      <div class="drawer-row"><span>To</span><strong>${s.destination}</strong></div>
      <div class="drawer-row"><span>Carrier</span><strong>${s.carrier}</strong></div>
      <div class="drawer-row"><span>Service</span><strong>${s.service}</strong></div>
      <div class="drawer-row"><span>Weight</span><strong>${s.weight}</strong></div>
      <div class="drawer-row"><span>Amount Paid</span><strong style="color:#10b981;font-size:1.1rem">$${s.amount.toFixed(2)}</strong></div>
      ${s.carrier_price ? `<div class="drawer-row"><span>Carrier Cost</span><strong style="color:#94a3b8">$${s.carrier_price.toFixed(2)}</strong></div><div class="drawer-row"><span>CPARS Earnings</span><strong style="color:#f59e0b;font-size:1rem">$${(s.amount - s.carrier_price).toFixed(2)}</strong></div>` : ""}
    </div>
    ${s.tracking_number ? `
    <div class="drawer-section">
      <div class="drawer-label">Tracking</div>
      <div class="drawer-row"><span>Number</span><strong style="color:#34d399;font-family:monospace">${s.tracking_number}</strong></div>
    </div>` : ''}
    <div class="drawer-actions">
      ${s.receipt_url ? `<a href="${s.receipt_url}" target="_blank" class="drawer-btn"><i class="fa-solid fa-receipt"></i> Receipt</a>` : ''}
      ${s.label_url   ? `<a href="${s.label_url}"   target="_blank" class="drawer-btn"><i class="fa-solid fa-file-pdf"></i> Label PDF</a>` : ''}
      ${s.paid && userRole === 'admin' ? `<button class="drawer-btn" onclick="closeDrawer();openRetryModal(${index})"><i class="fa-solid fa-rotate"></i> Retry</button>` : ''}
      ${userRole === 'admin' ? `<button class="drawer-btn" onclick="closeDrawer();openTrackModal('${s.stripe_id}','${s.ref}')"><i class="fa-solid fa-pen"></i> Set Tracking</button>` : ''}
      ${userRole === 'admin' ? `<button class="drawer-btn" onclick="closeDrawer();openEmailModal(${index})"><i class="fa-solid fa-envelope"></i> Email</button>` : ''}
      ${s.paid && userRole === 'admin' && s.booking_status !== 'refunded' ? `<button class="drawer-btn danger" onclick="closeDrawer();openRefundModal('${s.stripe_id}','${s.ref}',${s.amount})"><i class="fa-solid fa-rotate-left"></i> Refund</button>` : ''}
    </div>
  `;

  document.getElementById('drawerOverlay').classList.add('open');
  document.getElementById('orderDrawer').classList.add('open');
}

function closeDrawer() {
  document.getElementById('drawerOverlay').classList.remove('open');
  document.getElementById('orderDrawer').classList.remove('open');
}

/* ══════════════════════════════
   AUTO-SYNC UNBOOKED ORDERS
══════════════════════════════ */
/* ══════════════════════════════
   ADMIN GUIDE TOGGLE
══════════════════════════════ */
function toggleGuide() {
  const body    = document.getElementById('guideBody');
  const chevron = document.getElementById('guideChevron');
  const open    = body.style.display === 'none';
  body.style.display    = open ? 'block' : 'none';
  chevron.style.transform = open ? 'rotate(180deg)' : '';
  try { localStorage.setItem('cpars_guide_open', open ? '1' : '0'); } catch(e) {}
}
// Restore last state
(function() {
  try {
    if (localStorage.getItem('cpars_guide_open') === '1') {
      const body    = document.getElementById('guideBody');
      const chevron = document.getElementById('guideChevron');
      if (body)    body.style.display      = 'block';
      if (chevron) chevron.style.transform = 'rotate(180deg)';
    }
  } catch(e) {}
})();

async function runAutoSync() {
  const btn = document.getElementById('autoSyncBtn');
  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Syncing...';

  try {
    const res  = await fetch('/.netlify/functions/auto-sync', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ admin_secret: 'cpars_admin_token' })
    });
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    const list = document.getElementById('syncResult');
    if (data.synced === 0 && data.skipped === 0) {
      list.innerHTML = `<div class="sync-item info"><i class="fa-solid fa-circle-info"></i> ${data.message || 'No unbooked orders found.'}</div>`;
    } else {
      list.innerHTML = `
        <div class="sync-summary">
          <span class="sync-ok"><i class="fa-solid fa-circle-check"></i> ${data.synced} booked</span>
          <span class="sync-skip"><i class="fa-solid fa-circle-xmark"></i> ${data.skipped} skipped</span>
        </div>
        ${(data.results || []).map(r => `
          <div class="sync-item ${r.status === 'booked' ? 'ok' : r.insufficient_funds ? 'funds' : 'fail'}">
            <div>
              <strong>${r.ref}</strong>
              ${r.status === 'booked'
                ? `<span style="color:#34d399"> — Booked: ${r.tracking_number}</span>`
                : r.insufficient_funds
                  ? `<span style="color:#fbbf24"> — ⚠️ Insufficient ShipEngine funds</span>`
                  : `<span style="color:#f87171"> — ${r.reason || r.status}</span>`}
            </div>
            ${r.label_url ? `<a href="${r.label_url}" target="_blank" style="color:#60a5fa;font-size:0.78rem;white-space:nowrap"><i class="fa-solid fa-file-pdf"></i> Label</a>` : ''}
            ${r.insufficient_funds ? `<a href="https://app.shipengine.com" target="_blank" style="color:#fbbf24;font-size:0.78rem;white-space:nowrap"><i class="fa-solid fa-arrow-up-right-from-square"></i> Top Up</a>` : ''}
          </div>
        `).join('')}
      `;
    }

    document.getElementById('syncModal').classList.add('open');
  } catch (err) {
    alert('Auto-sync failed: ' + err.message);
  }

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Auto-Sync Unbooked';
}
