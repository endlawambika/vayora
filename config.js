/*
 * ClimaPod site configuration.
 *
 * waitlistEndpoint: leave as null to run the waitlist as a clearly labelled prototype that
 * stores sign-ups in this browser's localStorage only.
 *
 * To collect real sign-ups, set it to a URL that accepts a JSON POST, for example:
 *   - a Formspree form endpoint            https://formspree.io/f/xxxxxxx
 *   - a Google Apps Script web app          https://script.google.com/macros/s/.../exec
 *   - your own API route                    https://api.example.com/waitlist
 * See README.md › "Connecting a real backend". When an endpoint is set, the form's
 * prototype notice is replaced automatically.
 */
window.CLIMAPOD_CONFIG = Object.assign(
  {
    waitlistEndpoint: null,
    // Google Apps Script web apps reject JSON preflight requests; use 'text/plain' for them.
    waitlistContentType: 'application/json',
    storageKey: 'climapod.waitlist.v1',
  },
  window.CLIMAPOD_CONFIG || {}
);
