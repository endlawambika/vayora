// Razorpay REST calls (server only — they use the key secret) and signature checks.
import type { Config } from './config.ts';
import { hmacSha256Hex, safeEqual } from './crypto.ts';

const API = 'https://api.razorpay.com/v1';
type Fetch = typeof fetch;

function auth(c: Config): string {
  return 'Basic ' + btoa(`${c.razorpayKeyId}:${c.razorpayKeySecret}`);
}

async function call(c: Config, f: Fetch, method: string, path: string, body?: unknown): Promise<any> {
  const res = await f(API + path, {
    method,
    headers: { Authorization: auth(c), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.description || `Razorpay ${method} ${path} failed (${res.status})`;
    throw Object.assign(new Error(msg), { status: res.status, razorpay: data?.error });
  }
  return data;
}

export function createRazorpayOrder(c: Config, f: Fetch, p: { amount: number; currency: string; receipt: string; notes: Record<string, string> }) {
  return call(c, f, 'POST', '/orders', { amount: p.amount, currency: p.currency, receipt: p.receipt.slice(0, 40), notes: p.notes });
}

export function fetchPayment(c: Config, f: Fetch, paymentId: string) {
  return call(c, f, 'GET', '/payments/' + encodeURIComponent(paymentId));
}

export function capturePayment(c: Config, f: Fetch, paymentId: string, amount: number, currency: string) {
  return call(c, f, 'POST', '/payments/' + encodeURIComponent(paymentId) + '/capture', { amount, currency });
}

/** Checkout handler signature: HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret) */
export async function verifyCheckoutSignature(c: Config, razorpayOrderId: string, paymentId: string, signature: string): Promise<boolean> {
  if (!razorpayOrderId || !paymentId || !signature) return false;
  const expected = await hmacSha256Hex(c.razorpayKeySecret, `${razorpayOrderId}|${paymentId}`);
  return safeEqual(expected, signature);
}

/** Webhook signature: HMAC_SHA256(raw request body, webhook secret), sent in X-Razorpay-Signature */
export async function verifyWebhookSignature(c: Config, rawBody: string, signature: string): Promise<boolean> {
  if (!c.razorpayWebhookSecret || !signature) return false;
  const expected = await hmacSha256Hex(c.razorpayWebhookSecret, rawBody);
  return safeEqual(expected, signature);
}
