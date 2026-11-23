/*
 * Vayora site configuration.
 *
 * waitlistEndpoint: where waitlist sign-ups are sent (JSON POST).
 *   Currently FormSubmit (formsubmit.co), which emails every sign-up to the address in the URL.
 *   First use: the first sign-up triggers an "Activate Form" email to that address. Click it once;
 *   until then FormSubmit holds sign-ups and the form shows a "couldn't add you" message.
 *   After activating, FormSubmit offers a random-string alias you can paste here in place of the
 *   address, so the address no longer appears in the page source.
 *   Set to null to switch back to the browser-only prototype.
 * waitlistExtraFields: FormSubmit options sent with every sign-up.
 *
 * checkout: the Buy Now checkout (see CHECKOUT.md).
 *   apiBase      Your Supabase Edge Functions URL, e.g. 'https://abcdefgh.supabase.co/functions/v1'.
 *                While null, the checkout page explains that online payment isn't switched on yet.
 *   Prices here are for display only. The amount charged is always calculated on the server from
 *   PRODUCT_PRICE_INR, SHIPPING_FEE_INR and TAX_RATE_PERCENT; keep both in step.
 */
window.VAYORA_CONFIG = Object.assign(
  {
    waitlistEndpoint: 'https://formsubmit.co/ajax/sayantani.pgpm27g@greatlakes.edu.in',
    waitlistContentType: 'application/json',
    waitlistExtraFields: { _template: 'table', _captcha: 'false' },
    storageKey: 'vayora.waitlist.v1',
    checkout: {
      apiBase: null,
      unitPriceInr: 4999,
      // Original price shown struck through next to unitPriceInr. Set to null to hide the discount.
      mrpInr: 7999,
      shippingFeeInr: 0,
      taxRatePercent: 0,
      // EMI is offered through Razorpay. Tenures shown on the checkout page; interest is set by the bank.
      emi: { enabled: true, tenures: [3, 6, 9, 12] },
      maxQuantity: 5,
      // Days from order to delivery, shown at checkout and on the confirmation page.
      deliveryDays: 7,
      // While apiBase is null, checkout runs as a clearly labelled demo: sample payment details,
      // no money taken. Set to false to show "payment isn't available" instead.
      demoPayments: true,
      productName: 'Vayora – Portable All-in-One Personal Comfort Device',
      razorpayScript: 'https://checkout.razorpay.com/v1/checkout.js',
      supportPhone: '9999555555',
    },
  },
  window.VAYORA_CONFIG || {}
);
