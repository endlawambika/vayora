// Test harness: runs the real Edge Function code against a real Postgres database.
//  - A small PostgREST stand-in translates the REST calls the functions make into SQL (the subset they use).
//  - Razorpay and the email providers are simulated in memory, recording every call.
// Requires DATABASE_URL (default postgres://postgres@localhost:54329/postgres) with the migration applied.
import pg from 'pg';
import { createHmac, randomBytes } from 'node:crypto';

export const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres@localhost:54329/postgres';
export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 8 });
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString()); // timestamptz → ISO string, as PostgREST returns

export const SECRETS = { keyId: 'rzp_test_KEYID123', keySecret: 'test_key_secret_DO_NOT_LEAK', webhookSecret: 'whsec_test_123' };

export function baseEnv(over = {}) {
  return {
    SUPABASE_URL: 'http://supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
    RAZORPAY_KEY_ID: SECRETS.keyId, RAZORPAY_KEY_SECRET: SECRETS.keySecret, RAZORPAY_WEBHOOK_SECRET: SECRETS.webhookSecret,
    PRODUCT_PRICE_INR: '4999', SHIPPING_FEE_INR: '0', TAX_RATE_PERCENT: '0', MAX_QUANTITY: '5',
    EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'brevo-test', EMAIL_FROM: 'Team Vayora <orders@vayora.test>',
    ADMIN_EMAIL: 'admin@vayora.test', SITE_URL: 'https://vayora.test', ALLOWED_ORIGIN: '*',
    ...over,
  };
}
export const envSource = (obj) => ({ get: (k) => obj[k] });

const IDENT = /^[a-z_][a-z0-9_]*$/;
function where(params, values) {
  const parts = [];
  for (const [k, v] of params) {
    if (['select', 'limit', 'on_conflict'].includes(k)) continue;
    if (k === 'or') {
      const inner = v.replace(/^\(|\)$/g, '').split(',').map((cond) => {
        const [col, op, ...rest] = cond.split('.');
        return cmp(col, op, rest.join('.'), values);
      });
      parts.push('(' + inner.join(' OR ') + ')');
      continue;
    }
    const dot = v.indexOf('.');
    parts.push(cmp(k, v.slice(0, dot), v.slice(dot + 1), values));
  }
  return parts.length ? ' WHERE ' + parts.join(' AND ') : '';
}
function cmp(col, op, val, values) {
  if (!IDENT.test(col)) throw new Error('bad column ' + col);
  if (op === 'is' && val === 'null') return `${col} IS NULL`;
  if (op === 'eq') { values.push(val); return `${col} = $${values.length}`; }
  if (op === 'neq') { values.push(val); return `${col} <> $${values.length}`; }
  throw new Error('unsupported operator ' + op);
}

async function postgrest(url, init) {
  const u = new URL(url);
  const table = u.pathname.replace('/rest/v1/', '');
  if (!IDENT.test(table)) return new Response(JSON.stringify({ message: 'bad table' }), { status: 400 });
  const params = [...u.searchParams.entries()];
  const values = [];
  let sql;
  try {
    if (init.method === 'GET') {
      const limit = u.searchParams.get('limit');
      sql = `SELECT * FROM public.${table}${where(params, values)}${limit ? ' LIMIT ' + Number(limit) : ''}`;
    } else if (init.method === 'POST') {
      const row = JSON.parse(init.body);
      const cols = Object.keys(row); cols.forEach((c) => { if (!IDENT.test(c)) throw new Error('bad col'); });
      cols.forEach((c) => values.push(typeof row[c] === 'object' && row[c] !== null ? JSON.stringify(row[c]) : row[c]));
      const conflict = u.searchParams.get('on_conflict');
      const ignore = (init.headers.Prefer || '').includes('ignore-duplicates');
      sql = `INSERT INTO public.${table} (${cols.join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')})` +
        (ignore && conflict ? ` ON CONFLICT (${conflict}) DO NOTHING` : '') + ' RETURNING *';
    } else if (init.method === 'PATCH') {
      const patch = JSON.parse(init.body);
      const sets = Object.keys(patch).map((c) => { if (!IDENT.test(c)) throw new Error('bad col'); values.push(patch[c]); return `${c} = $${values.length}`; });
      sql = `UPDATE public.${table} SET ${sets.join(', ')}${where(params, values)} RETURNING *`;
    } else return new Response('{}', { status: 405 });
    const r = await pool.query(sql, values);
    return new Response(JSON.stringify(r.rows), { status: init.method === 'POST' ? 201 : 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    const status = e.code === '23505' ? 409 : 400;
    return new Response(JSON.stringify({ message: e.message, code: e.code }), { status });
  }
}

/** Simulated outside world. Inspect .calls; change .razorpay / .email behaviour per test. */
export function makeWorld() {
  const world = {
    calls: [],
    rzpOrders: new Map(),
    payments: new Map(),          // paymentId -> { id, order_id, amount, currency, status }
    emailFail: false,
    razorpayDown: false,
    sent: [],                     // emails accepted by the provider
  };
  world.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    world.calls.push({ url, method, headers: init.headers || {}, body: init.body });
    if (url.startsWith('http://supabase.test/rest/v1/')) return postgrest(url, { ...init, method, headers: init.headers || {} });
    if (url.startsWith('https://api.razorpay.com/v1/')) {
      const auth = (init.headers || {}).Authorization;
      if (auth !== 'Basic ' + Buffer.from(`${SECRETS.keyId}:${SECRETS.keySecret}`).toString('base64')) return new Response(JSON.stringify({ error: { description: 'auth' } }), { status: 401 });
      if (world.razorpayDown) return new Response(JSON.stringify({ error: { description: 'down' } }), { status: 503 });
      const path = url.replace('https://api.razorpay.com/v1', '');
      if (path === '/orders' && method === 'POST') {
        const b = JSON.parse(init.body);
        const o = { id: 'order_' + randomBytes(7).toString('hex'), entity: 'order', amount: b.amount, currency: b.currency, receipt: b.receipt, notes: b.notes, status: 'created' };
        world.rzpOrders.set(o.id, o);
        return new Response(JSON.stringify(o), { status: 200 });
      }
      let m;
      if ((m = path.match(/^\/payments\/([^/]+)$/)) && method === 'GET') {
        const p = world.payments.get(decodeURIComponent(m[1]));
        return p ? new Response(JSON.stringify(p), { status: 200 }) : new Response(JSON.stringify({ error: { description: 'not found' } }), { status: 400 });
      }
      if ((m = path.match(/^\/payments\/([^/]+)\/capture$/)) && method === 'POST') {
        const p = world.payments.get(decodeURIComponent(m[1]));
        const b = JSON.parse(init.body);
        if (!p || p.status !== 'authorized' || b.amount !== p.amount) return new Response(JSON.stringify({ error: { description: 'cannot capture' } }), { status: 400 });
        p.status = 'captured';
        return new Response(JSON.stringify(p), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { description: 'unknown route' } }), { status: 404 });
    }
    if (url === 'https://api.brevo.com/v3/smtp/email' || url === 'https://api.resend.com/emails') {
      if (world.emailFail) return new Response(JSON.stringify({ message: 'provider rejected' }), { status: 400 });
      const b = JSON.parse(init.body);
      world.sent.push({ provider: url.includes('brevo') ? 'brevo' : 'resend', headers: init.headers, body: b });
      return new Response(JSON.stringify({ messageId: '<msg-' + world.sent.length + '>', id: 'msg-' + world.sent.length }), { status: 201 });
    }
    throw new Error('unexpected network call ' + url);
  };
  return world;
}

/** Simulates a shopper completing Razorpay Checkout: returns what Razorpay hands to the browser. */
export function razorpaySuccess(world, rzpOrderId, { amount, status = 'captured', currency = 'INR' } = {}) {
  const id = 'pay_' + randomBytes(7).toString('hex');
  const order = world.rzpOrders.get(rzpOrderId);
  world.payments.set(id, { id, entity: 'payment', order_id: rzpOrderId, amount: amount ?? order.amount, currency, status });
  const signature = createHmac('sha256', SECRETS.keySecret).update(`${rzpOrderId}|${id}`).digest('hex');
  return { razorpay_order_id: rzpOrderId, razorpay_payment_id: id, razorpay_signature: signature };
}

export function webhookRequest(event, { secret = SECRETS.webhookSecret, eventId = 'evt_' + randomBytes(6).toString('hex') } = {}) {
  const raw = JSON.stringify(event);
  const sig = createHmac('sha256', secret).update(raw).digest('hex');
  return new Request('http://fn.test/razorpay-webhook', { method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig, 'x-razorpay-event-id': eventId } });
}

export async function resetDb() { await pool.query('TRUNCATE public.payment_events, public.orders'); }

export const goodCustomer = (over = {}) => ({
  name: 'Ananya Rao', email: 'Ananya.Rao@Example.com', mobile: '+91 98765-43210',
  house: 'Flat 4B, Lake View Apartments', street: 'Rajiv Gandhi Salai, Thoraipakkam', city: 'Chennai', state: 'Tamil Nadu', pinCode: '600097', country: 'India',
  ...over,
});
