/*
 * Waitlist storage adapter.
 * One interface, two implementations:
 *   - LocalStore: prototype mode, saves to localStorage (or memory if storage is blocked)
 *   - RemoteStore: POSTs JSON to CLIMAPOD_CONFIG.waitlistEndpoint
 * main.js only ever calls ClimaPodWaitlist.save(entry) / .has(email) / .list() / .clear().
 */
(function () {
  'use strict';
  var config = window.CLIMAPOD_CONFIG || {};
  var KEY = config.storageKey || 'climapod.waitlist.v1';
  var memory = [];

  function storageAvailable() {
    try {
      var t = '__climapod_test__';
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

  var RemoteStore = {
    mode: 'remote',
    list: function () { return []; },
    has: function () { return false; },
    save: function (entry) {
      return fetch(config.waitlistEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': config.waitlistContentType || 'application/json', Accept: 'application/json' },
        body: JSON.stringify(entry),
      }).then(function (res) {
        if (!res.ok) throw new Error('The waitlist service returned ' + res.status);
        return { ok: true, mode: 'remote' };
      });
    },
    clear: function () {},
  };

  window.ClimaPodWaitlist = config.waitlistEndpoint ? RemoteStore : LocalStore;
})();
