# Vayora checkout: setup guide

The website (GitHub Pages) now has a working checkout: **Buy Now → checkout page → Razorpay payment → order confirmation page → confirmation emails**. GitHub Pages can only serve files, so the parts that need secrets run on a small **Supabase** backend (a database plus five server functions). Until you complete the steps below, no payment can be attempted: if someone clicks Pay, the checkout shows a one-line message that the order can't be placed yet and that no payment has been taken.

## How it works

1. **Checkout page** (`checkout.html`): the customer enters their details and chooses a quantity. Totals update as the quantity changes.
2. **create-order**: the server validates the details, calculates the amount from **its own** price settings, creates a Razorpay order and saves the order (status *created*). The same details and quantity always reuse the same order, so double clicks and retries never create duplicates.
3. **Razorpay Checkout** opens. The customer pays by UPI, card or net banking: whatever your Razorpay account has switched on.
4. **verify-payment**: the server checks Razorpay's signature using your key secret, confirms with Razorpay that the payment belongs to this order, matches the amount and is captured (it captures it if needed), then marks the order *paid*. Nothing else can mark an order paid.
5. **Emails**: the customer gets "Your Vayora Order Has Been Confirmed!" and the admin gets a new-order notification. Each is sent at most once; a failed send is retried on the next webhook delivery.
6. **order-success.html** asks the server for the order and shows it **only if it is paid**. It shows "A confirmation email … has been sent" only when the email provider accepted it.
7. **razorpay-webhook**: Razorpay also tells the server directly when a payment is captured or fails. If the customer closes the browser after paying, the order is still confirmed and the emails still go out.
8. **Failed or cancelled payment**: the customer sees **Payment Unsuccessful** with Retry Payment, Return to Cart and Contact Support. The order is recorded as *failed* or *cancelled*, never as paid. Retrying reuses the same order.

## What you need

| Service | Why | Cost | Credentials |
|---|---|---|---|
| **Supabase** (supabase.com) | Database and server functions | Free tier | Provided automatically to the functions |
| **Razorpay** (razorpay.com) | Payments | Test Mode is free and immediate; live payments need account activation (KYC) | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |
| **Brevo** (brevo.com) *or* **Resend** (resend.com) | Order emails | Free tiers | `BREVO_API_KEY` or `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL` |

**Which email service?** Use **Brevo** if you don't own a domain: it can send from a single email address you verify (Brevo → Senders). Resend needs a domain you own and have verified. Without a domain, Resend only sends to your own account's address.

## Setup, step by step

You need Node.js 18+ on your computer (for `npx`). Run the commands from the project folder (the one containing `supabase/`).

### 1. Create the Supabase project and the orders table
1. Create a project at supabase.com. Note its **project reference**, the `abcdefgh` in `https://abcdefgh.supabase.co`.
2. In a terminal:
   ```bash
   npx supabase login
   npx supabase link --project-ref abcdefgh
   npx supabase db push            # creates the orders and payment_events tables
   ```

### 2. Get Razorpay keys (start in Test Mode)
Razorpay Dashboard → switch to **Test Mode** → Account & Settings → **API Keys** → Generate. You get a **Key ID** (`rzp_test_…`) and a **Key Secret**. The secret is shown once; keep it private.

### 3. Set up email
- **Brevo:** Senders, Domains & Dedicated IPs → add and verify your sender address. Then SMTP & API → **API Keys** → create a key.
- **Resend:** add and verify your domain, then create an API key.

### 4. Store the secrets on Supabase
Copy `supabase/.env.example` to `supabase/.env`, fill it in (it explains every line), then:
```bash
npx supabase secrets set --env-file supabase/.env
```
Never commit the filled-in `supabase/.env`. The Razorpay secret and email keys live only on Supabase, never in the website.

### 5. Deploy the functions
```bash
npx supabase functions deploy create-order verify-payment record-payment-failure get-order razorpay-webhook
```
`supabase/config.toml` already turns off Supabase's login check for these five. They are called by shoppers and by Razorpay, and each one checks order access tokens or Razorpay signatures itself.

### 6. Add the Razorpay webhook
Razorpay Dashboard (Test Mode) → Account & Settings → **Webhooks** → Add New Webhook:
- **URL:** `https://abcdefgh.supabase.co/functions/v1/razorpay-webhook`
- **Secret:** any long random string. Put the same value in `RAZORPAY_WEBHOOK_SECRET` and run step 4 again.
- **Events:** `payment.captured`, `payment.failed`, `order.paid`

### 7. Switch the website on
Edit `assets/js/config.js` (on GitHub, use the pencil icon) and set:
```js
checkout: {
  apiBase: 'https://abcdefgh.supabase.co/functions/v1',
  ...
```
Commit. After a minute or two, Pay opens the Razorpay window.

### 8. Test every path in Test Mode
In Test Mode no real money moves. Razorpay's Test Mode documentation lists test cards and UPI IDs that succeed or fail.
- [ ] **Success:** pay with a successful test method. You land on "Order Successfully Placed!", the customer and admin emails arrive, and the order shows *paid* in Supabase → Table Editor → `orders`.
- [ ] **Failure:** use a failing test method. You see "Payment Unsuccessful" and the order shows *failed*.
- [ ] **Cancel:** close the Razorpay window. You see "Payment Unsuccessful" and the order shows *cancelled*.
- [ ] **Retry:** after a failure, Retry Payment completes the same order (no second order row).
- [ ] **Webhook:** Razorpay → Webhooks shows successful deliveries; the `payment_events` table fills up.

### 9. Going live
1. Complete Razorpay's account activation (KYC, business and bank details). Razorpay reviews your website during activation and expects policy pages (such as terms, refunds and cancellations, shipping, privacy and contact details). Write these to match how you actually operate.
2. Generate **Live** keys, create the same webhook in **Live** mode, put the live values in `supabase/.env`, and run step 4 again.
3. Set `ALLOWED_ORIGIN` to your site's address (e.g. `https://your-username.github.io`) so only your site can call the functions.

## Prices, shipping and tax

The amount charged is calculated on the server from `PRODUCT_PRICE_INR`, `SHIPPING_FEE_INR` and `TAX_RATE_PERCENT` (Supabase secrets). The website shows the same numbers from `assets/js/config.js` (`unitPriceInr`, `shippingFeeInr`, `taxRatePercent`). Change both together. If they ever differ, the checkout shows and charges the server's total. Shipping and tax are 0 as delivered, and the tax line only appears when a tax rate is set. Whether ₹4,999 includes GST is a decision for you and your accountant.

**Free shipping.** With `shippingFeeInr` at 0 (and `SHIPPING_FEE_INR` at 0 on the server), the checkout shows Shipping as **FREE** and a "Free shipping on every order, delivered anywhere in India" note. If you ever set a fee, the note disappears and the amount is shown instead.

**Original price and discount.** The site shows ₹6,999 struck through next to the ₹4,999 you charge, with "Save ₹2,000 · 28% off" and a "You save" line at checkout. Customers are always charged `unitPriceInr` (₹4,999); `mrpInr` (6999) is only for display. If the discount ends, set `mrpInr: null` in `assets/js/config.js` to hide it at checkout, and update the struck-through ₹6,999 on the Home, Product and Pricing pages, the menu and the announcement bar. Only show an original price you genuinely sell at, or have sold at.

## EMI

Checkout offers **Pay in full** or **Pay in EMI**. Choosing EMI shows the monthly amount for 3, 6, 9 and 12 months *before interest* and opens Razorpay's payment window with its EMI options first. The customer picks their bank and plan there and sees the exact monthly amount, including interest, before confirming. Vayora receives the full amount; the bank or EMI provider collects the instalments. Payment checks on the server are the same as for any other method.

What you need to do in Razorpay:

- **Credit card EMI** works on Razorpay Standard Checkout by default. HDFC Bank and SBI credit card EMI need a request in the Razorpay Dashboard (Payment Methods → EMI).
- **Debit card EMI, cardless EMI and Pay Later** are not on by default. Request them from Razorpay support if you want them.
- **Minimum amounts** are set by each bank or provider. Some debit card EMI needs ₹5,000 or more, so one Vayora at ₹4,999 may not qualify; two will.
- **No Cost EMI** (you pay the interest instead of the customer) is a separate Razorpay offer. The site does not claim No Cost EMI; add it only after you set it up in Razorpay.
- Instant refunds aren't supported for EMI, cardless EMI and Pay Later payments.

To change the tenures shown or switch EMI off, edit `emi` in `assets/js/config.js`, e.g. `emi: { enabled: true, tenures: [3, 6, 9, 12] }`, or set `enabled: false` to hide it.

## Day to day

- **See orders:** Supabase → Table Editor → `orders` (customer, address, amounts, `payment_status`, `order_status`, Razorpay `payment_id`, email status). You also get an admin email for each paid order.
- **Refunds:** issue them in the Razorpay Dashboard. The site doesn't refund automatically.
- **Logs:** Supabase → Edge Functions → each function → Logs. Problems are logged with the order ID, for example a failed signature check, an email that didn't send, or a second payment on an already-paid order (refund that one).

## Files

```
supabase/
  config.toml                         function settings (public endpoints)
  .env.example                        every secret, explained
  migrations/20261116170000_checkout.sql   orders + payment_events tables (row-level security on)
  functions/
    create-order/  verify-payment/  record-payment-failure/  get-order/  razorpay-webhook/
    _shared/                          config, pricing, validation, Razorpay, database, email, order logic
  tests/                              backend tests (real Postgres) and the local server used by browser tests
src/pages/checkout.html, src/pages/order-success.html, src/assets/js/checkout.js
```

## Running the tests yourself

The backend tests run the real function code against a real Postgres database, with Razorpay and the email provider simulated:
```bash
cd supabase/tests
npm install
DATABASE_URL=postgres://postgres@localhost:5432/postgres npm test   # a Postgres with the migration applied
```
On a plain Postgres (not Supabase), create the `anon` and `authenticated` roles before applying the migration.

## Demo checkout (while payments aren't connected)

Until `checkout.apiBase` is set in `assets/js/config.js`, the checkout runs as a **clearly labelled demo**:

- Visitors choose **UPI, Credit Card, Debit Card or Net Banking** and see the details screen for that method, filled with sample data (a sample UPI ID, test card numbers, a list of banks). The fields are read-only, so no real card, UPI or bank details can be typed in.
- A yellow note says "Demo checkout – no money is taken".
- **Pay Now** shows "Processing demo payment…", then "Demo payment successful – Booking taken", then a **Booking Taken!** page. That page shows "Time to enjoy breezy air!", "Get your product delivered in 7 days" with the expected date, and the booking details, and it is marked "Demo – no money was taken".
- Nothing is sent anywhere: no order is saved, no email goes out and nothing ships.

The demo switches itself off as soon as you connect Razorpay (set `apiBase`). From then on, customers pay in Razorpay's real window and see the real confirmation page, which also shows the happy message and the 7-day delivery date. To turn the demo off before that, set `demoPayments: false`. To change the delivery promise, edit `deliveryDays` (7).
