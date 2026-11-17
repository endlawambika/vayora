/*
 * Vayora checkout (checkout.html) and order confirmation (order-success.html).
 *
 * Flow: validate details → server creates the order and a Razorpay order (create-order) →
 * Razorpay Checkout collects payment → server verifies the signature and capture (verify-payment) →
 * redirect to order-success.html, which shows the order only if the server says it is paid (get-order).
 * Prices shown here are for display; the server calculates the amount actually charged.
 * Nothing here ever marks an order as paid, and no secret key is used in the browser.
 */
(function () {
  'use strict';
  var doc = document;
  var CFG = (window.VAYORA_CONFIG && window.VAYORA_CONFIG.checkout) || {};
  var API = CFG.apiBase ? String(CFG.apiBase).replace(/\/+$/, '') : '';
  var ATTEMPT_KEY = 'vayora.checkout.attempt';
  var DEMO_KEY = 'vayora.demo.booking';
  // Labelled demo checkout: only while no payment backend is connected. No money is taken.
  var DEMO = !CFG.apiBase && CFG.demoPayments !== false;
  var DELIVERY_DAYS = Math.max(1, parseInt(CFG.deliveryDays, 10) || 7);
  function deliveryDate(from) {
    var d = new Date(from.getTime() + DELIVERY_DAYS * 864e5);
    var parts = {};
    new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
      .formatToParts(d).forEach(function (p) { parts[p.type] = p.value; });
    return parts.weekday + ', ' + parts.day + ' ' + parts.month + ' ' + parts.year; // e.g. Tue, 24 Nov 2026
  }
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };

  var STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
    'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
    'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
    'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];

  function inr(paise) {
    var r = paise / 100;
    var whole = r === Math.round(r);
    return '₹' + r.toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
  }
  function amounts(qty) {
    var unit = Math.round((Number(CFG.unitPriceInr) || 0) * 100);
    var sub = unit * qty;
    var ship = Math.round((Number(CFG.shippingFeeInr) || 0) * 100);
    var tax = Math.round(sub * (Number(CFG.taxRatePercent) || 0) / 100);
    return { unit: unit, subtotal: sub, shipping: ship, tax: tax, total: sub + ship + tax };
  }
  function store(k, v) {
    try { if (v === undefined) return JSON.parse(sessionStorage.getItem(k) || 'null'); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; }
  }
  function randomKey() {
    if (window.crypto && crypto.getRandomValues) {
      var a = new Uint8Array(16); crypto.getRandomValues(a);
      return 'co_' + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    }
    return 'co_' + Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
  function api(path, opts) {
    return fetch(API + '/' + path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) { return { status: res.status, body: body }; });
    });
  }
  function successUrl(base, orderId, token) {
    var q = '?order=' + encodeURIComponent(orderId) + '&token=' + encodeURIComponent(token);
    return base.charAt(0) === '#' ? location.pathname + q + base : base + q; // preview uses #routes
  }

  // ================================================================ checkout page
  var root = $('[data-checkout]');
  if (root) {
    var form = $('[data-checkout-form]', root);
    var main = $('[data-checkout-main]', root);
    var failedBox = $('[data-pay-failed]', root);
    var pendingBox = $('[data-pay-pending]', root);
    var payBtn = $('[data-pay]', root);
    var payLabel = $('[data-pay-label]', root);
    var payAmount = $('[data-pay-amount]', root);
    var payStatus = $('[data-pay-status]', root);
    var qtyInput = $('[data-qty]', root);
    var maxQty = Math.max(1, Math.min(20, parseInt(CFG.maxQuantity, 10) || 5));
    var qty = 1;
    var busy = false;

    // states list
    var sel = $('[data-states]', root);
    STATES.forEach(function (s) { var o = doc.createElement('option'); o.value = o.textContent = s; sel.appendChild(o); });
    qtyInput.max = String(maxQty);
    if (CFG.productName) $('[data-os-name]', root).textContent = CFG.productName;

    // ---- order summary
    function render() {
      var a = amounts(qty);
      $('[data-os-unit]', root).textContent = inr(a.unit);
      $('[data-os-subtotal]', root).textContent = inr(a.subtotal);
      var shipEl = $('[data-os-shipping]', root);
      if (a.shipping) shipEl.textContent = inr(a.shipping);
      else shipEl.innerHTML = '<span class="free-tag">FREE</span>';
      $('[data-free-ship]', root).hidden = a.shipping > 0;
      $$('[data-delivery-days]', root).forEach(function (el) { el.textContent = DELIVERY_DAYS; });
      renderEmi(a.total);
      var taxRow = $('[data-os-tax-row]', root);
      taxRow.hidden = !(a.tax > 0);
      if (a.tax > 0) {
        $('[data-os-tax]', root).textContent = inr(a.tax);
        $('[data-os-tax-label]', root).textContent = CFG.taxRatePercent ? 'Taxes (' + CFG.taxRatePercent + '%)' : 'Taxes';
      }
      $('[data-os-total]', root).textContent = inr(a.total);
      payAmount.textContent = inr(a.total);
      qtyInput.value = String(qty);
      $('[data-qty-minus]', root).disabled = qty <= 1 || busy;
      $('[data-qty-plus]', root).disabled = qty >= maxQty || busy;
      $('[data-qty-note]', root).textContent = qty >= maxQty ? 'Maximum ' + maxQty + ' per order.' : '';
    }
    // ---- EMI (offered inside Razorpay's window; amounts here are before bank interest)
    var EMI = CFG.emi || {};
    var tenures = (EMI.tenures || []).map(function (t) { return parseInt(t, 10); })
      .filter(function (t) { return t > 1 && t <= 60; }).sort(function (x, y) { return x - y; });
    var emiOn = EMI.enabled !== false && tenures.length > 0;
    var plan = 'full';
    function perMonth(totalPaise, months) { return Math.ceil(totalPaise / 100 / months) * 100; }
    function renderEmi(total) {
      $('[data-plan-full]', root).textContent = inr(total);
      $$('[data-emi-option], [data-os-emi]', root).forEach(function (el) { el.hidden = !emiOn; });
      if (!emiOn) return;
      var from = inr(perMonth(total, tenures[tenures.length - 1]));
      $$('[data-emi-from]', root).forEach(function (el) { el.textContent = from; });
      $('[data-emi-total]', root).textContent = inr(total);
      var body = $('[data-emi-rows]', root);
      body.textContent = '';
      $$('[data-emi-select]', root).forEach(function (selEl) {
        var keep = selEl.value || String(tenures[Math.min(1, tenures.length - 1)]);
        selEl.textContent = '';
        tenures.forEach(function (m) {
          var op = doc.createElement('option');
          op.value = String(m);
          op.textContent = m + ' months · ' + inr(perMonth(total, m)) + ' a month before interest';
          selEl.appendChild(op);
        });
        selEl.value = keep;
      });
      tenures.forEach(function (m) {
        var tr = doc.createElement('tr');
        var th = doc.createElement('th'); th.scope = 'row'; th.textContent = m + ' months';
        var td = doc.createElement('td'); td.textContent = inr(perMonth(total, m)) + ' a month';
        tr.appendChild(th); tr.appendChild(td); body.appendChild(tr);
      });
    }
    function setPlan(v) {
      plan = v === 'emi' && emiOn ? 'emi' : 'full';
      $('[data-emi-panel]', root).hidden = plan !== 'emi';
      $('[data-full-methods]', root).hidden = plan === 'emi' || DEMO;
      if (DEMO) {
        // EMI runs on cards, so UPI and net banking step aside while EMI is chosen
        ['upi', 'netbanking'].forEach(function (k) { $('[data-pm-tab="' + k + '"]', root).hidden = plan === 'emi'; });
        $$('[data-emi-pick]', root).forEach(function (el) { el.hidden = plan !== 'emi'; });
        if (plan === 'emi' && (method === 'upi' || method === 'netbanking')) selectMethod('credit', false);
      }
    }
    // ---- demo payment methods (sample details only; the inputs are read-only)
    var method = 'upi';
    var tabs = $$('[data-pm-tab]', root);
    function selectMethod(k, focus) {
      method = k;
      tabs.forEach(function (t) {
        var on = t.getAttribute('data-pm-tab') === k;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        if (on && focus) t.focus();
      });
      $$('[data-pm-panel]', root).forEach(function (pnl) { pnl.hidden = pnl.getAttribute('data-pm-panel') !== k; });
    }
    tabs.forEach(function (t) {
      t.addEventListener('click', function () { selectMethod(t.getAttribute('data-pm-tab'), false); });
      t.addEventListener('keydown', function (e) {
        var vis = tabs.filter(function (x) { return !x.hidden; });
        var i = vis.indexOf(t);
        var j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? vis.length - 1 : null;
        if (j === null) return;
        e.preventDefault();
        j = (j + vis.length) % vis.length;
        selectMethod(vis[j].getAttribute('data-pm-tab'), true);
      });
    });
    if (DEMO) {
      $$('[data-demo-only]', root).forEach(function (el) { el.hidden = false; });
      $$('[data-real-only]', root).forEach(function (el) { el.hidden = true; });
      $('[data-full-methods]', root).hidden = true;
      var nameIn = form.elements.name;
      var syncCardName = function () {
        var v = nameIn.value.trim() || 'Demo Customer';
        $$('[data-demo-cardname]', root).forEach(function (el) { el.textContent = v.toUpperCase(); });
        $$('[data-demo-cardname-input]', root).forEach(function (el) { el.value = v; });
      };
      nameIn.addEventListener('input', syncCardName);
      syncCardName();
    }
    $$('[data-pay-plan]', root).forEach(function (r) {
      r.addEventListener('change', function () { if (r.checked) setPlan(r.value); });
    });

    function setQty(n) {
      n = parseInt(n, 10);
      if (!isFinite(n)) n = 1;
      qty = Math.max(1, Math.min(maxQty, n));
      render();
    }
    $('[data-qty-minus]', root).addEventListener('click', function () { setQty(qty - 1); });
    $('[data-qty-plus]', root).addEventListener('click', function () { setQty(qty + 1); });
    qtyInput.addEventListener('change', function () { setQty(qtyInput.value); });
    render();

    // ---- validation (the server repeats every check)
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    function mobileDigits(v) {
      var d = String(v || '').replace(/[\s\-()]/g, '');
      if (d.indexOf('+91') === 0) d = d.slice(3);
      else if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
      else if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
      return /^[6-9][0-9]{9}$/.test(d) ? d : '';
    }
    var RULES = {
      name: function (v) { v = v.trim(); return v.length < 2 || !/[A-Za-zÀ-ɏऀ-ॿ]/.test(v) ? 'Enter your full name.' : ''; },
      email: function (v) { return EMAIL_RE.test(v.trim()) ? '' : 'Enter a valid email address, like name@example.com.'; },
      mobile: function (v) { return mobileDigits(v) ? '' : 'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9.'; },
      house: function (v) { return v.trim() ? '' : 'Enter your house or flat number.'; },
      street: function (v) { return v.trim().length >= 3 ? '' : 'Enter your street or locality.'; },
      city: function (v) { return v.trim().length >= 2 ? '' : 'Enter your city.'; },
      state: function (v) { return STATES.indexOf(v) !== -1 ? '' : 'Choose your state.'; },
      pinCode: function (v) { return /^[1-9][0-9]{5}$/.test(v.replace(/\s/g, '')) ? '' : 'Enter a valid 6-digit PIN code.'; },
      country: function (v) { return v === 'India' ? '' : 'We currently deliver within India.'; },
    };
    var NAMES = Object.keys(RULES);
    var submitted = false;
    function ctl(n) { return form.elements[n]; }
    function errEl(n) { var ids = (ctl(n).getAttribute('aria-describedby') || '').split(' '); return doc.getElementById(ids[ids.length - 1]); }
    function showError(n, msg) {
      var e = errEl(n); if (e) e.textContent = msg;
      ctl(n).setAttribute('aria-invalid', msg ? 'true' : 'false');
    }
    function validate(n) { var m = RULES[n](ctl(n).value); showError(n, m); return m; }
    NAMES.forEach(function (n) {
      var c = ctl(n);
      c.addEventListener(c.tagName === 'SELECT' ? 'change' : 'blur', function () { if (submitted || c.value) validate(n); });
      c.addEventListener('input', function () { if (c.getAttribute('aria-invalid') === 'true') validate(n); });
    });
    ctl('pinCode').addEventListener('input', function () { var v = ctl('pinCode').value.replace(/\D/g, '').slice(0, 6); if (v !== ctl('pinCode').value) ctl('pinCode').value = v; });

    function customer() {
      return {
        name: ctl('name').value.trim(), email: ctl('email').value.trim(), mobile: mobileDigits(ctl('mobile').value),
        house: ctl('house').value.trim(), street: ctl('street').value.trim(), city: ctl('city').value.trim(),
        state: ctl('state').value, pinCode: ctl('pinCode').value.trim(), country: ctl('country').value,
      };
    }

    // ---- UI states
    function setBusy(on, label) {
      busy = on;
      payBtn.disabled = on;
      payBtn.setAttribute('aria-busy', on ? 'true' : 'false');
      payLabel.textContent = on ? (label || 'Please wait…') : 'PAY NOW / PLACE ORDER';
      NAMES.forEach(function (n) { ctl(n).readOnly = on; });
      $$('[data-pay-plan]', root).forEach(function (r) { r.disabled = on; });
      render();
    }
    function status(msg) { payStatus.textContent = msg || ''; }
    function showOnly(which) {
      main.hidden = which !== 'form';
      failedBox.hidden = which !== 'failed';
      pendingBox.hidden = which !== 'pending';
      var steps = $$('.checkout-steps li', root);
      steps.forEach(function (li, i) { var cur = (which === 'form' ? 0 : 1) === i; li.classList.toggle('is-current', cur); if (cur) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
      var box = which === 'failed' ? failedBox : which === 'pending' ? pendingBox : null;
      if (box) { box.focus(); box.scrollIntoView({ block: 'start' }); }
    }
    function showFailed(reason) {
      $('[data-pay-failed-reason]', root).textContent = reason ? 'Reason: ' + reason : '';
      setBusy(false); status('');
      showOnly('failed');
    }

    // ---- one checkout attempt = one order (same details + quantity reuse the same key)
    function attemptFor(c) {
      var fp = JSON.stringify([c.name, c.email.toLowerCase(), c.mobile, c.house, c.street, c.city, c.state, c.pinCode, c.country, qty]);
      var a = store(ATTEMPT_KEY);
      if (!a || a.fp !== fp) { a = { fp: fp, key: randomKey() }; store(ATTEMPT_KEY, a); }
      return a;
    }

    var rzpLoading = null;
    function loadRazorpay() {
      if (window.Razorpay) return Promise.resolve();
      if (rzpLoading) return rzpLoading;
      rzpLoading = new Promise(function (resolve, reject) {
        var s = doc.createElement('script');
        s.src = CFG.razorpayScript || 'https://checkout.razorpay.com/v1/checkout.js';
        s.async = true;
        s.onload = function () { window.Razorpay ? resolve() : reject(new Error('Razorpay unavailable')); };
        s.onerror = function () { rzpLoading = null; reject(new Error('Razorpay script failed to load')); };
        doc.head.appendChild(s);
      });
      return rzpLoading;
    }

    var current = null; // { orderId, accessToken }
    function recordFailure(kind, reason) {
      if (!current) return;
      api('record-payment-failure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: current.orderId, accessToken: current.accessToken, status: kind, reason: reason || '' }) })
        .catch(function () { /* best effort: the webhook also records failures */ });
    }

    function startPayment() {
      var errors = NAMES.filter(function (n) { return validate(n); });
      var summary = $('[data-form-summary]', form);
      submitted = true;
      if (errors.length) {
        summary.textContent = errors.length === 1 ? 'Please fix 1 field below.' : 'Please fix ' + errors.length + ' fields below.';
        ctl(errors[0]).focus();
        return;
      }
      summary.textContent = '';
      if (!API && DEMO) { if (!busy) runDemo(); return; }
      if (!API) {
        summary.textContent = "Payment isn't available right now, so this order can't be placed yet. No payment has been taken.";
        summary.scrollIntoView({ block: 'center' });
        return;
      }
      if (busy) return;
      var c = customer();
      var attempt = attemptFor(c);
      setBusy(true, 'Creating your order…');
      status('Creating your order…');
      createOrder(c, attempt, true);
    }

    function createOrder(c, attempt, allowRetry) {
      api('create-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer: c, quantity: qty, idempotencyKey: attempt.key }) })
        .then(function (r) {
          var b = r.body || {};
          if (r.status === 200 && b.ok) return proceed(b);
          if (r.status === 409 && allowRetry) { attempt = { fp: attempt.fp, key: randomKey() }; store(ATTEMPT_KEY, attempt); return createOrder(c, attempt, false); }
          setBusy(false); status('');
          var summary = $('[data-form-summary]', form);
          if (r.status === 422 && b.fields) {
            Object.keys(b.fields).forEach(function (n) { if (ctl(n)) showError(n, b.fields[n]); });
            summary.textContent = 'Please check the highlighted fields.';
            var first = Object.keys(b.fields)[0]; if (ctl(first)) ctl(first).focus();
          } else if (r.status === 422 && b.error === 'invalid_quantity') {
            summary.textContent = 'Please choose a quantity between 1 and ' + (b.max || maxQty) + '.';
          } else if (r.status === 503) {
            summary.textContent = "Online payment isn't available right now. No payment has been taken.";
          } else {
            summary.textContent = "We couldn't start the payment. No payment has been taken. Please try again.";
          }
        })
        .catch(function () {
          setBusy(false); status('');
          $('[data-form-summary]', form).textContent = "We couldn't reach the payment service. Check your connection and try again. No payment has been taken.";
        });
    }

    function proceed(b) {
      current = { orderId: b.orderId, accessToken: b.accessToken };
      var a = store(ATTEMPT_KEY) || {}; a.orderId = b.orderId; a.token = b.accessToken; store(ATTEMPT_KEY, a);
      if (b.status === 'paid') { goToSuccess(); return; }
      var s = b.summary || {};
      // If the server's total differs from the display prices, show the server's (it is what Razorpay charges)
      if (s.totalPaise && s.totalPaise !== amounts(qty).total) {
        $('[data-os-total]', root).textContent = s.totalAmount;
        payAmount.textContent = s.totalAmount;
      }
      status('Opening secure payment…');
      setBusy(true, 'Opening secure payment…');
      loadRazorpay().then(function () { openRazorpay(b.razorpay); }, function () {
        setBusy(false); status('');
        $('[data-form-summary]', form).textContent = "The payment window couldn't load. Check your connection and try again. No payment has been taken.";
      });
    }

    function openRazorpay(o) {
      var finished = false;
      var lastFailure = null;
      var logo = root.getAttribute('data-logo');
      if (logo && logo.indexOf('data:') !== 0) { try { logo = new URL(logo, location.href).href; } catch (e) { logo = undefined; } } else { logo = undefined; }
      var rzp = new window.Razorpay({
        key: o.key,
        amount: o.amount,
        currency: o.currency,
        name: 'Vayora',
        description: o.description,
        image: logo,
        order_id: o.orderId,
        prefill: o.prefill,
        notes: o.notes,
        theme: { color: '#0B7A73' },
        config: plan === 'emi' ? {
          display: {
            blocks: {
              emi: {
                name: 'Pay in EMI',
                instruments: [{ method: 'emi' }, { method: 'cardless_emi' }, { method: 'paylater' }],
              },
            },
            sequence: ['block.emi'],
            preferences: { show_default_blocks: true },
          },
        } : undefined,
        handler: function (resp) { finished = true; verify(resp); },
        modal: {
          confirm_close: true,
          ondismiss: function () {
            if (finished) return;
            if (lastFailure) { recordFailure('failed', lastFailure); showFailed(lastFailure); }
            else { recordFailure('cancelled', 'Payment window closed'); showFailed('The payment window was closed before payment was completed.'); }
          },
        },
      });
      rzp.on('payment.failed', function (resp) {
        var e = (resp && resp.error) || {};
        lastFailure = e.description || 'The payment was declined.';
        recordFailure('failed', (e.code ? e.code + ': ' : '') + lastFailure);
      });
      status('Complete the payment in the Razorpay window.');
      setBusy(true, 'Waiting for payment…');
      rzp.open();
    }

    function verify(resp) {
      setBusy(true, 'Confirming your payment…');
      status('Confirming your payment. Please don’t close this page.');
      var body = { orderId: current.orderId, accessToken: current.accessToken, razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature };
      var tries = 0;
      (function attempt() {
        api('verify-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          .then(function (r) {
            if (r.status === 200 && r.body && r.body.ok) return goToSuccess();
            if (r.status >= 500 && tries++ < 2) return setTimeout(attempt, 1500);
            if (r.status === 400 || r.status === 402) { showFailed('The payment could not be verified.'); return; }
            showPending();
          })
          .catch(function () { if (tries++ < 2) setTimeout(attempt, 1500); else showPending(); });
      })();
    }

    function showPending() {
      setBusy(false); status('');
      $('[data-pay-status-link]', root).href = successUrl(root.getAttribute('data-success-url'), current.orderId, current.accessToken);
      showOnly('pending');
    }
    function goToSuccess() {
      var url = successUrl(root.getAttribute('data-success-url'), current.orderId, current.accessToken);
      store(ATTEMPT_KEY, null);
      status('Payment confirmed. Opening your order…');
      location.href = url;
      if (url.indexOf('#') !== -1) setTimeout(function () { location.reload(); }, 50); // preview: same document
    }

    function runDemo() {
      var c = customer();
      var a = amounts(qty);
      var months = plan === 'emi' ? parseInt(($('[data-pm-panel="' + method + '"] [data-emi-select]', root) || {}).value, 10) : 0;
      var bankEl = $('input[name="demoBank"]:checked', root);
      var label = {
        upi: 'UPI (democustomer@upi)',
        credit: 'Credit card ending 1111',
        debit: 'Debit card ending 4444',
        netbanking: 'Net banking, ' + (bankEl ? bankEl.value : 'your bank'),
      }[method];
      if (months) label += ', ' + months + '-month EMI (' + inr(perMonth(a.total, months)) + ' a month before interest)';
      var now = new Date();
      var ymd = now.toISOString().slice(2, 10).replace(/-/g, '');
      var id = 'DEMO-' + ymd + '-' + randomKey().slice(-6).toUpperCase();
      var booking = {
        orderId: id, customerName: c.name, email: c.email,
        productName: CFG.productName || 'Vayora', quantity: qty, totalAmount: inr(a.total), method: label,
        orderDate: now.toISOString(),
        shippingAddress: [c.house, c.street, c.city, c.state + ' ' + c.pinCode, c.country].filter(Boolean).join(', '),
      };
      var overlay = $('[data-demo-progress]');
      var title = $('[data-dp-title]', overlay);
      var sub = $('[data-dp-sub]', overlay);
      setBusy(true, 'Processing demo payment…');
      status('Processing demo payment. No money is being taken.');
      overlay.hidden = false;
      doc.body.classList.add('menu-open');
      title.focus();
      setTimeout(function () {
        $('[data-dp-spinner]', overlay).hidden = true;
        $('[data-dp-tick]', overlay).hidden = false;
        title.textContent = 'Demo payment successful';
        sub.textContent = 'Booking taken. Opening your confirmation…';
        status('Demo payment successful. Booking taken.');
        try { sessionStorage.setItem(DEMO_KEY, JSON.stringify(booking)); } catch (e) { /* shown from memory below */ }
        window.__vayoraDemoBooking = booking;
        setTimeout(function () {
          var base = root.getAttribute('data-success-url');
          var q = '?demo=' + encodeURIComponent(id);
          var url = base.charAt(0) === '#' ? location.pathname + q + base : base + q;
          location.href = url;
          if (url.indexOf('#') !== -1) setTimeout(function () { location.reload(); }, 50);
        }, 1100);
      }, 1600);
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); startPayment(); });
    $('[data-pay-retry]', root).addEventListener('click', function () { showOnly('form'); startPayment(); });
    $('[data-pay-return]', root).addEventListener('click', function () { showOnly('form'); $('.order-summary', root).scrollIntoView({ block: 'start' }); });
  }

  // ================================================================ order confirmation page
  var result = $('[data-order-success]');
  if (result) {
    var params = new URLSearchParams(location.search);
    var orderId = params.get('order') || '';
    var token = params.get('token') || '';
    var show = function (which) {
      ['loading', 'success', 'demo', 'problem'].forEach(function (w) { $('[data-or-' + w + ']', result).hidden = w !== which; });
      if (which !== 'loading') { var el = $('[data-or-' + which + ']', result); el.focus(); }
    };
    var problem = function (title, text, actionLabel) {
      $('[data-or-problem-title]', result).textContent = title;
      $('[data-or-problem-text]', result).textContent = text;
      var act = $('[data-or-problem-action]', result);
      act.textContent = actionLabel || 'Go to checkout';
      show('problem');
    };
    var render = function (o) {
      var date = new Date(o.orderDate);
      var fields = {
        orderId: o.orderId, customerName: o.customerName, email: o.email, productName: o.productName,
        quantity: String(o.quantity), totalAmount: o.totalAmount, paymentStatus: o.paymentStatus,
        orderDate: isNaN(date) ? '' : date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST',
        shippingAddress: o.shippingAddress,
      };
      Object.keys(fields).forEach(function (k) { var el = $('[data-f="' + k + '"]', result); if (el) el.textContent = fields[k]; });
      var succ = $('[data-or-success]', result);
      $('[data-delivery-days]', succ).textContent = DELIVERY_DAYS;
      $('[data-delivery-date]', succ).textContent = isNaN(date) ? '' : deliveryDate(date);
      var msg = {
        sent: 'A confirmation email containing your order details has been sent to your registered email address.',
        pending: 'A confirmation email containing your order details is on its way to ' + o.email + '.',
        failed: 'We couldn’t send the confirmation email to ' + o.email + '. Your order is confirmed; please keep this page, or call ' + (CFG.supportPhone || '9999555555') + ' for a copy.',
        not_configured: 'Please keep this page for your records. For a copy of your order details, call ' + (CFG.supportPhone || '9999555555') + '.',
      }[o.confirmationEmail] || '';
      var em = $('[data-or-email]', result);
      $('span', em).textContent = msg;
      em.hidden = !msg;
      show('success');
    };
    var polls = 0;
    var load = function () {
      api('get-order?id=' + encodeURIComponent(orderId) + '&token=' + encodeURIComponent(token), { method: 'GET' })
        .then(function (r) {
          var b = r.body || {};
          if (r.status === 200 && b.ok && b.confirmed) return render(b.order);
          if (r.status === 200 && b.ok && b.paymentStatus === 'created' && polls++ < 6) return setTimeout(load, 2500);
          if (r.status === 200 && b.ok && (b.paymentStatus === 'failed' || b.paymentStatus === 'cancelled'))
            return problem('Payment Unsuccessful', 'Your payment could not be completed. No successful payment has been recorded for this order. Please try again.', 'Retry Payment');
          if (r.status === 200 && b.ok) return problem('We’re still confirming your payment', 'If your payment went through, this page will show your order within a few minutes. Please don’t pay again; refresh this page shortly.', 'Back to checkout');
          problem('We couldn’t confirm this order', 'This link doesn’t match a confirmed order. If you were charged, call ' + (CFG.supportPhone || '9999555555') + '.');
        })
        .catch(function () {
          problem('We couldn’t load your order', 'Check your connection and refresh this page. Please don’t pay again.', 'Back to checkout');
        });
    };
    var demoId = params.get('demo');
    if (demoId) {
      var bk = null;
      try { bk = JSON.parse(sessionStorage.getItem(DEMO_KEY) || 'null'); } catch (e) { bk = null; }
      if (!DEMO || !bk || bk.orderId !== demoId) {
        problem('No booking to show', 'Place a booking from the checkout page to see its confirmation here.');
      } else {
        var card = $('[data-or-demo]', result);
        var d = new Date(bk.orderDate);
        var vals = {
          orderId: bk.orderId, customerName: bk.customerName, email: bk.email, productName: bk.productName,
          quantity: String(bk.quantity), totalAmount: bk.totalAmount, method: bk.method, shippingAddress: bk.shippingAddress,
          orderDate: d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST',
        };
        Object.keys(vals).forEach(function (k) { var el = $('[data-d="' + k + '"]', card); if (el) el.textContent = vals[k]; });
        $('[data-d-days]', card).textContent = DELIVERY_DAYS;
        $('[data-d-date]', card).textContent = deliveryDate(d);
        show('demo');
      }
    }
    else if (!orderId || !token) problem('No order to show', 'Place an order from the checkout page to see its confirmation here.');
    else if (!API) problem('We couldn’t confirm this order', 'Online payment isn’t switched on for this site yet.');
    else load();
  }
})();
