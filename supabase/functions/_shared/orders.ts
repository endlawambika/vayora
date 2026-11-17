// Checkout business logic. Each function takes its dependencies so it can be tested without a network.
import { type Config, missingForCheckout } from './config.ts';
import { computeAmounts, formatInr } from './pricing.ts';
import { validateCustomer, formatAddress } from './validate.ts';
import { newOrderId, randomToken, safeEqual } from './crypto.ts';
import { createRazorpayOrder, fetchPayment, capturePayment, verifyCheckoutSignature, verifyWebhookSignature } from './razorpay.ts';
import { makeDb, type Db, type OrderRow } from './db.ts';
import { sendMail, customerEmail, adminEmail, emailConfigured } from './email.ts';

export type Deps = { config: Config; fetch: typeof fetch; now?: () => Date; log?: (...a: unknown[]) => void };
export type Result = { status: number; body: Record<string, unknown> };

const ok = (body: Record<string, unknown>): Result => ({ status: 200, body });
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Result => ({ status, body: { ok: false, error, ...extra } });
const IDEM_RE = /^[A-Za-z0-9_-]{16,80}$/;
const db = (d: Deps): Db => makeDb(d.config, d.fetch);
const log = (d: Deps, ...a: unknown[]) => (d.log ?? console.log)('[vayora]', ...a);

function notConfigured(d: Deps): Result | null {
  const missing = missingForCheckout(d.config);
  return missing.length ? fail(503, 'checkout_not_configured', { missing }) : null;
}

function publicOrder(o: OrderRow, c: Config) {
  return {
    orderId: o.id,
    customerName: o.customer_name,
    email: o.email,
    productName: o.product_name,
    quantity: o.quantity,
    unitPrice: formatInr(o.unit_price_paise),
    subtotal: formatInr(o.subtotal_paise),
    shipping: formatInr(o.shipping_paise),
    tax: formatInr(o.tax_paise),
    totalAmount: formatInr(o.total_paise),
    totalPaise: o.total_paise,
    paymentStatus: o.payment_status === 'paid' ? 'Paid' : o.payment_status,
    paymentId: o.payment_id,
    orderDate: o.paid_at || o.created_at,
    shippingAddress: o.shipping_address,
    confirmationEmail: o.customer_email_status === 'sent' ? 'sent' : (o.customer_email_status === 'failed' ? 'failed' : (emailConfigured(c) ? 'pending' : 'not_configured')),
  };
}

// ---------------------------------------------------------------- 1. create order
export async function createOrder(d: Deps, input: Record<string, unknown>): Promise<Result> {
  const nc = notConfigured(d); if (nc) return nc;
  const c = d.config;
  const v = validateCustomer((input.customer as Record<string, unknown>) || {});
  if (!v.ok) return fail(422, 'invalid_customer', { fields: v.errors });
  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > c.maxQuantity) return fail(422, 'invalid_quantity', { max: c.maxQuantity });
  const idem = String(input.idempotencyKey || '');
  if (!IDEM_RE.test(idem)) return fail(400, 'invalid_idempotency_key');

  const amounts = computeAmounts(quantity, c);
  const store = db(d);

  const respond = (o: OrderRow): Result => ok({
    ok: true,
    orderId: o.id,
    accessToken: o.access_token,
    status: o.payment_status,
    razorpay: o.payment_status === 'paid' ? null : {
      key: c.razorpayKeyId, orderId: o.razorpay_order_id, amount: o.total_paise, currency: o.currency,
      name: 'Vayora', description: o.product_name,
      prefill: { name: o.customer_name, email: o.email, contact: '+91' + o.mobile },
      notes: { vayora_order_id: o.id },
    },
    summary: publicOrder(o, c),
  });

  // Same checkout attempt (same details, same quantity) → same order. A repeat click or a retry never makes a second order.
  const existing = await store.selectOne<OrderRow>('orders', { idempotency_key: 'eq.' + idem });
  if (existing) {
    if (existing.payment_status === 'paid') return respond(existing);
    if (existing.total_paise !== amounts.totalPaise || existing.quantity !== quantity) return fail(409, 'checkout_changed');
    return respond(existing);
  }

  const now = (d.now ?? (() => new Date()))();
  const id = newOrderId(now);
  const rzp = await createRazorpayOrder(c, d.fetch, { amount: amounts.totalPaise, currency: amounts.currency, receipt: id, notes: { vayora_order_id: id } });
  if (!rzp?.id || rzp.amount !== amounts.totalPaise) return fail(502, 'payment_order_failed');

  const cu = v.customer;
  const row = {
    id, access_token: randomToken(), idempotency_key: idem,
    customer_name: cu.name, email: cu.email, mobile: cu.mobile,
    house: cu.house, street: cu.street, city: cu.city, state: cu.state, pin_code: cu.pinCode, country: cu.country,
    shipping_address: formatAddress(cu),
    product_name: c.productName, quantity,
    unit_price_paise: amounts.unitPricePaise, subtotal_paise: amounts.subtotalPaise, shipping_paise: amounts.shippingPaise,
    tax_paise: amounts.taxPaise, total_paise: amounts.totalPaise, currency: amounts.currency,
    razorpay_order_id: rzp.id,
  };
  const inserted = await store.insertIgnore<OrderRow>('orders', row, 'idempotency_key');
  if (inserted) { log(d, 'order created', id, rzp.id, formatInr(amounts.totalPaise)); return respond(inserted); }
  // Lost a race with an identical request: return the order that won.
  const winner = await store.selectOne<OrderRow>('orders', { idempotency_key: 'eq.' + idem });
  return winner ? respond(winner) : fail(500, 'order_not_saved');
}

// ---------------------------------------------------------------- 2. mark paid (shared by checkout verification and webhook)
async function confirmPayment(d: Deps, o: OrderRow, paymentId: string, source: 'checkout' | 'webhook'): Promise<{ order: OrderRow; changed: boolean } | { error: string }> {
  const store = db(d);
  const now = (d.now ?? (() => new Date()))().toISOString();
  const updated = await store.update<OrderRow>('orders', { id: 'eq.' + o.id, payment_status: 'neq.paid' }, {
    payment_status: 'paid', order_status: 'confirmed', payment_id: paymentId, paid_at: now, verified_by: source, failure_reason: null,
  });
  if (updated[0]) { log(d, 'order paid', o.id, paymentId, 'via', source); return { order: updated[0], changed: true }; }
  const current = await store.selectOne<OrderRow>('orders', { id: 'eq.' + o.id });
  if (current?.payment_status === 'paid') {
    if (current.payment_id !== paymentId) log(d, 'WARNING second payment for an already paid order — refund it in Razorpay', o.id, paymentId);
    return { order: current, changed: false };
  }
  return { error: 'update_failed' };
}

/** Sends each email at most once. A failed send can be retried by a later webhook delivery. */
export async function sendOrderEmails(d: Deps, o: OrderRow): Promise<OrderRow> {
  const c = d.config;
  if (!emailConfigured(c)) { log(d, 'email not configured; skipped for', o.id); return o; }
  const store = db(d);
  let latest = o;
  const jobs: { col: 'customer_email_status' | 'admin_email_status'; mail: () => ReturnType<typeof customerEmail> }[] = [
    { col: 'customer_email_status', mail: () => customerEmail(c, latest) },
  ];
  if (c.adminEmail) jobs.push({ col: 'admin_email_status', mail: () => adminEmail(c, latest) });
  for (const job of jobs) {
    const claimed = await store.update<OrderRow>('orders', { id: 'eq.' + o.id, payment_status: 'eq.paid', or: `(${job.col}.is.null,${job.col}.eq.failed)` }, { [job.col]: 'sending' });
    if (!claimed[0]) continue;
    latest = claimed[0];
    const res = await sendMail(c, d.fetch, job.mail());
    const after = await store.update<OrderRow>('orders', { id: 'eq.' + o.id }, { [job.col]: res.ok ? 'sent' : 'failed' });
    if (after[0]) latest = after[0];
    log(d, job.col, res.ok ? 'sent' : 'FAILED', o.id, res.ok ? res.id : res.error);
  }
  return latest;
}

/** Razorpay must actually hold the money: confirm the payment belongs to this order, matches the amount, and is captured. */
async function ensureCaptured(d: Deps, o: OrderRow, paymentId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const p = await fetchPayment(d.config, d.fetch, paymentId);
  if (p.order_id !== o.razorpay_order_id) return { ok: false, reason: 'payment_order_mismatch' };
  if (p.amount !== o.total_paise || p.currency !== o.currency) return { ok: false, reason: 'amount_mismatch' };
  if (p.status === 'captured') return { ok: true };
  if (p.status === 'authorized') {
    const cap = await capturePayment(d.config, d.fetch, paymentId, o.total_paise, o.currency);
    return cap.status === 'captured' ? { ok: true } : { ok: false, reason: 'capture_failed' };
  }
  return { ok: false, reason: 'payment_' + p.status };
}

// ---------------------------------------------------------------- 3. verify payment (browser → after Razorpay checkout succeeds)
export async function verifyPayment(d: Deps, input: Record<string, unknown>): Promise<Result> {
  const nc = notConfigured(d); if (nc) return nc;
  const orderId = String(input.orderId || '');
  const token = String(input.accessToken || '');
  const rzpOrderId = String(input.razorpay_order_id || '');
  const paymentId = String(input.razorpay_payment_id || '');
  const signature = String(input.razorpay_signature || '');
  const store = db(d);
  const o = await store.selectOne<OrderRow>('orders', { id: 'eq.' + orderId });
  if (!o || !safeEqual(o.access_token, token)) return fail(404, 'order_not_found');
  if (o.payment_status === 'paid') return ok({ ok: true, orderId: o.id, accessToken: o.access_token, alreadyConfirmed: true });
  if (rzpOrderId !== o.razorpay_order_id || !(await verifyCheckoutSignature(d.config, o.razorpay_order_id || '', paymentId, signature))) {
    log(d, 'signature check FAILED', orderId, paymentId);
    return fail(400, 'signature_invalid');
  }
  const cap = await ensureCaptured(d, o, paymentId);
  if (!cap.ok) { log(d, 'payment not captured', orderId, paymentId, cap.reason); return fail(402, 'payment_not_captured', { reason: cap.reason }); }
  const r = await confirmPayment(d, o, paymentId, 'checkout');
  if ('error' in r) return fail(500, r.error);
  await sendOrderEmails(d, r.order);
  return ok({ ok: true, orderId: o.id, accessToken: o.access_token });
}

// ---------------------------------------------------------------- 4. record a failed or cancelled attempt (never overrides a paid order)
export async function recordFailure(d: Deps, input: Record<string, unknown>): Promise<Result> {
  const nc = notConfigured(d); if (nc) return nc;
  const orderId = String(input.orderId || '');
  const token = String(input.accessToken || '');
  const kind = input.status === 'cancelled' ? 'cancelled' : 'failed';
  const reason = String(input.reason || '').slice(0, 200) || null;
  const store = db(d);
  const o = await store.selectOne<OrderRow>('orders', { id: 'eq.' + orderId });
  if (!o || !safeEqual(o.access_token, token)) return fail(404, 'order_not_found');
  const updated = await store.update<OrderRow>('orders', { id: 'eq.' + orderId, payment_status: 'neq.paid' }, {
    payment_status: kind, order_status: kind === 'cancelled' ? 'cancelled' : 'payment_failed', failure_reason: reason,
  });
  return ok({ ok: true, recorded: !!updated[0], paymentStatus: updated[0]?.payment_status ?? o.payment_status });
}

// ---------------------------------------------------------------- 5. read a confirmed order (success page)
export async function getOrder(d: Deps, orderId: string, token: string): Promise<Result> {
  const nc = notConfigured(d); if (nc) return nc;
  const o = await db(d).selectOne<OrderRow>('orders', { id: 'eq.' + orderId });
  if (!o || !safeEqual(o.access_token, token)) return fail(404, 'order_not_found');
  if (o.payment_status !== 'paid') return ok({ ok: true, confirmed: false, paymentStatus: o.payment_status });
  return ok({ ok: true, confirmed: true, order: publicOrder(o, d.config) });
}

// ---------------------------------------------------------------- 6. Razorpay webhook (reliable server-to-server status)
export async function handleWebhook(d: Deps, rawBody: string, signature: string, eventIdHeader: string): Promise<Result> {
  const c = d.config;
  if (!c.razorpayWebhookSecret) return fail(503, 'webhook_not_configured', { missing: ['RAZORPAY_WEBHOOK_SECRET'] });
  if (!(await verifyWebhookSignature(c, rawBody, signature))) { log(d, 'webhook signature FAILED'); return fail(400, 'signature_invalid'); }
  let evt: any;
  try { evt = JSON.parse(rawBody); } catch { return fail(400, 'bad_json'); }
  const type = String(evt?.event || '');
  const payment = evt?.payload?.payment?.entity;
  const rzpOrderId = payment?.order_id || evt?.payload?.order?.entity?.id;
  const store = db(d);
  const o = rzpOrderId ? await store.selectOne<OrderRow>('orders', { razorpay_order_id: 'eq.' + rzpOrderId }) : null;

  const eventId = eventIdHeader || `${type}:${payment?.id || rzpOrderId || ''}`;
  const fresh = await store.insertIgnore('payment_events', { event_id: eventId, event_type: type, order_id: o?.id ?? null, payload: evt }, 'event_id');
  if (!fresh) return ok({ ok: true, duplicate: true });
  if (!o) { log(d, 'webhook for unknown order', type, rzpOrderId); return ok({ ok: true, ignored: 'unknown_order' }); }

  if (type === 'payment.captured' || type === 'order.paid') {
    if (!payment?.id || payment.amount !== o.total_paise || payment.currency !== o.currency) {
      log(d, 'webhook amount/currency mismatch — not marking paid', o.id, payment?.id);
      return ok({ ok: true, ignored: 'amount_mismatch' });
    }
    if (type === 'payment.captured' || payment.status === 'captured') {
      const r = await confirmPayment(d, o, payment.id, 'webhook');
      if ('error' in r) return fail(500, r.error);
      await sendOrderEmails(d, r.order);
      return ok({ ok: true, paid: true });
    }
    return ok({ ok: true, ignored: 'not_captured' });
  }
  if (type === 'payment.failed') {
    await store.update<OrderRow>('orders', { id: 'eq.' + o.id, payment_status: 'neq.paid' }, {
      payment_status: 'failed', order_status: 'payment_failed', failure_reason: String(payment?.error_description || 'Payment failed').slice(0, 200),
    });
    return ok({ ok: true, failed: true });
  }
  return ok({ ok: true, ignored: type });
}
