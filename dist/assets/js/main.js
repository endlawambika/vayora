/*
 * Vayora site behaviour. No dependencies.
 * Sections: helpers · header + mobile menu · waitlist dialog + form · airflow stepper ·
 * exploded diagram · journal index · reveal on scroll · single-file preview router.
 */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  root.classList.add('js');

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isPreview = root.getAttribute('data-mode') === 'preview';

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }

  /* ---------------------------------------------------------------- header + menu */
  var header = $('[data-header]');
  var nav = $('#site-nav');
  var toggle = $('[data-menu-toggle]');

  function onScroll() {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  function setMenu(open) {
    if (!nav || !toggle) return;
    if (open && header) {
      var bottom = Math.max(0, header.getBoundingClientRect().bottom);
      nav.style.top = bottom + 'px';
      nav.style.maxHeight = 'calc(100dvh - ' + bottom + 'px)';
    }
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    doc.body.classList.toggle('menu-open', open);
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a, [data-waitlist], [data-search-open]')) setMenu(false);
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); toggle.focus(); }
    });
    doc.addEventListener('click', function (e) {
      if (nav.classList.contains('is-open') && !e.target.closest('#site-nav, [data-menu-toggle]')) setMenu(false);
    });
    window.addEventListener('resize', function () { if (window.innerWidth > 1100) setMenu(false); });
  }

  /* ---------------------------------------------------------------- waitlist forms
   * Every [data-waitlist-scope] (the dialog body and the inline section on Home) holds one
   * form + one success panel. Each scope gets its own validation state. Errors are found
   * through each control's aria-describedby, so ids only have to be unique per page. */
  var store = window.VayoraWaitlist;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var RULES = {
    name: function (v) {
      v = v.trim();
      if (!v) return 'Enter your name.';
      if (v.length < 2) return 'Your name needs at least 2 characters.';
      if (!/[A-Za-zÀ-ɏऀ-ॿ]/.test(v)) return 'Enter your name using letters.';
      return '';
    },
    email: function (v) {
      v = v.trim();
      if (!v) return 'Enter your email address.';
      if (!EMAIL_RE.test(v)) return 'Enter an email address like name@example.com.';
      if (store && store.has(v)) return 'This email is already on the waitlist in this browser.';
      return '';
    },
  };

  function Waitlist(scope) {
    var form = $('[data-waitlist-form]', scope);
    var success = $('[data-success]', scope);
    if (!form || !success) return null;
    var submitted = false;
    var names = Object.keys(RULES);

    function ctl(n) { return form.elements[n]; }
    function errEl(n) { return doc.getElementById(ctl(n).getAttribute('aria-describedby')); }
    function validate(n) {
      var msg = RULES[n](ctl(n).value);
      var err = errEl(n);
      if (err) err.textContent = msg;
      ctl(n).setAttribute('aria-invalid', msg ? 'true' : 'false');
      return msg;
    }
    function reset() {
      form.reset();
      submitted = false;
      names.forEach(function (n) { ctl(n).removeAttribute('aria-invalid'); var e = errEl(n); if (e) e.textContent = ''; });
      var summary = $('[data-form-summary]', form);
      if (summary) summary.textContent = '';
      form.hidden = false;
      success.hidden = true;
    }
    names.forEach(function (n) {
      ctl(n).addEventListener('blur', function () { if (submitted || ctl(n).value) validate(n); });
      ctl(n).addEventListener('input', function () { if (ctl(n).getAttribute('aria-invalid') === 'true') validate(n); });
    });
    if (store && store.mode === 'remote') {
      $$('[data-remote-only]', scope).forEach(function (el) { el.hidden = false; });
      var note = $('[data-storage-note] span', scope);
      if (note) note.textContent = '';
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submitted = true;
      var errors = names.filter(function (n) { return validate(n); });
      var summary = $('[data-form-summary]', form);
      if (errors.length) {
        summary.textContent = errors.length === 1 ? 'Please fix 1 field below.' : 'Please fix ' + errors.length + ' fields below.';
        ctl(errors[0]).focus();
        return;
      }
      summary.textContent = '';
      var entry = {
        name: ctl('name').value.trim(),
        email: ctl('email').value.trim().toLowerCase(),
        joinedAt: new Date().toISOString(),
        source: location.pathname + location.hash,
      };
      if (form.elements._honey) entry._honey = form.elements._honey.value; // spam trap, always empty for people
      var btn = $('[data-submit]', form);
      var label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Joining…';
      store.save(entry).then(function (result) {
        showSuccess(entry, result);
      }).catch(function (err) {
        if (window.console) console.warn('Vayora waitlist:', err && err.message);
        summary.textContent = err && err.code === 'not_delivered'
          ? "We couldn't add you to the waitlist just now. Please try again later."
          : "We couldn't reach the waitlist. Check your connection and try again.";
      }).then(function () {
        btn.disabled = false;
        btn.textContent = label;
      });
    });

    function showSuccess(entry, result) {
      var first = entry.name.split(/\s+/)[0];
      var title = $('[data-success-title]', success);
      var msg = $('[data-success-msg]', success);
      var note = $('[data-success-storage]', success);
      if (result.mode === 'remote') {
        title.textContent = 'You’re on the waitlist';
        msg.textContent = 'Thanks, ' + first + '. You’re on the Vayora waitlist. We’ll be in touch at ' + entry.email + ' with launch updates and early access information.';
        note.textContent = '';
      } else {
        // Prototype mode: no backend is connected, so say plainly that nothing was sent.
        title.textContent = 'Thanks for your interest';
        msg.textContent = 'Thanks, ' + first + '. This waitlist is still a prototype, so your name and email were not sent to the Vayora team and you won’t receive emails yet.';
        note.textContent = result.mode === 'local'
          ? 'Your entry is kept only in this browser on this device.'
          : 'Your entry is kept only until you close this page.';
      }
      form.hidden = true;
      success.hidden = false;
      success.focus();
    }
    return { reset: reset, done: function () { return !success.hidden; } };
  }

  $$('[data-waitlist-scope]').forEach(function (scope) {
    if (!scope.closest('[data-waitlist-dialog]')) Waitlist(scope);
  });

  /* ---------------------------------------------------------------- unsubscribe page */
  $$('[data-unsubscribe]').forEach(function (page) {
    var form = $('[data-unsubscribe-form]', page);
    var wrap = $('[data-unsub-form-wrap]', page);
    var done = $('[data-unsub-done]', page);
    if (!form || !done || !store) return;
    var input = form.elements.email;
    var err = doc.getElementById(input.getAttribute('aria-describedby'));
    var summary = $('[data-form-summary]', form);
    var submitted = false;
    function check() {
      var v = input.value.trim();
      var msg = !v ? 'Enter your email address.' : (EMAIL_RE.test(v) ? '' : 'Enter an email address like name@example.com.');
      err.textContent = msg;
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      return msg;
    }
    input.addEventListener('blur', function () { if (submitted || input.value) check(); });
    input.addEventListener('input', function () { if (input.getAttribute('aria-invalid') === 'true') check(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submitted = true;
      if (check()) { summary.textContent = 'Please fix 1 field below.'; input.focus(); return; }
      summary.textContent = '';
      var email = input.value.trim().toLowerCase();
      var btn = $('[data-submit]', form);
      var label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Unsubscribing…';
      var honey = form.elements._honey ? form.elements._honey.value : '';
      store.unsubscribe(email, honey).then(function (result) {
        $('[data-unsub-msg]', done).textContent = result.mode === 'remote'
          ? 'We’ve received your request and will remove ' + email + ' from the Vayora waitlist. You won’t get any more launch updates from us.'
          : 'We’ve removed ' + email + ' from the waitlist saved in this browser.';
        wrap.hidden = true;
        done.hidden = false;
        done.focus();
      }).catch(function (e2) {
        if (window.console) console.warn('Vayora unsubscribe:', e2 && e2.message);
        summary.textContent = e2 && e2.code === 'not_delivered'
          ? "We couldn't send your request just now. Please try again later."
          : "We couldn't reach the server. Check your connection and try again.";
      }).then(function () {
        btn.disabled = false;
        btn.textContent = label;
      });
    });
  });

  /* ---------------------------------------------------------------- reviews (product) */
  // Shows only the reviews listed in reviews-data.js. The summary is worked out from that list.
  $$('#reviews').forEach(function (sec) {
    var STAR = ($('.stars-base svg', sec) || {}).outerHTML || '';
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var PAGE = 5;
    var shown = PAGE;
    var reviews = (window.VAYORA_REVIEWS || []).filter(function (r) {
      return r && typeof r.text === 'string' && r.text.trim() && r.name && Math.round(r.rating) >= 1 && Math.round(r.rating) <= 5;
    }).map(function (r, i) {
      return { name: String(r.name), city: r.city ? String(r.city) : '', rating: Math.round(r.rating), title: r.title ? String(r.title) : '',
        text: String(r.text), date: r.date ? String(r.date) : '', verified: r.verified === true, i: i };
    });
    var list = $('[data-review-list]', sec);
    var sortSel = $('[data-reviews-sort]', sec);

    function fmtDate(d) {
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
      return m ? (+m[3]) + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1] : '';
    }
    function starsEl(rating, cls) {
      var s = doc.createElement('span');
      s.className = 'stars ' + (cls || '');
      s.style.setProperty('--fill', (rating / 5 * 100) + '%');
      var stars = new Array(6).join(STAR);
      s.innerHTML = '<span class="stars-base" aria-hidden="true">' + stars + '</span><span class="stars-fill" aria-hidden="true">' + stars + '</span>';
      var t = doc.createElement('span');
      t.className = 'visually-hidden';
      t.textContent = 'Rated ' + rating + ' out of 5';
      s.appendChild(t);
      return s;
    }

    // Summary
    var counts = [0, 0, 0, 0, 0, 0];
    var total = 0;
    reviews.forEach(function (r) { counts[r.rating]++; total += r.rating; });
    var n = reviews.length;
    var avg = n ? Math.round(total / n * 10) / 10 : 0;
    $('[data-rs-avg]', sec).textContent = n ? avg.toFixed(1) : '–';
    $('[data-rs-stars]', sec).style.setProperty('--fill', (avg / 5 * 100) + '%');
    $('[data-rs-count]', sec).textContent = n
      ? avg.toFixed(1) + ' out of 5, from ' + n + (n === 1 ? ' review' : ' reviews')
      : 'No ratings yet';
    for (var k = 1; k <= 5; k++) {
      $('[data-rb-fill="' + k + '"]', sec).style.width = (n ? counts[k] / n * 100 : 0) + '%';
      $('[data-rb-count="' + k + '"]', sec).textContent = counts[k];
    }
    $('[data-rs-bars]', sec).setAttribute('aria-label', 'Ratings breakdown: ' +
      [5, 4, 3, 2, 1].map(function (x) { return x + ' star: ' + counts[x]; }).join(', '));

    $('[data-reviews-empty]', sec).hidden = n > 0;
    $('[data-reviews-toolbar]', sec).hidden = n < 2;

    function render() {
      var mode = sortSel ? sortSel.value : 'recent';
      var sorted = reviews.slice().sort(function (a, b) {
        if (mode === 'high' && a.rating !== b.rating) return b.rating - a.rating;
        if (mode === 'low' && a.rating !== b.rating) return a.rating - b.rating;
        return (b.date > a.date ? 1 : b.date < a.date ? -1 : a.i - b.i);
      });
      list.textContent = '';
      sorted.slice(0, shown).forEach(function (r) {
        var li = doc.createElement('li');
        li.className = 'review-card';
        var head = doc.createElement('div');
        head.className = 'rc-head';
        head.appendChild(starsEl(r.rating));
        if (r.date) {
          var time = doc.createElement('time');
          time.dateTime = r.date;
          time.textContent = fmtDate(r.date);
          head.appendChild(time);
        }
        li.appendChild(head);
        if (r.title) { var h = doc.createElement('h3'); h.textContent = r.title; li.appendChild(h); }
        r.text.split(/\n{2,}/).forEach(function (para) {
          var p = doc.createElement('p'); p.textContent = para.trim(); li.appendChild(p);
        });
        var by = doc.createElement('p');
        by.className = 'rc-by';
        var who = doc.createElement('span');
        who.textContent = r.name + (r.city ? ', ' + r.city : '');
        by.appendChild(who);
        if (r.verified) {
          var v = doc.createElement('span');
          v.className = 'rc-verified';
          v.textContent = 'Verified purchase';
          by.appendChild(v);
        }
        li.appendChild(by);
        list.appendChild(li);
      });
      var visible = Math.min(shown, n);
      var showing = $('[data-reviews-showing]', sec);
      if (showing) showing.textContent = 'Showing ' + visible + ' of ' + n + ' reviews';
      $('[data-reviews-more-wrap]', sec).hidden = n <= shown;
    }
    if (sortSel) sortSel.addEventListener('change', function () { shown = PAGE; render(); });
    var more = $('[data-reviews-more]', sec);
    if (more) more.addEventListener('click', function () {
      var first = shown;
      shown += PAGE;
      render();
      var next = list.children[first];
      if (next) { next.setAttribute('tabindex', '-1'); next.focus(); }
    });
    render();
  });

  /* ---------------------------------------------------------------- write a review */
  (function () {
    var dlg = $('[data-review-dialog]');
    if (!dlg) return;
    var form = $('[data-review-form]', dlg);
    var success = $('[data-review-success]', dlg);
    var summary = $('[data-form-summary]', form);
    var word = $('[data-star-word]', form);
    var starWrap = $('[data-star-input]', form);
    var WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
    var counter = $('[data-char-count]', form);
    var trigger = null;
    var submitted = false;

    function ratingVal() { var c = $('input[name="rating"]:checked', form); return c ? +c.value : 0; }
    function paintStars(v) {
      $$('label', starWrap).forEach(function (l, i) { l.classList.toggle('on', i < v); });
      word.textContent = WORDS[v] || '';
    }
    $$('input[name="rating"]', form).forEach(function (r) {
      r.addEventListener('change', function () { paintStars(ratingVal()); if (submitted) validate(); });
    });
    $$('label', starWrap).forEach(function (l, i) {
      l.addEventListener('mouseenter', function () { paintStars(i + 1); });
    });
    starWrap.addEventListener('mouseleave', function () { paintStars(ratingVal()); });

    var t = form.elements.text;
    t.addEventListener('input', function () { counter.textContent = t.value.length; });

    function errFor(el) {
      var ids = (el.getAttribute('aria-describedby') || '').split(/\s+/);
      for (var i = 0; i < ids.length; i++) { if (/-err$/.test(ids[i])) return doc.getElementById(ids[i]); }
      return null;
    }
    function setErr(el, msg) {
      var e = errFor(el);
      if (e) e.textContent = msg;
      if (el.type !== 'checkbox' && el.tagName !== 'FIELDSET') el.setAttribute('aria-invalid', msg ? 'true' : 'false');
      return msg;
    }
    function validate() {
      var f = form.elements;
      var bad = [];
      var ratingField = $('.star-field', form);
      if (setErr(ratingField, ratingVal() ? '' : 'Choose a star rating.')) bad.push($('input[name="rating"]', form));
      var name = f.name.value.trim();
      if (setErr(f.name, !name ? 'Enter the name to show with your review.' : name.length < 2 ? 'Enter at least 2 characters.' : '')) bad.push(f.name);
      var email = f.email.value.trim();
      if (setErr(f.email, !email ? 'Enter your email address.' : EMAIL_RE.test(email) ? '' : 'Enter an email address like name@example.com.')) bad.push(f.email);
      var text = f.text.value.trim();
      if (setErr(f.text, !text ? 'Write your review.' : text.length < 20 ? 'Write at least 20 characters so other buyers get a useful picture.' : '')) bad.push(f.text);
      if (setErr(f.consent, f.consent.checked ? '' : 'Tick this box to confirm you have used Vayora and agree to publication.')) bad.push(f.consent);
      return bad;
    }
    ['name', 'email', 'text'].forEach(function (k) {
      var el = form.elements[k];
      el.addEventListener('blur', function () { if (submitted) validate(); });
      el.addEventListener('input', function () { if (el.getAttribute('aria-invalid') === 'true') validate(); });
    });
    form.elements.consent.addEventListener('change', function () { if (submitted) validate(); });

    function reset() {
      form.reset();
      submitted = false;
      paintStars(0);
      counter.textContent = '0';
      summary.textContent = '';
      $$('.error-msg', form).forEach(function (e) { e.textContent = ''; });
      $$('[aria-invalid]', form).forEach(function (e) { e.setAttribute('aria-invalid', 'false'); });
      form.hidden = false;
      success.hidden = true;
    }
    function open(tr) {
      trigger = tr || doc.activeElement;
      if (!success.hidden) reset();
      if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
      var first = $('input[name="rating"]', form);
      if (first) first.focus();
    }
    function close() {
      if (typeof dlg.close === 'function' && dlg.open) dlg.close(); else dlg.removeAttribute('open');
    }
    doc.addEventListener('click', function (e) {
      var o = e.target.closest('[data-review-open]');
      if (o) { e.preventDefault(); open(o); }
    });
    $$('[data-review-close]', dlg).forEach(function (b) { b.addEventListener('click', close); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
    dlg.addEventListener('close', function () { if (trigger && doc.body.contains(trigger) && trigger.focus) trigger.focus(); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submitted = true;
      var bad = validate();
      if (bad.length) {
        summary.textContent = 'Please fix ' + bad.length + (bad.length === 1 ? ' field' : ' fields') + ' below.';
        bad[0].focus();
        return;
      }
      summary.textContent = '';
      var f = form.elements;
      var review = {
        rating: ratingVal(), name: f.name.value.trim(), city: f.city.value.trim(), email: f.email.value.trim().toLowerCase(),
        title: f.title.value.trim(), text: f.text.value.trim(), honey: f._honey ? f._honey.value : '',
      };
      var btn = $('[data-submit]', form);
      var label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Sending…';
      store.sendReview(review).then(function () {
        $('[data-review-success-msg]', dlg).textContent = 'Thanks, ' + review.name.split(' ')[0] +
          '. Your ' + review.rating + '-star review has been sent to the Vayora team. Reviews are checked before they’re published, so it won’t appear here straight away.';
        form.hidden = true;
        success.hidden = false;
        success.focus();
      }).catch(function (err) {
        if (window.console) console.warn('Vayora review:', err && err.message);
        summary.textContent = err && err.code === 'not_configured'
          ? 'Reviews can’t be sent from this site right now. Please call ' + ((window.VAYORA_CONFIG || {}).checkout || {}).supportPhone + ' instead.'
          : err && err.code === 'not_delivered'
            ? 'We couldn’t send your review just now. Please try again later.'
            : 'We couldn’t reach the server. Check your connection and try again.';
      }).then(function () {
        btn.disabled = false;
        btn.textContent = label;
      });
    });
  })();

  /* ---------------------------------------------------------------- waitlist dialog */
  var dialog = $('[data-waitlist-dialog]');
  var dialogForm = dialog ? Waitlist($('[data-waitlist-scope]', dialog)) : null;
  var lastTrigger = null;

  function openDialog(trigger) {
    if (!dialog) return;
    lastTrigger = trigger || doc.activeElement;
    if (dialogForm && dialogForm.done()) dialogForm.reset();
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    var first = $('input[name="name"]', dialog);
    if (first && doc.activeElement !== first) first.focus();
  }
  function closeDialog() {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }
  if (dialog) {
    doc.addEventListener('click', function (e) {
      var t = e.target.closest('[data-waitlist]');
      if (t) { e.preventDefault(); openDialog(t); }
    });
    $$('[data-dialog-close]', dialog).forEach(function (b) { b.addEventListener('click', closeDialog); });
    var closeLink = $('[data-dialog-close-link]', dialog);
    if (closeLink) closeLink.addEventListener('click', closeDialog);
    dialog.addEventListener('click', function (e) { if (e.target === dialog) closeDialog(); }); // backdrop
    dialog.addEventListener('close', function () {
      if (lastTrigger && doc.body.contains(lastTrigger) && lastTrigger.focus) lastTrigger.focus();
    });
  }

  /* ---------------------------------------------------------------- airflow stepper (product) */
  $$('[data-pipeline]').forEach(function (pipe) {
    var tabs = $$('.stage-btn', pipe);
    var numEl = $('[data-step-num]', pipe);
    var titleEl = $('[data-step-title]', pipe);
    var textEl = $('[data-step-text]', pipe);
    var progress = $('[data-progress]', pipe);
    var playBtn = $('[data-step-play]', pipe);
    var restartBtn = $('[data-step-restart]', pipe);
    var current = 0;
    var timer = null;
    var touched = false; // once the visitor takes control, never auto-play again

    function select(i, focus) {
      current = (i + tabs.length) % tabs.length;
      tabs.forEach(function (t, j) {
        var on = j === current;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        t.classList.toggle('is-passed', j < current);
      });
      numEl.textContent = String(current + 1);
      titleEl.textContent = tabs[current].getAttribute('data-title');
      textEl.textContent = tabs[current].getAttribute('data-text');
      if (progress) progress.style.width = (current / (tabs.length - 1)) * 92 + '%';
      if (focus) tabs[current].focus();
    }
    function setPlaying(on) {
      clearInterval(timer);
      timer = null;
      if (on) {
        timer = setInterval(function () {
          if (current === tabs.length - 1) { setPlaying(false); return; }
          select(current + 1);
        }, 2600);
      }
      if (playBtn) {
        playBtn.setAttribute('aria-pressed', String(on));
        playBtn.setAttribute('aria-label', on ? 'Pause the walkthrough' : 'Play the walkthrough');
        $('[data-icon-play]', playBtn).hidden = on;
        $('[data-icon-pause]', playBtn).hidden = !on;
      }
    }

    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { touched = true; setPlaying(false); select(i); });
      t.addEventListener('keydown', function (e) {
        var k = e.key, next = null;
        if (k === 'ArrowRight' || k === 'ArrowDown') next = current + 1;
        else if (k === 'ArrowLeft' || k === 'ArrowUp') next = current - 1;
        else if (k === 'Home') next = 0;
        else if (k === 'End') next = tabs.length - 1;
        if (next !== null) { e.preventDefault(); touched = true; setPlaying(false); select(next, true); }
      });
    });
    if (playBtn) playBtn.addEventListener('click', function () {
      touched = true;
      var on = playBtn.getAttribute('aria-pressed') !== 'true';
      if (on && current === tabs.length - 1) select(0);
      setPlaying(on);
    });
    if (restartBtn) restartBtn.addEventListener('click', function () { touched = true; select(0); if (!reduceMotion) setPlaying(true); });

    select(0);
    // Auto-play once, the first time the stepper scrolls into view.
    if (!reduceMotion && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { if (!touched) setPlaying(true); io.disconnect(); }
        });
      }, { threshold: 0.55 });
      io.observe(pipe);
    }
  });

  /* ---------------------------------------------------------------- exploded diagram (product) */
  $$('[data-explode]').forEach(function (wrap) {
    var art = $('.explode-art', wrap);
    var btns = $$('.component-btn', wrap);
    var layers = $$('.layer', art);
    var active = null;

    function setActive(part) {
      active = active === part ? null : part;
      art.classList.toggle('has-active', !!active);
      layers.forEach(function (l) { l.classList.toggle('is-active', l.getAttribute('data-part') === active); });
      btns.forEach(function (b) {
        var on = b.getAttribute('data-part') === active;
        b.setAttribute('aria-pressed', String(on));
        var detail = doc.getElementById(b.getAttribute('aria-controls'));
        if (detail) detail.classList.toggle('is-open', on);
      });
    }
    btns.forEach(function (b) { b.addEventListener('click', function () { setActive(b.getAttribute('data-part')); }); });
    layers.forEach(function (l) {
      l.addEventListener('click', function () {
        var part = l.getAttribute('data-part');
        setActive(part);
        var b = btns.filter(function (x) { return x.getAttribute('data-part') === part; })[0];
        if (b && active && window.innerWidth <= 960) b.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
      });
    });

    var reset = $('[data-explode-reset]', wrap);
    if (reset) reset.addEventListener('click', function () { active = 'x'; setActive('x'); });

    var flowBtn = $('[data-explode-flow]', wrap);
    function setFlow(on) {
      art.classList.toggle('paused', !on);
      flowBtn.setAttribute('aria-pressed', String(on));
      $('[data-flow-label]', flowBtn).textContent = on ? 'Pause airflow' : 'Play airflow';
      $('[data-flow-icon-pause]', flowBtn).hidden = !on;
      $('[data-flow-icon-play]', flowBtn).hidden = on;
    }
    if (flowBtn) {
      flowBtn.addEventListener('click', function () { setFlow(flowBtn.getAttribute('aria-pressed') !== 'true'); });
      if (reduceMotion) setFlow(false);
    }
  });

  /* ---------------------------------------------------------------- journal index (inside) */
  $$('[data-journal-index]').forEach(function (index) {
    var links = $$('a', index);
    var list = $('ol', index);
    var tgl = $('[data-index-toggle]', index);
    var label = $('[data-index-current]', index);
    var targets = links.map(function (a) { return doc.getElementById(a.getAttribute('href').slice(1)); });

    function setOpen(open) {
      list.classList.toggle('is-open', open);
      tgl.setAttribute('aria-expanded', String(open));
    }
    if (tgl) tgl.addEventListener('click', function () { setOpen(tgl.getAttribute('aria-expanded') !== 'true'); });
    links.forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });

    function spy() {
      var line = (header ? header.offsetHeight : 72) + 120;
      var idx = -1;
      targets.forEach(function (t, i) {
        if (t && t.offsetParent !== null && t.getBoundingClientRect().top <= line) idx = i;
      });
      links.forEach(function (a, i) {
        a.classList.toggle('is-active', i === idx);
        if (i === idx) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
      if (label) label.textContent = idx >= 0 ? links[idx].textContent.replace(/^\s*\S+\s*/, '') : 'Jump to a concept';
    }
    window.addEventListener('scroll', spy, { passive: true });
    window.addEventListener('resize', spy);
    window.addEventListener('hashchange', function () { setTimeout(spy, 50); });
    spy();
  });


  /* ---------------------------------------------------------------- shared: reveal a deep-linked target */
  // Opens a FAQ <details> or selects the tab that contains the target, then returns the element to scroll to.
  function revealTarget(id) {
    var el = id && doc.getElementById(id);
    if (!el) return null;
    var panel = el.closest('[role="tabpanel"]');
    var tabs = panel && panel.closest('[data-tabs]');
    if (tabs && tabs._select) tabs._select(panel.id);
    if (el.tagName === 'DETAILS') el.open = true;
    return el;
  }
  function scrollToTarget(el, smooth) {
    requestAnimationFrame(function () {
      el.scrollIntoView({ behavior: smooth && !reduceMotion ? 'smooth' : 'instant', block: 'start' });
    });
  }

  /* ---------------------------------------------------------------- announcement strip */
  $$('[data-announce]').forEach(function (bar) {
    var msgs = $$('.announce-msg', bar);
    var i = 0, timer = null, held = false;
    function show(n) {
      i = (n + msgs.length) % msgs.length;
      msgs.forEach(function (m, j) { m.classList.toggle('is-active', j === i); });
    }
    function run() {
      clearInterval(timer);
      if (!reduceMotion && !held) timer = setInterval(function () { show(i + 1); }, 5000);
    }
    $('[data-announce-prev]', bar).addEventListener('click', function () { show(i - 1); run(); });
    $('[data-announce-next]', bar).addEventListener('click', function () { show(i + 1); run(); });
    bar.addEventListener('mouseenter', function () { held = true; run(); });
    bar.addEventListener('mouseleave', function () { held = false; run(); });
    bar.addEventListener('focusin', function () { held = true; run(); });
    bar.addEventListener('focusout', function () { held = false; run(); });
    run();
  });

  /* ---------------------------------------------------------------- mega menus */
  var megaItems = $$('[data-mega]');
  var desktopMQ = window.matchMedia('(min-width: 881px)');
  function setMega(item, open) {
    item.classList.toggle('is-open', open);
    $('.mega-toggle', item).setAttribute('aria-expanded', String(open));
  }
  function closeMegas(except) { megaItems.forEach(function (m) { if (m !== except) setMega(m, false); }); }
  megaItems.forEach(function (item) {
    var btn = $('.mega-toggle', item);
    var t = null;
    btn.addEventListener('click', function () {
      clearTimeout(t);
      var open = !item.classList.contains('is-open');
      closeMegas(item);
      setMega(item, open);
    });
    item.addEventListener('mouseenter', function () {
      if (!desktopMQ.matches) return;
      clearTimeout(t);
      t = setTimeout(function () { closeMegas(item); setMega(item, true); }, 90);
    });
    item.addEventListener('mouseleave', function () {
      if (!desktopMQ.matches) return;
      clearTimeout(t);
      t = setTimeout(function () { setMega(item, false); }, 200);
    });
    item.addEventListener('focusout', function () {
      setTimeout(function () { if (!item.contains(doc.activeElement) && desktopMQ.matches) setMega(item, false); }, 0);
    });
    item.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && item.classList.contains('is-open')) { e.stopPropagation(); clearTimeout(t); setMega(item, false); btn.focus(); }
    });
    $$('.mega a', item).forEach(function (a) { a.addEventListener('click', function () { setMega(item, false); }); });
  });
  doc.addEventListener('click', function (e) {
    if (desktopMQ.matches && !e.target.closest('[data-mega]')) closeMegas();
  });

  /* ---------------------------------------------------------------- site search */
  var searchDialog = $('[data-search]');
  if (searchDialog) {
    var sInput = $('[data-search-input]', searchDialog);
    var sList = $('[data-search-results]', searchDialog);
    var sEmpty = $('[data-search-empty]', searchDialog);
    var sCount = $('[data-search-count]', searchDialog);
    var sSuggest = $('[data-search-suggest]', searchDialog);
    var index = window.VAYORA_SEARCH || [];
    var searchTrigger = null;

    var norm = function (str) { return String(str || '').toLowerCase().replace(/[^a-z0-9₹.\s-]/g, ' '); };
    var esc = function (str) { return String(str).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var mark = function (text, toks) {
      var out = esc(text);
      toks.forEach(function (t) {
        if (t.length < 2) return;
        out = out.replace(new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>');
      });
      return out;
    };
    var hrefFor = function (e) {
      if (isPreview) return '#' + (e.id || e.p);
      var here = doc.body.getAttribute('data-page');
      if (e.p === here && e.id) return '#' + e.id;
      return (root.getAttribute('data-root') || '') + e.r + (e.id ? '#' + e.id : '');
    };
    var run = function () {
      var q = sInput.value.trim();
      var toks = norm(q).split(/\s+/).filter(Boolean);
      sList.innerHTML = '';
      sSuggest.hidden = !!toks.length;
      sCount.hidden = true;
      sEmpty.hidden = true;
      if (!toks.length) return;
      var hits = index.map(function (e) {
        var t = norm(e.t), s = norm(e.s), k = norm(e.k + ' ' + e.l), score = 0;
        for (var i = 0; i < toks.length; i++) {
          var h = (t.indexOf(toks[i]) > -1 ? 3 : 0) + (k.indexOf(toks[i]) > -1 ? 2 : 0) + (s.indexOf(toks[i]) > -1 ? 1 : 0);
          if (!h) return null;
          score += h;
        }
        return { e: e, score: score - (e.id ? 0 : 0.5) };
      }).filter(Boolean).sort(function (a, b) { return b.score - a.score; }).slice(0, 12);
      if (!hits.length) {
        sEmpty.innerHTML = 'No results for “' + esc(q) + '”. Try “battery”, “mosquito” or “price”, or <a href="' + hrefFor({ p: 'product', r: 'product/', id: 'faq' }) + '" data-search-result>browse the FAQs</a>.';
        sEmpty.hidden = false;
        return;
      }
      sCount.textContent = hits.length === 1 ? '1 result' : hits.length + ' results';
      sCount.hidden = false;
      hits.forEach(function (h) {
        var li = doc.createElement('li');
        li.innerHTML = '<a class="search-result" data-search-result href="' + hrefFor(h.e) + '"><span class="search-page">' + esc(h.e.l) + '</span><strong>' + mark(h.e.t, toks) + '</strong>' + (h.e.s ? '<span class="search-snippet">' + mark(h.e.s, toks) + '</span>' : '') + '</a>';
        sList.appendChild(li);
      });
    };
    var openSearch = function (trigger) {
      searchTrigger = trigger || doc.activeElement;
      if (dialog && dialog.open) closeDialog();
      if (typeof searchDialog.showModal === 'function') { if (!searchDialog.open) searchDialog.showModal(); }
      else searchDialog.setAttribute('open', '');
      sInput.focus();
      sInput.select();
      run();
    };
    var closeSearch = function () {
      if (typeof searchDialog.close === 'function' && searchDialog.open) searchDialog.close();
      else searchDialog.removeAttribute('open');
    };
    doc.addEventListener('click', function (e) {
      var t = e.target.closest('[data-search-open]');
      if (t) { e.preventDefault(); openSearch(t); }
    });
    $('[data-search-close]', searchDialog).addEventListener('click', closeSearch);
    searchDialog.addEventListener('click', function (e) {
      if (e.target === searchDialog) { closeSearch(); return; }
      var chip = e.target.closest('[data-search-term]');
      if (chip) { sInput.value = chip.getAttribute('data-search-term'); run(); sInput.focus(); return; }
      var res = e.target.closest('[data-search-result]');
      if (res) {
        var href = res.getAttribute('href');
        closeSearch();
        if (href.charAt(0) === '#') {
          e.preventDefault();
          if (location.hash === href) { var el = revealTarget(href.slice(1)); if (el) scrollToTarget(el, true); }
          else location.hash = href;
        }
      }
    });
    searchDialog.addEventListener('close', function () {
      if (searchTrigger && doc.body.contains(searchTrigger) && searchTrigger.focus && !location.hash) searchTrigger.focus();
    });
    sInput.addEventListener('input', run);
    searchDialog.addEventListener('keydown', function (e) {
      var links = $$('[data-search-result]', searchDialog);
      var idx = links.indexOf(doc.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); closeSearch(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); (links[idx + 1] || links[0] || sInput).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (idx <= 0) sInput.focus(); else links[idx - 1].focus(); }
      else if (e.key === 'Enter' && doc.activeElement === sInput && links[0]) { e.preventDefault(); links[0].click(); }
    });
    doc.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      var anyOpen = searchDialog.open || (dialog && dialog.open);
      if (anyOpen) return;
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); openSearch(); }
    });
  }

  /* ---------------------------------------------------------------- hero carousel */
  $$('[data-carousel]').forEach(function (car) {
    var slides = $$('.slide', car);
    var dots = $$('[data-goto]', car);
    var pauseBtn = $('[data-carousel-pause]', car);
    var i = 0, timer = null, userPaused = reduceMotion, held = false, inView = true;
    var DELAY = 7000;

    function setPauseUI() {
      pauseBtn.setAttribute('aria-label', userPaused ? 'Play slideshow' : 'Pause slideshow');
      $('[data-icon-pause]', pauseBtn).hidden = userPaused;
      $('[data-icon-play]', pauseBtn).hidden = !userPaused;
    }
    function restart() {
      clearTimeout(timer);
      car.classList.remove('is-timing');
      if (userPaused || held || !inView || doc.hidden) return;
      void car.offsetWidth; // restart the progress animation
      car.classList.add('is-timing');
      timer = setTimeout(function () { go(i + 1); }, DELAY);
    }
    function syncSlideVideos() {
      slides.forEach(function (sl, j) {
        $$('video', sl).forEach(function (v) {
          v.muted = true;
          if (j === i && !reduceMotion && !userPaused && inView) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
          else if (!v.paused) v.pause();
        });
      });
    }
    function go(n) {
      i = (n + slides.length) % slides.length;
      slides.forEach(function (sl, j) {
        var on = j === i;
        sl.classList.toggle('is-active', on);
        sl.setAttribute('aria-hidden', String(!on));
        if ('inert' in sl) sl.inert = !on;
      });
      syncSlideVideos();
      dots.forEach(function (d, j) {
        d.classList.toggle('is-active', j === i);
        if (j === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
      });
      restart();
    }
    dots.forEach(function (d) { d.addEventListener('click', function () { go(Number(d.getAttribute('data-goto'))); }); });
    $('[data-carousel-prev]', car).addEventListener('click', function () { go(i - 1); });
    $('[data-carousel-next]', car).addEventListener('click', function () { go(i + 1); });
    pauseBtn.addEventListener('click', function () { userPaused = !userPaused; setPauseUI(); restart(); syncSlideVideos(); });
    var slidesWrap = $('.slides', car);
    slidesWrap.addEventListener('mouseenter', function () { held = true; restart(); });
    slidesWrap.addEventListener('mouseleave', function () { held = false; restart(); });
    slidesWrap.addEventListener('focusin', function () { held = true; restart(); });
    slidesWrap.addEventListener('focusout', function () { held = false; restart(); });
    doc.addEventListener('visibilitychange', restart);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { inView = en[0].isIntersecting; restart(); syncSlideVideos(); }, { threshold: 0.3 }).observe(car);
    }
    car.classList.add('is-ready');
    setPauseUI();
    go(0);
  });

  /* ---------------------------------------------------------------- tabs (product highlights) */
  $$('[data-tabs]').forEach(function (wrap) {
    var tabs = $$('[role="tab"]', wrap);
    var panels = tabs.map(function (t) { return doc.getElementById(t.getAttribute('aria-controls')); });
    function select(k, focus) {
      tabs.forEach(function (t, j) {
        var on = j === k;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        panels[j].hidden = !on;
      });
      if (focus) tabs[k].focus();
    }
    wrap._select = function (id) {
      var k = panels.map(function (p) { return p.id; }).indexOf(id);
      if (k > -1) select(k);
    };
    tabs.forEach(function (t, k) {
      t.addEventListener('click', function () { select(k); });
      t.addEventListener('keydown', function (e) {
        var n = null;
        if (e.key === 'ArrowRight') n = (k + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') n = (k - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = tabs.length - 1;
        if (n !== null) { e.preventDefault(); select(n, true); }
      });
    });
    wrap.classList.add('is-enhanced');
    select(0);
  });

  /* ---------------------------------------------------------------- floating help */
  $$('[data-help]').forEach(function (help) {
    var toggleBtn = $('[data-help-toggle]', help);
    var panel = $('[data-help-panel]', help);
    function setHelp(open) {
      panel.hidden = !open;
      toggleBtn.setAttribute('aria-expanded', String(open));
      help.classList.toggle('is-open', open);
    }
    toggleBtn.addEventListener('click', function () { setHelp(panel.hidden); if (!panel.hidden) { var f = $('a, button', panel); if (f) f.focus(); } });
    $$('[data-help-close]', help).forEach(function (el) { el.addEventListener('click', function () { setHelp(false); }); });
    doc.addEventListener('click', function (e) { if (!panel.hidden && !e.target.closest('[data-help]')) setHelp(false); });
    help.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { setHelp(false); toggleBtn.focus(); } });
    var top = $('[data-back-to-top]', help);
    top.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      var skip = $('.brand');
      if (skip) skip.focus({ preventScroll: true });
    });
    window.addEventListener('scroll', function () { help.classList.toggle('is-visible', window.scrollY > 500); }, { passive: true });
  });

  /* ---------------------------------------------------------------- deep links (multi-page build) */
  if (!isPreview) {
    var handleHash = function (smooth) {
      var el = revealTarget(decodeURIComponent(location.hash.slice(1)));
      if (el) scrollToTarget(el, smooth);
    };
    window.addEventListener('hashchange', function () { handleHash(true); });
    if (location.hash) {
      handleHash(false);
      // Re-align once web fonts have loaded, in case text reflow moved the target.
      if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { handleHash(false); });
      // The browser's own fragment scroll can run after ours; re-align once loading settles.
      window.addEventListener('load', function () { setTimeout(function () { handleHash(false); }, 0); });
    }
  }


  /* ---------------------------------------------------------------- product video */
  // Muted concept video plays only while visible, and never automatically for reduced-motion users.
  $$('[data-autoplay-video]').forEach(function (v) {
    v.muted = true;
    // Optional pause/play button next to the video (use-case cards)
    var tog = v.parentNode && v.parentNode.querySelector('[data-video-toggle]');
    if (tog) {
      var sync = function () {
        var playing = !v.paused;
        tog.setAttribute('aria-label', playing ? 'Pause animation' : 'Play animation');
        $('[data-icon-pause]', tog).hidden = !playing;
        $('[data-icon-play]', tog).hidden = playing;
      };
      v.addEventListener('play', sync);
      v.addEventListener('pause', sync);
      tog.addEventListener('click', function () {
        if (v.paused) { var pp = v.play(); if (pp && pp.catch) pp.catch(function () {}); } else v.pause();
      });
      sync();
    }
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    var userPaused = false;
    v.addEventListener('pause', function () { if (v.dataset.autoPausing !== '1') userPaused = true; });
    v.addEventListener('play', function () { userPaused = false; });
    new IntersectionObserver(function (en) {
      if (en[0].isIntersecting) { if (!userPaused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } }
      else if (!v.paused) { v.dataset.autoPausing = '1'; v.pause(); v.dataset.autoPausing = ''; }
    }, { threshold: 0.4 }).observe(v);
  });

  /* ---------------------------------------------------------------- reveal on scroll */
  var reveals = $$('.reveal');
  if (reveals.length) {
    if (!('IntersectionObserver' in window) || reduceMotion) {
      reveals.forEach(function (el) { el.classList.add('is-in'); });
    } else {
      var rio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('is-in'); rio.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
      reveals.forEach(function (el) { rio.observe(el); });
    }
  }

  /* ---------------------------------------------------------------- preview router (single-file build) */
  if (isPreview) {
    var routes = $$('.route');
    var navLinks = $$('[data-nav]');

    function show(routeName) {
      var changed = false;
      routes.forEach(function (r) {
        var on = r.getAttribute('data-route') === routeName;
        if (on && r.hidden) changed = true;
        r.hidden = !on;
        if (on) doc.title = r.getAttribute('data-title');
      });
      doc.body.setAttribute('data-page', routeName);
      navLinks.forEach(function (a) {
        if (a.getAttribute('data-nav') === routeName) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
      if (changed) window.dispatchEvent(new Event('scroll'));
      return changed;
    }

    function route() {
      var hash = decodeURIComponent(location.hash.slice(1));
      var byName = routes.filter(function (r) { return r.getAttribute('data-route') === hash; })[0];
      if (!hash || byName) {
        show(hash || 'home');
        window.scrollTo(0, 0);
        return;
      }
      var target = doc.getElementById(hash);
      if (!target) { show('home'); window.scrollTo(0, 0); return; }
      var owner = target.closest('.route');
      var changed = owner ? show(owner.getAttribute('data-route')) : false;
      var el = revealTarget(hash) || target;
      scrollToTarget(el, !changed);
    }
    window.addEventListener('hashchange', route);
    route();
  }
})();
