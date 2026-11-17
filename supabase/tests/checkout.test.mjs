// Backend tests for the Vayora checkout. Run:  cd supabase/tests && npm install && npm test
// They call the real HTTP handlers of each Edge Function, against a real Postgres with the migration applied.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { pool, baseEnv, envSource, makeWorld, razorpaySuccess, webhookRequest, resetDb, goodCustomer, SECRETS } from './harness.mjs';
import { createOrderHandler, verifyPaymentHandler, recordFailureHandler, getOrderHandler, webhookHandler } from '../functions/_shared/http.ts';

let world, env, logs;
const rt = () => ({ env: envSource(env), fetch: world.fetch, log: (...a) => logs.push(a.join(' ')) });
const post = (handler, body) => handler(new Request('http://fn.test/x', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', origin: 'https://site.test' } }), rt());
const call = async (handler, body) => { const r = await post(handler, body); return { status: r.status, body: await r.json(), headers: r.headers }; };
const get = async (id, token) => { const r = await getOrderHandler(new Request(`http://fn.test/get-order?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`), rt()); return { status: r.status, body: await r.json() }; };
const row = async (id) => (await pool.query('select * from public.orders where id=$1', [id])).rows[0];
const key = () => 'k_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
const rzpCreates = () => world.calls.filter((c) => c.url === 'https://api.razorpay.com/v1/orders').length;
const secretLeak = (obj) => JSON.stringify(obj).includes(SECRETS.keySecret) || JSON.stringify(obj).includes(SECRETS.webhookSecret);

async function newOrder(over = {}) {
  const r = await call(createOrderHandler, { customer: goodCustomer(), quantity: 1, idempotencyKey: key(), ...over });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}

before(async () => { await pool.query('select 1'); });
after(async () => { await pool.end(); });
beforeEach(async () => { await resetDb(); world = makeWorld(); env = baseEnv(); logs = []; });

// ---------------------------------------------------------------- configuration
test('missing credentials → 503 naming exactly what to configure', async () => {
  env = baseEnv({ RAZORPAY_KEY_SECRET: '', PRODUCT_PRICE_INR: '' });
  const r = await call(createOrderHandler, { customer: goodCustomer(), quantity: 1, idempotencyKey: key() });
  assert.equal(r.status, 503);
  assert.equal(r.body.error, 'checkout_not_configured');
  assert.deepEqual(r.body.missing.sort(), ['PRODUCT_PRICE_INR', 'RAZORPAY_KEY_SECRET']);
  assert.equal(world.calls.length, 0, 'nothing is called without configuration');
});

test('HTTP: CORS preflight, wrong method, unexpected errors are hidden', async () => {
  const pre = await createOrderHandler(new Request('http://fn.test/x', { method: 'OPTIONS', headers: { origin: 'https://site.test' } }), rt());
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), '*');
  env = baseEnv({ ALLOWED_ORIGIN: 'https://site.test, https://other.test' });
  const pre2 = await createOrderHandler(new Request('http://fn.test/x', { method: 'OPTIONS', headers: { origin: 'https://other.test' } }), rt());
  assert.equal(pre2.headers.get('access-control-allow-origin'), 'https://other.test');
  const wrong = await createOrderHandler(new Request('http://fn.test/x', { method: 'GET' }), rt());
  assert.equal(wrong.status, 405);
  world.razorpayDown = true;
  const r = await call(createOrderHandler, { customer: goodCustomer(), quantity: 1, idempotencyKey: key() });
  assert.equal(r.status, 500);
  assert.deepEqual(r.body, { ok: false, error: 'server_error' });
  assert.equal((await pool.query('select count(*)::int n from public.orders')).rows[0].n, 0, 'no order saved when Razorpay is down');
});

// ---------------------------------------------------------------- validation
test('validation: email, Indian mobile, PIN, state, quantity', async () => {
  const bad = await call(createOrderHandler, {
    customer: goodCustomer({ email: 'nope@', mobile: '12345', pinCode: '012345', state: 'Atlantis', street: '', name: 'A' }),
    quantity: 1, idempotencyKey: key(),
  });
  assert.equal(bad.status, 422);
  assert.deepEqual(Object.keys(bad.body.fields).sort(), ['email', 'mobile', 'name', 'pinCode', 'state', 'street']);
  for (const q of [0, 6, 1.5, 'two']) {
    const r = await call(createOrderHandler, { customer: goodCustomer(), quantity: q, idempotencyKey: key() });
    assert.equal(r.status, 422, 'quantity ' + q);
  }
  for (const m of ['9876543210', '+919876543210', '09876543210', '98765 43210', '+91 98765-43210']) {
    const r = await call(createOrderHandler, { customer: goodCustomer({ mobile: m }), quantity: 1, idempotencyKey: key() });
    assert.equal(r.status, 200, 'mobile ' + m);
  }
  const outside = await call(createOrderHandler, { customer: goodCustomer({ country: 'Nepal' }), quantity: 1, idempotencyKey: key() });
  assert.equal(outside.status, 422);
});

// ---------------------------------------------------------------- order creation
test('create order: server price, Razorpay order, saved row, no secrets returned', async () => {
  const b = await newOrder({ quantity: 2, amount: 1, price: 1 }); // client-sent prices are ignored
  assert.match(b.orderId, /^VAY-\d{6}-[A-Z2-9]{6}$/);
  assert.equal(b.razorpay.amount, 999800);
  assert.equal(b.razorpay.currency, 'INR');
  assert.equal(b.razorpay.key, SECRETS.keyId);
  assert.equal(b.summary.totalAmount, '₹9,998');
  assert.ok(!secretLeak(b), 'response must not contain secrets');
  const call0 = world.calls.find((c) => c.url === 'https://api.razorpay.com/v1/orders');
  const sent = JSON.parse(call0.body);
  assert.equal(sent.amount, 999800);
  assert.equal(sent.receipt, b.orderId);
  const r = await row(b.orderId);
  assert.equal(r.payment_status, 'created');
  assert.equal(r.order_status, 'pending_payment');
  assert.equal(r.razorpay_order_id, b.razorpay.orderId);
  assert.equal(r.email, 'ananya.rao@example.com');
  assert.equal(r.mobile, '9876543210');
  assert.equal(r.shipping_address, 'Flat 4B, Lake View Apartments, Rajiv Gandhi Salai, Thoraipakkam, Chennai, Tamil Nadu 600097, India');
  assert.equal(r.unit_price_paise, 499900);
});

test('shipping and tax are applied when configured', async () => {
  env = baseEnv({ SHIPPING_FEE_INR: '99', TAX_RATE_PERCENT: '18' });
  const b = await newOrder({ quantity: 1 });
  // 4999 + 99 + 18% of 4999 (899.82)
  assert.equal(b.razorpay.amount, 499900 + 9900 + 89982);
  assert.equal(b.summary.tax, '₹899.82');
});

test('duplicate prevention: same checkout attempt reuses one order; concurrent clicks too', async () => {
  const k = key();
  const a = await newOrder({ idempotencyKey: k });
  const again = await newOrder({ idempotencyKey: k });
  assert.equal(again.orderId, a.orderId);
  assert.equal(again.razorpay.orderId, a.razorpay.orderId);
  assert.equal(rzpCreates(), 1);
  const changed = await call(createOrderHandler, { customer: goodCustomer(), quantity: 3, idempotencyKey: k });
  assert.equal(changed.status, 409);
  const k2 = key();
  const results = await Promise.all([1, 2, 3, 4].map(() => call(createOrderHandler, { customer: goodCustomer(), quantity: 1, idempotencyKey: k2 })));
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(new Set(results.map((r) => r.body.orderId)).size, 1, 'one order for four simultaneous clicks');
  assert.equal((await pool.query('select count(*)::int n from public.orders where idempotency_key=$1', [k2])).rows[0].n, 1);
});

// ---------------------------------------------------------------- successful payment
test('successful payment: signature verified, payment captured, order confirmed, emails sent once', async () => {
  const o = await newOrder({ quantity: 2 });
  const rp = razorpaySuccess(world, o.razorpay.orderId, { status: 'authorized' }); // not yet captured → server captures it
  const v = await call(verifyPaymentHandler, { orderId: o.orderId, accessToken: o.accessToken, ...rp });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  assert.equal(world.payments.get(rp.razorpay_payment_id).status, 'captured');
  const r = await row(o.orderId);
  assert.equal(r.payment_status, 'paid');
  assert.equal(r.order_status, 'confirmed');
  assert.equal(r.payment_id, rp.razorpay_payment_id);
  assert.equal(r.verified_by, 'checkout');
  assert.equal(r.customer_email_status, 'sent');
  assert.equal(r.admin_email_status, 'sent');
  assert.equal(world.sent.length, 2);
  const [cust, admin] = world.sent;
  assert.equal(cust.body.subject, 'Your Vayora Order Has Been Confirmed!');
  assert.deepEqual(cust.body.to, [{ email: 'ananya.rao@example.com', name: 'Ananya Rao' }]);
  assert.deepEqual(cust.body.sender, { name: 'Team Vayora', email: 'orders@vayora.test' });
  for (const s of ['Hello Ananya Rao,', 'Thank you for choosing Vayora!', o.orderId, 'Vayora Portable Personal Comfort Device', '₹9,998', 'Paid', 'Chennai, Tamil Nadu 600097', 'Designed for the Vayu You Live In.', '9564910918', 'Team Vayora'])
    assert.ok(cust.body.textContent.includes(s), 'customer email text has ' + s);
  assert.ok(cust.body.htmlContent.includes('https://vayora.test/assets/img/brand/vayora-logo-email.png'), 'logo in email');
  assert.equal(admin.body.to[0].email, 'admin@vayora.test');
  for (const s of [o.orderId, 'Ananya Rao', 'ananya.rao@example.com', '+91 9876543210', 'Quantity: 2', '₹9,998', rp.razorpay_payment_id, 'Order Date'])
    assert.ok(admin.body.textContent.includes(s), 'admin email has ' + s);
  // repeat verification (refresh, double submit) → no second email
  const again = await call(verifyPaymentHandler, { orderId: o.orderId, accessToken: o.accessToken, ...rp });
  assert.equal(again.status, 200);
  assert.equal(again.body.alreadyConfirmed, true);
  assert.equal(world.sent.length, 2);
  // the success page data
  const g = await get(o.orderId, o.accessToken);
  assert.equal(g.body.confirmed, true);
  assert.equal(g.body.order.paymentStatus, 'Paid');
  assert.equal(g.body.order.totalAmount, '₹9,998');
  assert.equal(g.body.order.confirmationEmail, 'sent');
  // creating with the same key after payment returns the paid order, not a new payment
  const k = (await row(o.orderId)).idempotency_key;
  const after = await newOrder({ idempotencyKey: k, quantity: 2 });
  assert.equal(after.status, 'paid');
  assert.equal(after.razorpay, null);
});

test('Resend provider payload', async () => {
  env = baseEnv({ EMAIL_PROVIDER: 'resend', BREVO_API_KEY: '', RESEND_API_KEY: 're_test' });
  const o = await newOrder();
  await call(verifyPaymentHandler, { orderId: o.orderId, accessToken: o.accessToken, ...razorpaySuccess(world, o.razorpay.orderId) });
  assert.equal(world.sent[0].provider, 'resend');
  assert.equal(world.sent[0].headers.Authorization, 'Bearer re_test');
  assert.deepEqual(world.sent[0].body.to, ['ananya.rao@example.com']);
  assert.equal(world.sent[0].body.from, 'Team Vayora <orders@vayora.test>');
});

// ---------------------------------------------------------------- tampering
test('never paid without verification: bad signature, wrong order, wrong amount, wrong token', async () => {
  const o = await newOrder();
  const rp = razorpaySuccess(world, o.razorpay.orderId);
  const bad = await call(verifyPaymentHandler, { orderId: o.orderId, accessToken: o.accessToken, ...rp, razorpay_signature: 'f'.repeat(64) });
  assert.equal(bad.status, 400);
  const tok = await call(verifyPaymentHandler, { orderId: o.orderId, accessToken: 'wrong', ...rp });
  assert.equal(tok.status, 404);
  // a genuine payment for a different (cheaper) order cannot confirm this one
  const other = await newOrder();
  const rp2 = razorpaySuccess(world, other.razorpay.orderId);
  const swap = await call(verifyPaymentHandler, { orderId: o.orderId, accessToken: o.accessToken, ...rp2 });
  assert.equal(swap.status, 400);
  // correct signature but Razorpay reports a different amount
  const o3 = await newOrder();
  const rp3 = razorpaySuccess(world, o3.razorpay.orderId, { amount: 100 });
  const amt = await call(verifyPaymentHandler, { orderId: o3.orderId, accessToken: o3.accessToken, ...rp3 });
  assert.equal(amt.status, 402);
  assert.equal(amt.body.reason, 'amount_mismatch');
  // correct signature but payment failed at Razorpay
  const o4 = await newOrder();
  const rp4 = razorpaySuccess(world, o4.razorpay.orderId, { status: 'failed' });
  const f4 = await call(verifyPaymentHandler, { orderId: o4.orderId, accessToken: o4.accessToken, ...rp4 });
  assert.equal(f4.status, 402);
  for (const id of [o.orderId, o3.orderId, o4.orderId]) assert.notEqual((await row(id)).payment_status, 'paid');
  assert.equal(world.sent.length, 0, 'no emails for unverified payments');
  const g = await get(o.orderId, o.accessToken);
  assert.equal(g.body.confirmed, false, 'success page does not show unpaid orders');
  const g2 = await get(o.orderId, 'guess');
  assert.equal(g2.status, 404);
});

test('database refuses a paid order without a payment id', async () => {
  const o = await newOrder();
  await assert.rejects(pool.query("update public.orders set payment_status='paid', order_status='confirmed' where id=$1", [o.orderId]), /paid_needs_payment/);
});

// ---------------------------------------------------------------- failed and cancelled payments
test('cancelled and failed payments are recorded, can be retried, never override a paid order', async () => {
  const o = await newOrder();
  const c = await call(recordFailureHandler, { orderId: o.orderId, accessToken: o.accessToken, status: 'cancelled', reason: 'Checkout closed' });
  assert.equal(c.body.recorded, true);
  let r = await row(o.orderId);
  assert.equal(r.payment_status, 'cancelled'); assert.equal(r.order_status, 'cancelled');
  const f = await call(recordFailureHandler, { orderId: o.orderId, accessToken: o.accessToken, status: 'failed', reason: 'BAD_REQUEST_ERROR: Payment declined' });
  r = await row(o.orderId);
  assert.equal(r.payment_status, 'failed'); assert.equal(r.order_status, 'payment_failed'); assert.equal(f.body.recorded, true);
  assert.equal(world.sent.length, 0);
  // retry with the same details reuses the same order and Razorpay order
  const k = r.idempotency_key;
  const retry = await newOrder({ idempotencyKey: k });
  assert.equal(retry.orderId, o.orderId);
  assert.equal(rzpCreates(), 1);
  const v = await call(verifyPaymentHandler, { orderId: o.orderId, accessToken: o.accessToken, ...razorpaySuccess(world, o.razorpay.orderId) });
  assert.equal(v.status, 200);
  assert.equal((await row(o.orderId)).payment_status, 'paid');
  const late = await call(recordFailureHandler, { orderId: o.orderId, accessToken: o.accessToken, status: 'failed' });
  assert.equal(late.body.recorded, false);
  assert.equal((await row(o.orderId)).payment_status, 'paid');
  const wrong = await call(recordFailureHandler, { orderId: o.orderId, accessToken: 'x', status: 'failed' });
  assert.equal(wrong.status, 404);
});

// ---------------------------------------------------------------- webhooks
const capturedEvent = (o, paymentId, amount) => ({
  entity: 'event', event: 'payment.captured', contains: ['payment'],
  payload: { payment: { entity: { id: paymentId, entity: 'payment', amount: amount ?? o.razorpay.amount, currency: 'INR', status: 'captured', order_id: o.razorpay.orderId } } },
  created_at: 1763300000,
});

test('webhook: signature required; captured payment confirms the order (browser closed before verification)', async () => {
  const o = await newOrder();
  const forged = await webhookHandler(webhookRequest(capturedEvent(o, 'pay_X'), { secret: 'wrong' }), rt());
  assert.equal(forged.status, 400);
  assert.equal((await row(o.orderId)).payment_status, 'created');
  const res = await webhookHandler(webhookRequest(capturedEvent(o, 'pay_WEBHOOK1'), { eventId: 'evt_1' }), rt());
  assert.equal(res.status, 200);
  const r = await row(o.orderId);
  assert.equal(r.payment_status, 'paid'); assert.equal(r.verified_by, 'webhook'); assert.equal(r.payment_id, 'pay_WEBHOOK1');
  assert.equal(world.sent.length, 2);
  // Razorpay redelivers the same event → ignored
  const dup = await webhookHandler(webhookRequest(capturedEvent(o, 'pay_WEBHOOK1'), { eventId: 'evt_1' }), rt());
  assert.equal((await dup.json()).duplicate, true);
  // order.paid for the same payment (different event) → still one confirmation, no new emails
  const paidEvt = { event: 'order.paid', payload: { order: { entity: { id: o.razorpay.orderId, status: 'paid' } }, payment: { entity: { id: 'pay_WEBHOOK1', amount: o.razorpay.amount, currency: 'INR', status: 'captured', order_id: o.razorpay.orderId } } } };
  await webhookHandler(webhookRequest(paidEvt, { eventId: 'evt_2' }), rt());
  assert.equal(world.sent.length, 2);
  assert.equal((await pool.query('select count(*)::int n from public.payment_events')).rows[0].n, 2);
});

test('webhook: wrong amount never confirms; payment.failed marks failed but not a paid order', async () => {
  const o = await newOrder();
  await webhookHandler(webhookRequest(capturedEvent(o, 'pay_LOW', 100)), rt());
  assert.equal((await row(o.orderId)).payment_status, 'created');
  const failedEvt = { event: 'payment.failed', payload: { payment: { entity: { id: 'pay_F', order_id: o.razorpay.orderId, amount: o.razorpay.amount, currency: 'INR', status: 'failed', error_description: 'Payment was declined by the bank' } } } };
  await webhookHandler(webhookRequest(failedEvt), rt());
  let r = await row(o.orderId);
  assert.equal(r.payment_status, 'failed'); assert.equal(r.failure_reason, 'Payment was declined by the bank');
  await call(verifyPaymentHandler, { orderId: o.orderId, accessToken: o.accessToken, ...razorpaySuccess(world, o.razorpay.orderId) });
  await webhookHandler(webhookRequest({ ...failedEvt, payload: { payment: { entity: { ...failedEvt.payload.payment.entity, id: 'pay_F2' } } } }), rt());
  r = await row(o.orderId);
  assert.equal(r.payment_status, 'paid', 'a late failure event cannot undo a verified payment');
});

test('browser verification and webhook at the same moment → one confirmation, one set of emails', async () => {
  const o = await newOrder();
  const rp = razorpaySuccess(world, o.razorpay.orderId);
  await Promise.all([
    call(verifyPaymentHandler, { orderId: o.orderId, accessToken: o.accessToken, ...rp }),
    webhookHandler(webhookRequest(capturedEvent(o, rp.razorpay_payment_id)), rt()),
    call(verifyPaymentHandler, { orderId: o.orderId, accessToken: o.accessToken, ...rp }),
  ]);
  assert.equal((await row(o.orderId)).payment_status, 'paid');
  assert.equal(world.sent.length, 2, 'customer + admin exactly once');
});

// ---------------------------------------------------------------- email problems never hide a paid order
test('email failure is recorded (not reported as sent) and retried on the next webhook delivery', async () => {
  world.emailFail = true;
  const o = await newOrder();
  const rp = razorpaySuccess(world, o.razorpay.orderId);
  const v = await call(verifyPaymentHandler, { orderId: o.orderId, accessToken: o.accessToken, ...rp });
  assert.equal(v.status, 200, 'payment stays confirmed');
  let r = await row(o.orderId);
  assert.equal(r.payment_status, 'paid'); assert.equal(r.customer_email_status, 'failed');
  assert.equal((await get(o.orderId, o.accessToken)).body.order.confirmationEmail, 'failed');
  world.emailFail = false;
  await webhookHandler(webhookRequest(capturedEvent(o, rp.razorpay_payment_id)), rt());
  r = await row(o.orderId);
  assert.equal(r.customer_email_status, 'sent'); assert.equal(r.admin_email_status, 'sent');
  assert.equal(world.sent.length, 2);
});

test('email not configured: order still confirmed, page told the email was not sent', async () => {
  env = baseEnv({ EMAIL_PROVIDER: '', BREVO_API_KEY: '' });
  const o = await newOrder();
  await call(verifyPaymentHandler, { orderId: o.orderId, accessToken: o.accessToken, ...razorpaySuccess(world, o.razorpay.orderId) });
  assert.equal((await row(o.orderId)).payment_status, 'paid');
  assert.equal((await get(o.orderId, o.accessToken)).body.order.confirmationEmail, 'not_configured');
  assert.equal(world.sent.length, 0);
});

test('HTML in customer input is escaped in emails', async () => {
  const o = await newOrder({ customer: goodCustomer({ name: 'Ravi <b>K</b>', house: '<img src=x onerror=alert(1)>' }) });
  await call(verifyPaymentHandler, { orderId: o.orderId, accessToken: o.accessToken, ...razorpaySuccess(world, o.razorpay.orderId) });
  const html = world.sent[0].body.htmlContent;
  assert.ok(!html.includes('<b>K</b>') && !html.includes('<img src=x'), 'no raw HTML from customer');
  assert.ok(html.includes('Ravi &lt;b&gt;K&lt;/b&gt;'));
});

test('webhook signature check uses the raw body (re-serialised JSON is rejected)', async () => {
  const o = await newOrder();
  const evt = capturedEvent(o, 'pay_RAW');
  const raw = JSON.stringify(evt, null, 2); // same data, different bytes
  const sig = createHmac('sha256', SECRETS.webhookSecret).update(JSON.stringify(evt)).digest('hex');
  const r = await webhookHandler(new Request('http://fn.test/w', { method: 'POST', body: raw, headers: { 'x-razorpay-signature': sig } }), rt());
  assert.equal(r.status, 400);
});
