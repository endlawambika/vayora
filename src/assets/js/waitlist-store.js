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
  var RemoteStore = {
    mode: 'remote',
    list: function () { return sentLog(); },
    has: function (email) {
      var e = String(email).trim().toLowerCase();
      return sentLog().indexOf(e) !== -1;
    },
    save: function (entry) {
      var body = {};
      var extra = config.waitlistExtraFields || {};
      Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
      Object.keys(entry).forEach(function (k) { body[k] = entry[k]; });
      body._subject = 'New Vayora waitlist sign-up: ' + entry.name;
      body._replyto = entry.email;
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : null;
      return fetch(config.waitlistEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': config.waitlistContentType || 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl ? ctrl.signal : undefined,
      }).then(function (res) {
        if (!res.ok) throw new Error('The waitlist service returned ' + res.status);
        return res.json().catch(function () { return {}; });
      }).then(function (data) {
        if (data && (data.success === false || data.success === 'false')) {
          var err = new Error(data.message || 'The waitlist service did not accept the sign-up');
          err.code = 'not_delivered';
          throw err;
        }
        try {
          var log = sentLog(); log.push(String(entry.email).toLowerCase());
          window.localStorage.setItem(SENT_KEY, JSON.stringify(log));
        } catch (e) { /* storage blocked: duplicates just aren't remembered */ }
        return { ok: true, mode: 'remote' };
      }).then(function (r) { if (timer) clearTimeout(timer); return r; }, function (e) { if (timer) clearTimeout(timer); throw e; });
    },
    clear: function () { try { window.localStorage.removeItem(SENT_KEY); } catch (e) { /* ignore */ } },
  };

  window.VayoraWaitlist = config.waitlistEndpoint ? RemoteStore : LocalStore;
})();
