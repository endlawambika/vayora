// Local stand-in for the deployed Edge Functions, for browser tests of the checkout.
// Runs the real handlers against the real Postgres; Razorpay's API and email providers are simulated.
// Test-only routes: /__test/pay (what Razorpay Checkout hands the browser after a payment),
// /__test/state, /__test/reset, /__test/webhook-captured.
import http from 'node:http';
import { baseEnv, envSource, makeWorld, razorpaySuccess, webhookRequest, resetDb, pool } from './harness.mjs';
import { createOrderHandler, verifyPaymentHandler, recordFailureHandler, getOrderHandler, webhookHandler } from '../functions/_shared/http.ts';

const PORT = Number(process.env.PORT || 5555);
let world = makeWorld();
let env = baseEnv();
const rt = () => ({ env: envSource(env), fetch: world.fetch, log: () => {} });
const routes = { '/create-order': createOrderHandler, '/verify-payment': verifyPaymentHandler, '/record-payment-failure': recordFailureHandler, '/get-order': getOrderHandler, '/razorpay-webhook': webhookHandler };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  try {
    if (url.pathname === '/__test/reset') { await resetDb(); world = makeWorld(); env = baseEnv(JSON.parse(body.toString() || '{}')); res.writeHead(200, cors); return res.end('{}'); }
    if (url.pathname === '/__test/state') {
      const orders = (await pool.query('select id, quantity, total_paise, payment_status, order_status, payment_id, customer_email_status, admin_email_status, idempotency_key from public.orders order by created_at')).rows;
      res.writeHead(200, cors);
      return res.end(JSON.stringify({ orders, sent: world.sent.map((m) => ({ to: m.body.to, subject: m.body.subject })), rzpOrders: world.rzpOrders.size, calls: world.calls.length }));
    }
    if (url.pathname === '/__test/pay') { res.writeHead(200, cors); return res.end(JSON.stringify(razorpaySuccess(world, url.searchParams.get('order_id'), { status: url.searchParams.get('status') || 'captured' }))); }
    if (url.pathname === '/__test/webhook-captured') {
      const p = [...world.payments.values()].find((x) => x.order_id === url.searchParams.get('order_id'));
      const r = await webhookHandler(webhookRequest({ event: 'payment.captured', payload: { payment: { entity: { ...p, status: 'captured' } } } }), rt());
      res.writeHead(r.status, cors); return res.end(await r.text());
    }
    const handler = routes[url.pathname];
    if (!handler) { res.writeHead(404, cors); return res.end('{"error":"not_found"}'); }
    const request = new Request(url.href, { method: req.method, headers: req.headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : body });
    const r = await handler(request, rt());
    const headers = Object.fromEntries(r.headers.entries());
    res.writeHead(r.status, headers);
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.writeHead(500, cors); res.end(JSON.stringify({ error: String(e && e.message) }));
  }
}).listen(PORT, () => console.log('e2e functions on http://localhost:' + PORT));
