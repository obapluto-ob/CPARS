const ADMIN_USER  = 'cpars_admin';
const ADMIN_PASS  = 'CPARS@2025!secure';
const SESSION_KEY = 'cpars_admin_session';

let adminSecret = '';

/* ══════════════════════════════
   LOGIN / LOGOUT
══════════════════════════════ */
function doLogin() {
  const u = document.getElementById('adminUser').value.trim();
  const p = document.getElementById('adminPass').value.trim();
  const s = document.getElementById('adminSecret').value.trim();

  if (u === ADMIN_USER && p === ADMIN_PASS) {
    adminSecret = s;
    sessionStorage.setItem(SESSION_KEY, 'true');
    sessionStorage.setItem('cpars_admin_secret', s);
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboard').style.display   = 'block';
    loadActivity();
  } else {
    document.getElementById('loginError').textContent = 'Invalid credentials. Try again.';
    document.getElementById('adminPass').value = '';
  }
}

function doLogout() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem('cpars_admin_secret');
  location.reload();
}

// Auto-login if session active
if (sessionStorage.getItem(SESSION_KEY)) {
  adminSecret = sessionStorage.getItem('cpars_admin_secret') || '';
  if (adminSecret) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboard').style.display   = 'block';
    loadActivity();
  } else {
    // Secret missing from session — force re-login
    sessionStorage.removeItem(SESSION_KEY);
  }
}

/* ══════════════════════════════
   LOAD LIVE ACTIVITY FROM STRIPE
══════════════════════════════ */
async function loadActivity() {
  const tbody = document.getElementById('activityBody');
  const errEl = document.getElementById('activityError');
  errEl.style.display = 'none';
  tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading from Stripe...</div></td></tr>';

  if (!adminSecret) {
    errEl.style.display = 'block';
    errEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> No admin secret — please log out and log back in with your Admin Secret to load live data.';
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-lock"></i> Admin secret required</div></td></tr>';
    return;
  }

  try {
    const res  = await fetch('/.netlify/functions/admin-shipments', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ admin_secret: adminSecret })
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error || 'Failed to load');
    }

    // Update stats
    document.getElementById('statRevenue').textContent = '$' + data.revenue.toFixed(2);
    document.getElementById('statTotal').textContent   = data.total;
    document.getElementById('statPaid').textContent    = data.paid;
    document.getElementById('statFailed').textContent  = data.failed;

    if (!data.shipments.length) {
      tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-inbox"></i> No orders yet</div></td></tr>';
      return;
    }

    tbody.innerHTML = data.shipments.map((s, i) => {
      const payClass = s.paid ? 'pay-succeeded' : (s.status === 'canceled' ? 'pay-failed' : 'pay-pending');
      const payLabel = s.paid ? '✅ Paid' : (s.status === 'canceled' ? '❌ Failed' : '⏳ Pending');

      const actions = [
        s.receipt_url
          ? `<a href="${s.receipt_url}" class="action-btn" target="_blank"><i class="fa-solid fa-receipt"></i> Receipt</a>`
          : '',
        s.paid
          ? `<button class="action-btn retry" onclick="openRetryModal(${i})"><i class="fa-solid fa-rotate"></i> Retry Book</button>`
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
          <td><span class="pay-badge ${payClass}">${payLabel}</span></td>
          <td style="font-size:0.75rem;color:#64748b;white-space:nowrap">${s.submittedAt}</td>
          <td>${actions}</td>
        </tr>
      `;
    }).join('');

    // Store shipments for retry pre-fill
    window._stripeShipments = data.shipments;

  } catch (err) {
    errEl.style.display = 'block';
    errEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Could not load Stripe data: ${err.message}`;
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-circle-xmark"></i> Failed to load</div></td></tr>';
  }
}

/* ══════════════════════════════
   RETRY BOOKING MODAL
══════════════════════════════ */
let retryTargetIndex = null;

function openRetryModal(index) {
  retryTargetIndex = index;
  document.getElementById('retryResult').style.display = 'none';
  document.getElementById('retryResult').className = 'modal-result';

  // Clear fields first
  ['r-ref','r-name','r-email','r-phone','r-origin-zip','r-origin-street',
   'r-origin-city','r-dest-zip','r-dest-street','r-dest-city','r-weight',
   'r-carrier-code','r-service-code'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Pre-fill from Stripe data if index given
  if (index !== null && window._stripeShipments) {
    const s = window._stripeShipments[index];
    if (s) {
      document.getElementById('r-ref').value   = s.ref   !== '—' ? s.ref   : '';
      document.getElementById('r-name').value  = s.name  !== '—' ? s.name  : '';
      document.getElementById('r-email').value = s.email !== '—' ? s.email : '';
      document.getElementById('r-phone').value = s.phone !== '—' ? s.phone : '';
      // Origin / dest are stored as full strings from Stripe metadata
      // Admin can split them manually — we pre-fill what we have
      const originParts = s.origin.split(',');
      const destParts   = s.destination.split(',');
      document.getElementById('r-origin-zip').value = originParts[originParts.length - 1]?.trim() || '';
      document.getElementById('r-dest-zip').value   = destParts[destParts.length - 1]?.trim()   || '';
      // Weight: "50 lbs" → split
      const wParts = s.weight.split(' ');
      document.getElementById('r-weight').value      = wParts[0] || '';
      document.getElementById('r-weight-unit').value = wParts[1] || 'lbs';
    }
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

  if (!adminSecret) {
    result.className = 'modal-result error';
    result.style.display = 'block';
    result.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> No admin secret found. Log out and log back in with your Admin Secret.';
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
        Tracking Number: <strong>${data.tracking_number}</strong><br/>
        ${data.label_url ? `<a href="${data.label_url}" target="_blank" style="color:#86efac;text-decoration:underline">📄 Download Label PDF</a>` : ''}
      `;
    } else {
      result.className = 'modal-result error';
      result.style.display = 'block';
      result.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${data.error || 'Booking failed — try manually in ShipStation.'}`;
    }
  } catch (err) {
    result.className = 'modal-result error';
    result.style.display = 'block';
    result.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Network error: ${err.message}`;
  }

  btn.disabled  = false;
  btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Retry Booking';
}
