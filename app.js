    /* ══════════════════════════════
       LOAD ALL SECTIONS
    ══════════════════════════════ */
    const sections = [
      ['s-navbar',   'sections/navbar.html'],
      ['s-hero',     'sections/hero.html'],
      ['s-toc',      'sections/toc.html'],
      ['s-about',    'sections/about.html'],
      ['s-services', 'sections/services.html'],
      ['s-hazmat',   'sections/hazmat.html'],
      ['s-safety',   'sections/safety.html'],
      ['s-fleet',    'sections/fleet.html'],
      ['s-why',      'sections/why.html'],
      ['s-contact',  'sections/contact.html'],
      ['s-footer',   'sections/footer.html'],
    ];

    Promise.all(sections.map(([id, file]) =>
      fetch(file).then(r => r.text()).then(html => {
        document.getElementById(id).innerHTML = html;
      })
    )).then(() => {
      initSlider();
      initNavbar();
      initContact();
      checkReturningUser();
    });

    /* ══════════════════════════════
       SLIDER
    ══════════════════════════════ */
    function initSlider() {
      let current = 0;
      const slides = document.querySelectorAll('.slide');
      const dots   = document.querySelectorAll('.dot');
      if (!slides.length) return;
      window.goToSlide = (n) => {
        slides[current].classList.remove('active');
        dots[current].classList.remove('active');
        current = n;
        slides[current].classList.add('active');
        dots[current].classList.add('active');
      };
      setInterval(() => window.goToSlide((current + 1) % slides.length), 3500);
    }

    /* ══════════════════════════════
       NAVBAR
    ══════════════════════════════ */
    function initNavbar() {
      window.toggleMenu = () => {
        document.getElementById('mobileMenu').classList.toggle('open');
      };
      window.addEventListener('scroll', () => {
        const nav = document.querySelector('.navbar');
        if (nav) nav.classList.toggle('scrolled', window.scrollY > 50);
      });
    }

    /* ══════════════════════════════
       STORAGE HELPERS
    ══════════════════════════════ */
    const STORAGE_KEY = 'cpars_last_request';
    const COOKIE_KEY  = 'cpars_ref';
    const TTL_DAYS    = 30;

    function saveRequest(data) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, savedAt: Date.now() })); } catch(e) {}
      // Also save to admin shipments log
      try {
        const all = JSON.parse(localStorage.getItem('cpars_all_shipments') || '[]');
        all.push({ ...data, savedAt: Date.now() });
        localStorage.setItem('cpars_all_shipments', JSON.stringify(all));
      } catch(e) {}
      const expires = new Date(Date.now() + TTL_DAYS * 86400000).toUTCString();
      document.cookie = `${COOKIE_KEY}=${data.ref}; expires=${expires}; path=/; SameSite=Lax`;
    }

    function loadRequest() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          if ((Date.now() - data.savedAt) / 86400000 < TTL_DAYS) return data;
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch(e) {}
      const match = document.cookie.match(new RegExp(`${COOKIE_KEY}=([^;]+)`));
      if (match) return { ref: match[1], cookieOnly: true };
      return null;
    }

    function clearRequest() {
      try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
      document.cookie = `${COOKIE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    }

    /* ══════════════════════════════
       RETURNING USER BANNER
    ══════════════════════════════ */
    function checkReturningUser() {
      const saved = loadRequest();
      if (!saved) return;
      const banner   = document.getElementById('returningBanner');
      const bannerRef = document.getElementById('bannerRef');
      if (!banner) return;
      bannerRef.textContent = saved.ref || 'your previous request';
      banner.style.display = 'block';
      banner.style.opacity = '0';
      banner.style.transform = 'translateY(-10px)';
      requestAnimationFrame(() => {
        banner.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        banner.style.opacity = '1';
        banner.style.transform = 'translateY(0)';
      });
    }

    window.showLastRequest = () => {
      const saved = loadRequest();
      if (!saved) return;
      dismissBanner();
      document.getElementById('contact').scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => {
        if (saved.cookieOnly) {
          document.getElementById('displayRef').textContent = saved.ref;
          document.getElementById('confirmDetails').innerHTML = `
            <div class="cdetail"><span>Reference</span><strong>${saved.ref}</strong></div>
            <div class="cdetail"><span>Note</span><strong>Full details were in your confirmation email</strong></div>
          `;
        } else {
          showConfirmation(saved);
        }
        document.getElementById('quoteForm').style.display = 'none';
        document.getElementById('confirmationPanel').style.display = 'flex';
      }, 600);
    };

    window.dismissBanner = () => {
      const banner = document.getElementById('returningBanner');
      if (banner) {
        banner.style.opacity = '0';
        setTimeout(() => banner.style.display = 'none', 300);
      }
    };

    /* ══════════════════════════════
       WEIGHT UNIT TOGGLE
    ══════════════════════════════ */
    let currentWeightUnit = 'lbs';

    window.setWeightUnit = (unit) => {
      currentWeightUnit = unit;
      document.getElementById('unit-lbs').classList.toggle('active', unit === 'lbs');
      document.getElementById('unit-kg').classList.toggle('active',  unit === 'kg');
      const input = document.getElementById('f-weight');
      const val   = parseFloat(input.value);
      if (!isNaN(val) && val > 0) {
        input.value = unit === 'kg'
          ? parseFloat((val / 2.20462).toFixed(2))
          : parseFloat((val * 2.20462).toFixed(2));
      }
      syncWeightConversion();
    };

    window.syncWeightConversion = () => {
      const val  = parseFloat(document.getElementById('f-weight').value);
      const span = document.getElementById('weight-converted');
      if (!span) return;
      if (isNaN(val) || val <= 0) { span.textContent = ''; return; }
      span.textContent = currentWeightUnit === 'lbs'
        ? '\u2248 ' + (val / 2.20462).toFixed(2) + ' kg'
        : '\u2248 ' + (val * 2.20462).toFixed(2) + ' lbs';
    };

    /* ══════════════════════════════
       CONTACT FORM
    ══════════════════════════════ */
    function initContact() {
      // Clear errors on input
      document.addEventListener('input', (e) => {
        if (e.target.closest('#quoteForm')) {
          e.target.classList.remove('input-error');
          const err = e.target.parentNode.querySelector('.field-error');
          if (err) err.remove();
          const note = document.getElementById('formNote');
          if (note) note.textContent = '';
        }
      });
      document.addEventListener('change', (e) => {
        if (e.target.closest('#quoteForm')) {
          e.target.classList.remove('input-error');
          const err = e.target.parentNode.querySelector('.field-error');
          if (err) err.remove();
        }
      });
    }

    function generateRef() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let ref = 'CPARS-';
      for (let i = 0; i < 8; i++) ref += chars[Math.floor(Math.random() * chars.length)];
      return ref;
    }

    function showConfirmation(data, trackingNumber) {
      document.getElementById('displayRef').textContent = data.ref;
      if (trackingNumber) {
        document.getElementById('displayTracking').textContent = trackingNumber;
        document.getElementById('trackingBox').style.display = 'flex';
      }
      document.getElementById('confirmDetails').innerHTML = `
        <div class="cdetail"><span>Name</span><strong>${data.name || '—'}</strong></div>
        <div class="cdetail"><span>Email</span><strong>${data.email || '—'}</strong></div>
        <div class="cdetail"><span>Phone</span><strong>${data.phone || '—'}</strong></div>
        <div class="cdetail"><span>Service</span><strong>${data.service || '—'}</strong></div>
        <div class="cdetail"><span>Pickup</span><strong>${data.originFull || data.origin || '—'}</strong></div>
        <div class="cdetail"><span>Destination</span><strong>${data.destFull || data.destination || '—'}</strong></div>
        <div class="cdetail"><span>Weight</span><strong>${data.weightDisplay || (data.weight + ' lbs') || '—'}</strong></div>
        <div class="cdetail"><span>Carrier</span><strong>${data.carrier || '—'}</strong></div>
        <div class="cdetail"><span>Amount Paid</span><strong>$${data.amount ? data.amount.toFixed(2) : '—'}</strong></div>
        <div class="cdetail"><span>Submitted</span><strong>${data.submittedAt || '—'}</strong></div>
      `;
    }

    /* ══════════════════════════════
       CONFIG + INIT
    ══════════════════════════════ */
    let stripe, EMAILJS_SERVICE, EMAILJS_CLIENT_TPL, EMAILJS_OWNER_TPL;
    let stripeElements, stripeCardElement, selectedRate = null, currentRef = null, currentFormData = null;

    async function initServices() {
      try {
        const res  = await fetch('/.netlify/functions/config');
        const cfg  = await res.json();
        emailjs.init(cfg.emailjsPublicKey);
        EMAILJS_SERVICE    = cfg.emailjsServiceId;
        EMAILJS_CLIENT_TPL = cfg.emailjsClientTemplate;
        EMAILJS_OWNER_TPL  = cfg.emailjsOwnerTemplate;
        // Load Stripe.js dynamically to avoid SSL polling errors on localhost
        await new Promise((resolve, reject) => {
          if (window.Stripe) { stripe = Stripe(cfg.stripeKey); return resolve(); }
          const s = document.createElement('script');
          s.src = 'https://js.stripe.com/v3/';
          s.onload = () => { stripe = Stripe(cfg.stripeKey); resolve(); };
          s.onerror = reject;
          document.head.appendChild(s);
        });
      } catch(e) {
        console.error('Config load failed', e);
      }
    }
    initServices();

    // Payment recovery — handle ?recover=REF&email=EMAIL&amount=AMOUNT in URL
    (function checkRecovery() {
      const params = new URLSearchParams(window.location.search);
      const ref    = params.get('recover');
      const email  = params.get('email');
      const amount = params.get('amount');
      if (!ref || !email) return;
      // Wait for sections to load then show recovery confirmation
      setTimeout(() => {
        const contact = document.getElementById('contact');
        if (contact) contact.scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => {
          document.getElementById('quoteForm').style.display        = 'none';
          document.getElementById('quotesPanel').style.display      = 'none';
          document.getElementById('paymentPanel').style.display     = 'none';
          document.getElementById('confirmationPanel').style.display = 'flex';
          document.getElementById('displayRef').textContent = ref;
          document.getElementById('confirmDetails').innerHTML = `
            <div class="cdetail"><span>Reference</span><strong>${ref}</strong></div>
            <div class="cdetail"><span>Email</span><strong>${email}</strong></div>
            <div class="cdetail"><span>Amount Paid</span><strong>${amount || 'On file'}</strong></div>
            <div class="cdetail"><span>Status</span><strong style="color:#16a34a">✅ Payment Confirmed</strong></div>
            <div class="cdetail"><span>Booking</span><strong>Being arranged — tracking number will be emailed to you within 1 hour</strong></div>
          `;
          // Clean URL without reloading
          window.history.replaceState({}, '', '/');
        }, 800);
      }, 1500);
    })();

    /* ══════════════════════════════
       STEP 1 — FETCH QUOTES
    ══════════════════════════════ */
    window.fetchQuotes = async (e) => {
      e.preventDefault();
      const btn  = document.getElementById('submitBtn');
      const note = document.getElementById('formNote');

      const fields = [
        { id: 'f-name',         label: 'Full Name' },
        { id: 'f-email',        label: 'Email Address' },
        { id: 'f-phone',        label: 'Phone Number' },
        { id: 'f-service',      label: 'Service Type' },
        { id: 'f-origin-street',label: 'Pickup Street Address' },
        { id: 'f-origin-city',  label: 'Pickup City, State' },
        { id: 'f-origin',       label: 'Pickup ZIP Code' },
        { id: 'f-dest-street',  label: 'Destination Street Address' },
        { id: 'f-dest-city',    label: 'Destination City, State' },
        { id: 'f-destination',  label: 'Destination ZIP Code' },
        { id: 'f-weight',       label: 'Cargo Weight' },
        { id: 'f-message',      label: 'Shipment Details' },
      ];

      document.querySelectorAll('.field-error').forEach(el => el.remove());
      document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));

      let hasError = false;
      fields.forEach(({ id, label }) => {
        const el = document.getElementById(id);
        if (!el || !el.value.trim()) {
          if (el) el.classList.add('input-error');
          const err = document.createElement('p');
          err.className = 'field-error';
          err.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${label} is required`;
          if (el) el.parentNode.appendChild(err);
          if (!hasError && el) { el.focus(); hasError = true; }
        }
      });

      const emailEl = document.getElementById('f-email');
      if (emailEl && emailEl.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value)) {
        emailEl.classList.add('input-error');
        if (!emailEl.parentNode.querySelector('.field-error')) {
          const err = document.createElement('p');
          err.className = 'field-error';
          err.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Please enter a valid email address';
          emailEl.parentNode.appendChild(err);
        }
        hasError = true;
      }

      if (hasError) {
        note.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Please fill in all required fields above.';
        note.style.color = '#dc2626';
        return false;
      }

      const parseState = (cityState) => { const m = cityState.match(/,\s*([A-Za-z]{2})\s*$/); return m ? m[1].toUpperCase() : ''; };
      const stripState = (cityState) => cityState.replace(/,\s*[A-Za-z]{2}\s*$/, '').trim();

      const rawOriginCity = document.getElementById('f-origin-city').value.trim();
      const rawDestCity   = document.getElementById('f-dest-city').value.trim();

      currentFormData = {
        name:           document.getElementById('f-name').value.trim(),
        email:          document.getElementById('f-email').value.trim(),
        phone:          document.getElementById('f-phone').value.trim(),
        service:        document.getElementById('f-service').value,
        originStreet:   document.getElementById('f-origin-street').value.trim(),
        originApt:      document.getElementById('f-origin-apt').value.trim(),
        originCity:     rawOriginCity,
        originCityOnly: stripState(rawOriginCity),
        originState:    parseState(rawOriginCity),
        origin:         document.getElementById('f-origin').value.trim(),
        destStreet:     document.getElementById('f-dest-street').value.trim(),
        destApt:        document.getElementById('f-dest-apt').value.trim(),
        destCity:       rawDestCity,
        destCityOnly:   stripState(rawDestCity),
        destState:      parseState(rawDestCity),
        destination:    document.getElementById('f-destination').value.trim(),
        weightRaw:      document.getElementById('f-weight').value.trim(),
        weightUnit:     currentWeightUnit,
        weight:         currentWeightUnit === 'kg'
          ? String(parseFloat((parseFloat(document.getElementById('f-weight').value) * 2.20462).toFixed(2)))
          : document.getElementById('f-weight').value.trim(),
        pieces:         document.getElementById('f-pieces').value.trim() || '1',
        message:        document.getElementById('f-message').value.trim(),
      };

      // Build full address strings for display
      currentFormData.originFull   = [currentFormData.originStreet, currentFormData.originApt, currentFormData.originCity, currentFormData.origin].filter(Boolean).join(', ');
      currentFormData.destFull     = [currentFormData.destStreet,   currentFormData.destApt,   currentFormData.destCity,   currentFormData.destination].filter(Boolean).join(', ');
      const wRaw = parseFloat(currentFormData.weightRaw);
      currentFormData.weightDisplay = currentFormData.weightUnit === 'kg'
        ? wRaw + ' kg (' + currentFormData.weight + ' lbs)'
        : currentFormData.weight + ' lbs (' + (parseFloat(currentFormData.weight)/2.20462).toFixed(2) + ' kg)';

      currentRef = generateRef();

      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Fetching Live Rates...';
      note.textContent = '';

      try {
        const res = await fetch('/.netlify/functions/get-rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            weight:          currentFormData.weightRaw,
            weight_unit:     currentFormData.weightUnit,
            origin_zip:      currentFormData.origin,
            origin_street:   currentFormData.originStreet,
            origin_city:     currentFormData.originCityOnly,
            origin_state:    currentFormData.originState,
            destination_zip: currentFormData.destination,
            dest_street:     currentFormData.destStreet,
            dest_city:       currentFormData.destCityOnly,
            dest_state:      currentFormData.destState,
            service_type:    currentFormData.service
          })
        });

        const data = await res.json();

        if (data.rates && data.rates.length > 0) {
          showQuotes(data.rates);
        } else {
          // Fallback to estimated quotes if no live rates
          showEstimatedQuotes();
        }
      } catch {
        showEstimatedQuotes();
      }

      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-magnifying-glass-dollar"></i> Get Instant Quotes';
      return false;
    };

    function showEstimatedQuotes() {
      // Fallback rate estimator based on ZIP distance approximation
      const origin = parseInt(currentFormData.origin) || 77090;
      const dest   = parseInt(currentFormData.destination) || 75201;
      const weight = parseFloat(currentFormData.weight) || 500;
      const zipDiff = Math.abs(origin - dest);
      const estMiles = Math.max(50, Math.min(zipDiff * 0.8, 2000));

      const rateMap = {
        'Full Truckload (FTL)':       3.50,
        'Less Than Truckload (LTL)':  2.50,
        'Hotshot & Expedited':        4.50,
        'Dry Van Transport':          3.00,
        'Hazmat Transport':           5.00,
        'Local & Regional Hauling':   2.80,
        'Freight Coordination':       2.60,
      };

      const ratePerMile = rateMap[currentFormData.service] || 3.00;
      const basePrice   = estMiles * ratePerMile;
      const weightAdj   = weight > 1000 ? (weight / 1000) * 50 : 0;

      const rates = [
        { carrier: 'CPARS Standard',   service: currentFormData.service, delivery_days: '3-5', cpars_price: parseFloat((basePrice + weightAdj).toFixed(2)),        rate_id: 'est-standard', estimated: true },
        { carrier: 'CPARS Express',    service: currentFormData.service, delivery_days: '1-2', cpars_price: parseFloat(((basePrice + weightAdj) * 1.35).toFixed(2)), rate_id: 'est-express',  estimated: true },
        { carrier: 'CPARS Economy',    service: currentFormData.service, delivery_days: '5-7', cpars_price: parseFloat(((basePrice + weightAdj) * 0.85).toFixed(2)), rate_id: 'est-economy',  estimated: true },
      ];

      showQuotes(rates);
    }

    /* Carrier logo map — real brand logos via Wikipedia SVG CDN */
    const CARRIER_LOGOS = {
      ups:            { src: 'https://upload.wikimedia.org/wikipedia/commons/1/1b/UPS_Logo_Shield_2017.svg',           bg: '#301506' },
      fedex_walleted: { src: 'https://upload.wikimedia.org/wikipedia/commons/b/b9/FedEx_Corporation_-_2016_Logo.svg', bg: '#4d148c' },
      stamps_com:     { src: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/usps.svg', bg: '#004b87' },
      globalpost:     { src: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/usps.svg', bg: '#004b87' },
    };

    function showQuotes(rates) {
      const list   = document.getElementById('quotesList');
      const weight = parseFloat(currentFormData.weight) || 0;

      const weightAlert = weight > 150
        ? `<div class="weight-alert"><i class="fa-solid fa-triangle-exclamation"></i><span>Your cargo weight (${weight} lbs) exceeds parcel carrier limits (150 lbs max per package). Showing estimated freight rates — a CPARS team member will confirm the final price within the hour.</span></div>`
        : '';

      list.innerHTML = weightAlert + rates.map((r, i) => {
        const tags      = r.tags || [];
        const isBest    = tags.includes('best_value') || tags.includes('cheapest');
        const isFastest = tags.includes('fastest') && !isBest;
        const badge     = isBest    ? '<span class="quote-badge badge-best"><i class="fa-solid fa-star"></i> Best Value</span>'
                        : isFastest ? '<span class="quote-badge badge-fast"><i class="fa-solid fa-bolt"></i> Fastest</span>' : '';

        const logo    = CARRIER_LOGOS[r.carrier_code];
        const logoHtml = logo
          ? `<div class="quote-logo-box" style="background:${logo.bg}">
               <img src="${logo.src}" alt="${r.carrier}"
                 onerror="this.parentElement.innerHTML='<i class=\'fa-solid fa-truck\' style=\'font-size:1.4rem;color:#fff\'></i>'"/>
             </div>`
          : `<div class="quote-logo-box" style="background:#1a56db">
               <i class="fa-solid fa-truck" style="font-size:1.4rem;color:#fff"></i>
             </div>`;

        const deliveryLabel = r.delivery_label || (r.delivery_days ? `${r.delivery_days} business day(s)` : 'Contact for ETA');

        const tagHtml = [
          `<span class="qtag qtag-delivery"><i class="fa-solid fa-clock"></i> ${deliveryLabel}</span>`,
          r.guaranteed ? `<span class="qtag qtag-guaranteed"><i class="fa-solid fa-shield-halved"></i> Guaranteed</span>` : '',
          r.trackable  ? `<span class="qtag qtag-trackable"><i class="fa-solid fa-location-dot"></i> Trackable</span>` : '',
          r.estimated  ? `<span class="qtag qtag-estimated"><i class="fa-solid fa-circle-info"></i> Estimated</span>` : ''
        ].filter(Boolean).join('');

        return `
          <div class="quote-card ${isBest ? 'quote-best' : ''}" onclick="selectQuote(${i})" id="quote-${i}">
            ${badge}
            <div class="quote-logo-box">${logoHtml}</div>
            <div class="quote-carrier-info">
              <strong>${r.carrier}</strong>
              <span>${r.service}</span>
            </div>
            <div class="quote-price">$${r.cpars_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            <div class="quote-tags">${tagHtml}</div>
            <button class="btn-primary quote-select-btn">Select This Rate <i class="fa-solid fa-arrow-right"></i></button>
          </div>
        `;
      }).join('');

      window._currentRates = rates;
      document.getElementById('quoteForm').style.display   = 'none';
      document.getElementById('quotesPanel').style.display = 'block';
      document.getElementById('quotesPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    window.selectQuote = (index) => {
      selectedRate = window._currentRates[index];
      document.querySelectorAll('.quote-card').forEach(c => c.classList.remove('quote-selected'));
      document.getElementById(`quote-${index}`).classList.add('quote-selected');
      setTimeout(() => showPaymentPanel(), 300);
    };

    window.backToForm = () => {
      document.getElementById('quotesPanel').style.display = 'none';
      document.getElementById('quoteForm').style.display   = 'flex';
    };

    window.backToQuotes = () => {
      document.getElementById('paymentPanel').style.display = 'none';
      document.getElementById('quotesPanel').style.display  = 'block';
    };

    /* ══════════════════════════════
       STEP 2 — PAYMENT
    ══════════════════════════════ */
    function showPaymentPanel() {
      if (!stripe) {
        alert('Payment system is still loading. Please wait a moment and try again.');
        return;
      }
      document.getElementById('quotesPanel').style.display  = 'none';
      document.getElementById('paymentPanel').style.display = 'block';

      document.getElementById('paymentSummary').innerHTML = `
        <div class="cdetail"><span>Carrier</span><strong>${selectedRate.carrier}</strong></div>
        <div class="cdetail"><span>Service</span><strong>${selectedRate.service}</strong></div>
        <div class="cdetail"><span>Delivery</span><strong>${selectedRate.delivery_label || selectedRate.delivery_days + ' business days'}</strong></div>
        <div class="cdetail"><span>From</span><strong>${currentFormData.originFull}</strong></div>
        <div class="cdetail"><span>To</span><strong>${currentFormData.destFull}</strong></div>
        <div class="cdetail"><span>Weight</span><strong>${currentFormData.weightDisplay || currentFormData.weight + ' lbs'}</strong></div>
        <div class="cdetail total-row"><span>Total</span><strong>$${selectedRate.cpars_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></div>
      `;

      stripeElements   = stripe.elements();
      stripeCardElement = stripeElements.create('card', {
        style: {
          base: { fontSize: '16px', color: '#1e293b', '::placeholder': { color: '#94a3b8' } }
        }
      });
      stripeCardElement.mount('#stripe-card-element');
      stripeCardElement.on('change', (e) => {
        document.getElementById('card-errors').textContent = e.error ? e.error.message : '';
      });

      document.getElementById('paymentPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function showPaymentError(msg) {
      document.getElementById('card-errors').textContent = msg || 'Something went wrong. Please try again.';
      const payBtn = document.getElementById('payBtn');
      payBtn.disabled = false;
      payBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Pay & Book Shipment';
    }

    window.processPayment = async () => {
      const payBtn = document.getElementById('payBtn');

      // Guard: stripe must be loaded
      if (!stripe) {
        showPaymentError('Payment system not ready. Please refresh the page and try again.');
        return;
      }

      payBtn.disabled = true;
      payBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing Payment...';
      document.getElementById('card-errors').textContent = '';

      try {
        // STEP 1 — Create PaymentIntent server-side
        let intentData;
        try {
          const intentRes = await fetch('/.netlify/functions/create-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount:              selectedRate.cpars_price,
              rate_id:             selectedRate.rate_id,
              customer_email:      currentFormData.email,
              ref:                 currentRef,
              carrier:             selectedRate.carrier,
              service:             selectedRate.service,
              weight_declared:     currentFormData.weightRaw,
              weight_unit:         currentFormData.weightUnit,
              weight_buffered_lbs: currentFormData.weight,
              name:                currentFormData.name,
              phone:               currentFormData.phone,
              origin:              currentFormData.originFull,
              destination:         currentFormData.destFull,
              origin_zip:          currentFormData.origin,
              destination_zip:     currentFormData.destination
            })
          });
          intentData = await intentRes.json();
        } catch {
          showPaymentError('Network error. Please check your connection and try again.');
          return;
        }

        if (!intentData.client_secret) {
          showPaymentError(intentData.error || 'Payment setup failed. Please try again.');
          return;
        }

        // STEP 2 — Confirm card with Stripe
        payBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Confirming Payment...';
        const { error, paymentIntent } = await stripe.confirmCardPayment(intentData.client_secret, {
          payment_method: {
            card: stripeCardElement,
            billing_details: {
              name:  currentFormData.name,
              email: currentFormData.email,
              phone: currentFormData.phone
            }
          }
        });

        if (error) {
          // Notify owner silently of failed/cancelled payment
          emailjs.send(EMAILJS_SERVICE, EMAILJS_OWNER_TPL, {
            name:             currentFormData.name,
            email:            currentFormData.email,
            phone:            currentFormData.phone,
            reference_number: currentRef,
            service:          currentFormData.service,
            origin:           currentFormData.originFull,
            destination:      currentFormData.destFull,
            message:          'PAYMENT FAILED: ' + error.message,
            submitted_at:     new Date().toLocaleString(),
            carrier:          selectedRate.carrier,
            amount:           '$' + selectedRate.cpars_price.toFixed(2),
            tracking_number:  'N/A',
            status:           'FAILED'
          }).catch(() => {});
          showPaymentError(error.message);
          return;
        }

        // STEP 3 — Handle 3D Secure / requires_action
        if (paymentIntent.status === 'requires_action') {
          showPaymentError('Your bank requires additional verification. Please complete the authentication and try again.');
          return;
        }

        if (paymentIntent.status !== 'succeeded') {
          showPaymentError('Payment was not completed. Status: ' + paymentIntent.status + '. Please try again.');
          return;
        }

        // STEP 4 — Book shipment via ShipStation
        payBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Booking Shipment...';
        let trackingNumber = null;
        let bookingFailed  = false;

        if (!selectedRate.estimated) {
          try {
            // Re-fetch a fresh rate if the original may have expired (ShipStation rates expire ~5 min)
            let freshRateId = selectedRate.rate_id;
            try {
              const freshRes  = await fetch('/.netlify/functions/get-rates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  weight:          currentFormData.weightRaw,
                  weight_unit:     currentFormData.weightUnit,
                  origin_zip:      currentFormData.origin,
                  origin_street:   currentFormData.originStreet,
                  origin_city:     currentFormData.originCityOnly,
                  origin_state:    currentFormData.originState,
                  destination_zip: currentFormData.destination,
                  dest_street:     currentFormData.destStreet,
                  dest_city:       currentFormData.destCityOnly,
                  dest_state:      currentFormData.destState,
                  service_type:    currentFormData.service
                })
              });
              const freshData = await freshRes.json();
              if (freshData.rates && freshData.rates.length > 0) {
                // Match same carrier + service code for fresh rate_id
                const match = freshData.rates.find(r =>
                  r.carrier_code === selectedRate.carrier_code &&
                  r.service_code === selectedRate.service_code
                ) || freshData.rates.find(r =>
                  r.carrier === selectedRate.carrier
                );
                if (match && match.rate_id) freshRateId = match.rate_id;
              }
            } catch { /* keep original rate_id if refresh fails */ }

            const bookRes  = await fetch('/.netlify/functions/book-shipment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                rate_id:           freshRateId,
                ref:               currentRef,
                name:              currentFormData.name,
                email:             currentFormData.email,
                phone:             currentFormData.phone,
                origin_zip:        currentFormData.origin,
                origin_street:     currentFormData.originStreet,
                origin_city:       currentFormData.originCityOnly,
                origin_state:      currentFormData.originState,
                destination_zip:   currentFormData.destination,
                dest_street:       currentFormData.destStreet,
                dest_city:         currentFormData.destCityOnly,
                dest_state:        currentFormData.destState,
                weight:            currentFormData.weight,
                message:           currentFormData.message,
                payment_intent_id: intentData.payment_intent_id
              })
            });
            const bookData = await bookRes.json();
            trackingNumber = bookData.tracking_number || null;
            const labelUrl = bookData.label_url || null;
            if (!bookData.success) bookingFailed = true;
          } catch {
            bookingFailed = true;
          }
        }

        // STEP 5 — Send confirmation emails
        payBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending Confirmation...';
        const submittedAt    = new Date().toLocaleString();
        const trackingNote   = trackingNumber || (bookingFailed ? 'Booking error — CPARS will contact you within 1 hour' : 'Will be provided by carrier');
        const ownerBookNote  = trackingNumber || (bookingFailed ? 'BOOKING FAILED AFTER PAYMENT — manual action required' : 'Pending carrier assignment');
        const labelNote      = labelUrl ? labelUrl : null;

        const emailParams = {
          name:             currentFormData.name,
          email:            currentFormData.email,
          reference_number: currentRef,
          service:          currentFormData.service,
          origin:           currentFormData.originFull,
          destination:      currentFormData.destFull,
          submitted_at:     submittedAt,
          carrier:          selectedRate.carrier,
          amount:           '$' + selectedRate.cpars_price.toFixed(2),
          tracking_number:  trackingNote,
          label_url:        labelNote || 'Will be emailed separately',
          status:           'CONFIRMED & PAID'
        };

        try {
          await emailjs.send(EMAILJS_SERVICE, EMAILJS_CLIENT_TPL, emailParams);
        } catch(emailErr) {
          console.warn('Client email failed:', emailErr);
        }

        try {
          await emailjs.send(EMAILJS_SERVICE, EMAILJS_OWNER_TPL, {
            ...emailParams,
            phone:           currentFormData.phone,
            message:         currentFormData.message + (bookingFailed ? '\n\n⚠️ BOOKING FAILED AFTER PAYMENT — manual action required' : ''),
            tracking_number: ownerBookNote,
            status:          bookingFailed ? 'PAID — BOOKING FAILED' : 'CONFIRMED & PAID'
          });
        } catch(emailErr) {
          console.warn('Owner email failed:', emailErr);
        }

        // STEP 6 — Save and show confirmation
        const requestData = {
          ...currentFormData,
          ref:            currentRef,
          submittedAt,
          trackingNumber,
          carrier:        selectedRate.carrier,
          amount:         selectedRate.cpars_price,
          bookingFailed
        };
        saveRequest(requestData);
        showConfirmation(requestData, trackingNumber);

        document.getElementById('paymentPanel').style.display     = 'none';
        document.getElementById('confirmationPanel').style.display = 'flex';
        document.getElementById('confirmationPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
        dismissBanner();

      } catch (err) {
        showPaymentError(err.message || 'An unexpected error occurred. Please try again or call us at +1 (352) 213-8976.');
      }
    };

    /* ══════════════════════════════
       QUOTE FILTER
    ══════════════════════════════ */
    window.filterQuotes = (type, btn) => {
      document.querySelectorAll('.qfilter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cards = document.querySelectorAll('.quote-card');
      const rates = window._currentRates || [];
      cards.forEach((card, i) => {
        const r = rates[i];
        if (!r) return;
        const days = parseInt(r.delivery_days) || 99;
        let show = true;
        if (type === '1')       show = days <= 1;
        else if (type === '2')  show = days <= 2;
        else if (type === '3')  show = days <= 3;
        else if (type === 'economy') show = days >= 4 || r.estimated;
        card.style.display = show ? '' : 'none';
      });
      const visible = [...cards].filter(c => c.style.display !== 'none');
      const noRes   = document.getElementById('quotesNoResult');
      if (noRes) noRes.remove();
      if (visible.length === 0) {
        const msg = document.createElement('p');
        msg.id = 'quotesNoResult';
        msg.style.cssText = 'text-align:center;color:#64748b;padding:20px;font-size:0.9rem;';
        msg.innerHTML = '<i class="fa-solid fa-circle-info"></i> No quotes match this filter. Try another option.';
        document.getElementById('quotesList').appendChild(msg);
      }
    };

    window.copyRef = () => {
      const ref = document.getElementById('displayRef').textContent;
      navigator.clipboard.writeText(ref).then(() => {
        const btn = document.querySelector('.copy-btn');
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
        setTimeout(() => { btn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy'; }, 2000);
      });
    };

    window.copyTracking = () => {
      const tracking = document.getElementById('displayTracking').textContent;
      navigator.clipboard.writeText(tracking).then(() => {
        const btns = document.querySelectorAll('.copy-btn');
        if (btns[1]) {
          btns[1].innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
          setTimeout(() => { btns[1].innerHTML = '<i class="fa-solid fa-copy"></i> Copy'; }, 2000);
        }
      });
    };

    window.resetForm = () => {
      clearRequest();
      selectedRate = null; currentRef = null; currentFormData = null;
      document.getElementById('quoteForm').style.display        = 'flex';
      document.getElementById('quotesPanel').style.display      = 'none';
      document.getElementById('paymentPanel').style.display     = 'none';
      document.getElementById('confirmationPanel').style.display = 'none';
      document.getElementById('quoteForm').reset();
      const btn = document.getElementById('submitBtn');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-magnifying-glass-dollar"></i> Get Instant Quotes';
      document.getElementById('formNote').textContent = '';
    };

    /* ══════════════════════════════
       TRACK ORDER
    ══════════════════════════════ */
    window.toggleTrackPanel = () => {
      const panel      = document.getElementById('trackPanel');
      const queryPanel = document.getElementById('queryPanel');
      const isHidden   = panel.style.display === 'none';
      if (queryPanel) queryPanel.style.display = 'none';
      panel.style.display = isHidden ? 'block' : 'none';
      if (isHidden) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Pre-fill ref from localStorage/cookie if available
        const saved = loadRequest();
        if (saved && saved.ref) {
          document.getElementById('t-ref').value   = saved.ref;
          document.getElementById('t-email').value = saved.email || '';
        }
        // Also check URL params
        const params = new URLSearchParams(window.location.search);
        if (params.get('track')) document.getElementById('t-ref').value   = params.get('track');
        if (params.get('email')) document.getElementById('t-email').value = params.get('email');
      }
    };

    window.lookupOrder = async () => {
      const ref    = document.getElementById('t-ref').value.trim();
      const email  = document.getElementById('t-email').value.trim();
      const btn    = document.getElementById('trackBtn');
      const result = document.getElementById('trackResult');

      if (!ref || !email) {
        result.style.display = 'block';
        result.innerHTML = `<div class="track-error"><i class="fa-solid fa-circle-exclamation"></i><span>Please enter both your reference number and email address.</span></div>`;
        return;
      }

      btn.disabled  = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Looking up...';
      result.style.display = 'none';

      try {
        const res  = await fetch('/.netlify/functions/track-order', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ ref, email })
        });
        const data = await res.json();

        if (!data.found) {
          result.style.display = 'block';
          result.innerHTML = `<div class="track-error"><i class="fa-solid fa-circle-exclamation"></i><span>${data.error || 'Order not found.'}</span></div>`;
          return;
        }

        const trackingRow = data.tracking_number
          ? `<div class="track-detail"><span>Tracking Number</span><strong style="color:#16a34a">${data.tracking_number}</strong></div>`
          : '';

        const receiptLink = data.receipt_url
          ? `<a href="${data.receipt_url}" target="_blank" class="btn-outline-dark" style="font-size:0.85rem;padding:8px 16px;"><i class="fa-solid fa-receipt"></i> View Receipt</a>`
          : '';

        result.style.display = 'block';
        result.innerHTML = `
          <div class="track-status-card">
            <div class="track-status-header">
              <div class="track-status-icon" style="background:${data.statusColor}">
                <i class="fa-solid ${data.statusIcon}"></i>
              </div>
              <div>
                <h4 style="color:${data.statusColor}">${data.statusLabel}</h4>
                <p>${data.statusMessage}</p>
              </div>
            </div>
            <div class="track-details-grid">
              <div class="track-detail"><span>Reference</span><strong>${data.ref}</strong></div>
              <div class="track-detail"><span>Date</span><strong>${data.submittedAt}</strong></div>
              ${data.name && data.name !== '—' ? `<div class="track-detail"><span>Name</span><strong>${data.name}</strong></div>` : ''}
              <div class="track-detail"><span>Amount Paid</span><strong>$${data.amount}</strong></div>
              <div class="track-detail"><span>Carrier</span><strong>${data.carrier}</strong></div>
              <div class="track-detail"><span>Service</span><strong>${data.service}</strong></div>
              ${data.origin && data.origin !== '—' ? `<div class="track-detail"><span>From</span><strong>${data.origin}</strong></div>` : ''}
              ${data.destination && data.destination !== '—' ? `<div class="track-detail"><span>To</span><strong>${data.destination}</strong></div>` : ''}
              <div class="track-detail"><span>Weight</span><strong>${data.weight}</strong></div>
              ${trackingRow}
            </div>
            <div class="track-actions">
              ${receiptLink}
              <a href="tel:+13522138976" class="btn-primary" style="font-size:0.85rem;padding:8px 16px;">
                <i class="fa-solid fa-phone"></i> Call Us
              </a>
              <a href="mailto:cparstransportation@cparstransportationcom.com" class="btn-outline-dark" style="font-size:0.85rem;padding:8px 16px;">
                <i class="fa-solid fa-envelope"></i> Email Us
              </a>
            </div>
          </div>
        `;

      } catch (err) {
        result.style.display = 'block';
        result.innerHTML = `<div class="track-error"><i class="fa-solid fa-circle-exclamation"></i><span>Something went wrong. Please try again or call us at +1 (352) 213-8976.</span></div>`;
      }

      btn.disabled  = false;
      btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Track Order';
    };

    /* ══════════════════════════════
       QUERY / SUPPORT PANEL
    ══════════════════════════════ */
    window.toggleQueryPanel = () => {
      const panel     = document.getElementById('queryPanel');
      const trackPanel = document.getElementById('trackPanel');
      const isHidden  = panel.style.display === 'none';
      if (trackPanel) trackPanel.style.display = 'none';
      panel.style.display = isHidden ? 'block' : 'none';
      if (isHidden) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const saved = loadRequest();
        if (saved) {
          if (saved.name)  document.getElementById('q-name').value  = saved.name;
          if (saved.email) document.getElementById('q-email').value = saved.email;
          if (saved.phone) document.getElementById('q-phone').value = saved.phone;
          if (saved.ref)   document.getElementById('q-ref').value   = saved.ref;
        }
      }
    };

    window.submitQuery = async () => {
      const btn     = document.getElementById('queryBtn');
      const result  = document.getElementById('queryResult');
      const name    = document.getElementById('q-name').value.trim();
      const email   = document.getElementById('q-email').value.trim();
      const message = document.getElementById('q-message').value.trim();

      if (!name || !email || !message) {
        result.style.display = 'block';
        result.innerHTML = '<div class="track-error"><i class="fa-solid fa-circle-exclamation"></i><span>Please fill in your name, email and message.</span></div>';
        return;
      }

      btn.disabled  = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
      result.style.display = 'none';

      try {
        const res  = await fetch('/.netlify/functions/submit-query', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            name,
            email,
            phone:      document.getElementById('q-phone').value.trim(),
            ref:        document.getElementById('q-ref').value.trim(),
            issue_type: document.getElementById('q-type').value,
            message
          })
        });
        const data = await res.json();

        if (data.success) {
          result.style.display = 'block';
          result.innerHTML = `
            <div class="track-status-card" style="border-color:#7c3aed20">
              <div class="track-status-header">
                <div class="track-status-icon" style="background:#7c3aed">
                  <i class="fa-solid fa-circle-check"></i>
                </div>
                <div>
                  <h4 style="color:#7c3aed">Query Submitted!</h4>
                  <p>We received your message and will respond to <strong>${email}</strong> within 2 hours. You can also call <strong>+1 (352) 213-8976</strong>.</p>
                </div>
              </div>
            </div>`;
          ['q-name','q-email','q-phone','q-ref','q-message'].forEach(id => { document.getElementById(id).value = ''; });
          document.getElementById('q-type').value = '';
        } else {
          result.style.display = 'block';
          result.innerHTML = `<div class="track-error"><i class="fa-solid fa-circle-exclamation"></i><span>${data.error || 'Something went wrong. Please try again or call us.'}</span></div>`;
        }
      } catch {
        result.style.display = 'block';
        result.innerHTML = '<div class="track-error"><i class="fa-solid fa-circle-exclamation"></i><span>Network error. Please try again or call +1 (352) 213-8976.</span></div>';
      }

      btn.disabled  = false;
      btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Query';
    };

