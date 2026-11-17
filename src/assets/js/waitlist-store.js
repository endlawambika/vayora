/*
 * Waitlist storage adapter.
 * One interface, two implementations:
 *   - LocalStore: prototype mode, saves to localStorage (or memory if storage is blocked)
 *   - RemoteStore: POSTs JSON to VAYORA_CONFIG.waitlistEndpoint
 * main.js only ever calls VayoraWaitlist.save(entry) / .has(email) / .list() / .clear().
 */
(function () {
  'use strict';
  var config = window.VAYORA_CONFIG || {};
  var KEY = config.storageKey || 'vayora.waitlist.v1';
  var memory = [];

  function storageAvailable() {
    try {
      var t = '__vayora_test__';
      window.localStorage.setItem(t, t);
      window.localStorage.removeItem(t);
      return true;
    } catch (e) {
      return false;
    }
  }

  var LocalStore = {
    mode: storageAvailable() ? 'local' : 'memory',
    list: function () {
      if (this.mode === 'memory') return memory.slice();
      try {
        return JSON.parse(window.localStorage.getItem(KEY) || '[]');
      } catch (e) {
        return [];
      }
    },
    has: function (email) {
      var e = String(email).trim().toLowerCase();
      return this.list().some(function (x) { return x.email === e; });
    },
    save: function (entry) {
      var all = this.list();
      all.push(entry);
      if (this.mode === 'memory') {
        memory = all;
      } else {
        try {
          window.localStorage.setItem(KEY, JSON.stringify(all));
        } catch (e) {
          this.mode = 'memory';
          memory = all;
        }
      }
      return Promise.resolve({ ok: true, mode: this.mode, count: all.length });
    },
    sendReview: function () {
      var err = new Error('No endpoint is configured for reviews');
      err.code = 'not_configured';
      return Promise.reject(err);
    },
    unsubscribe: function (email) {
      var e = String(email).trim().toLowerCase();
      var all = this.list();
      var rest = all.filter(function (x) { return x.email !== e; });
      if (this.mode === 'memory') memory = rest;
      else { try { window.localStorage.setItem(KEY, JSON.stringify(rest)); } catch (err) { memory = rest; } }
      return Promise.resolve({ ok: true, mode: this.mode, removed: all.length - rest.length });
    },
    clear: function () {
      memory = [];
      try { window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    },
  };

  // Remote mode: POSTs to config.waitlistEndpoint (FormSubmit by default). Delivery counts only when
  // the service says so; FormSubmit answers {success:"false", message:"...Activation..."} until the
  // form has been activated from the recipient's inbox.
  var SENT_KEY = KEY + '.sent';
  function sentLog() {
    try { return JSON.parse(window.localStorage.getItem(SENT_KEY) || '[]'); } catch (e) { return []; }
  }
  function post(body) {
    var extra = config.waitlistExtraFields || {};
    var payload = {};
    Object.keys(extra).forEach(function (k) { payload[k] = extra[k]; });
    Object.keys(body).forEach(function (k) { payload[k] = body[k]; });
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : null;
    return fetch(config.waitlistEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': config.waitlistContentType || 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl ? ctrl.signal : undefined,
    }).then(function (res) {
      if (!res.ok) throw new Error('The waitlist service returned ' + res.status);
      return res.json().catch(function () { return {}; });
    }).then(function (data) {
      if (data && (data.success === false || data.success === 'false')) {
        var err = new Error(data.message || 'The waitlist service did not accept the request');
        err.code = 'not_delivered';
        throw err;
      }
      return data;
    }).then(function (r) { if (timer) clearTimeout(timer); return r; }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  var RemoteStore = {
    mode: 'remote',
    list: function () { return sentLog(); },
    has: function (email) {
      var e = String(email).trim().toLowerCase();
      return sentLog().indexOf(e) !== -1;
    },
    save: function (entry) {
      var body = {};
      Object.keys(entry).forEach(function (k) { body[k] = entry[k]; });
      body._subject = 'New Vayora waitlist sign-up: ' + entry.name;
      body._replyto = entry.email;
      return post(body).then(function () {
        try {
          var log = sentLog(); log.push(String(entry.email).toLowerCase());
          window.localStorage.setItem(SENT_KEY, JSON.stringify(log));
        } catch (e) { /* storage blocked: duplicates just aren't remembered */ }
        return { ok: true, mode: 'remote' };
      });
    },
    // Sends a customer review to the team's inbox. Nothing is published until the team adds it to reviews-data.js.
    sendReview: function (r) {
      var stars = new Array(r.rating + 1).join('★') + new Array(6 - r.rating).join('☆');
      return post({
        _subject: 'New Vayora review: ' + r.rating + '/5 from ' + r.name,
        _replyto: r.email,
        rating: r.rating + ' out of 5 (' + stars + ')',
        name: r.name,
        city: r.city || '(not given)',
        email: r.email,
        title: r.title || '(none)',
        review: r.text,
        consentToPublish: 'Yes. The reviewer confirmed they have used Vayora and agreed to publication of name, city, rating and review.',
        submittedAt: new Date().toISOString(),
        page: window.location.href,
        _honey: r.honey || '',
      }).then(function () { return { ok: true, mode: 'remote' }; });
    },
    // Sends a removal request to the same inbox as sign-ups. The team removes the address by hand.
    unsubscribe: function (email, honey) {
      var e = String(email).trim().toLowerCase();
      return post({
        _subject: 'Vayora waitlist: unsubscribe request from ' + e,
        _replyto: e,
        email: e,
        request: 'Remove this email address from the Vayora waitlist and stop sending launch updates.',
        requestedAt: new Date().toISOString(),
        _honey: honey || '',
      }).then(function () {
        try {
          var log = sentLog().filter(function (x) { return x !== e; });
          window.localStorage.setItem(SENT_KEY, JSON.stringify(log));
        } catch (err) { /* ignore */ }
        return { ok: true, mode: 'remote' };
      });
    },
    clear: function () { try { window.localStorage.removeItem(SENT_KEY); } catch (e) { /* ignore */ } },
  };

  window.VayoraWaitlist = config.waitlistEndpoint ? RemoteStore : LocalStore;
})();
