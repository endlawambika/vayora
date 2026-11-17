// HTTP wrappers shared by the Edge Functions: CORS, JSON parsing, method checks, error hiding.
import { loadConfig, type EnvSource } from './config.ts';
import * as orders from './orders.ts';

export type Runtime = { env: EnvSource; fetch: typeof fetch; now?: () => Date; log?: (...a: unknown[]) => void };

function cors(origin: string, reqOrigin: string | null): Record<string, string> {
  const allow = origin === '*' ? '*' : origin.split(',').map((s) => s.trim()).includes(reqOrigin || '') ? (reqOrigin as string) : origin.split(',')[0].trim();
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

type Handler = (deps: orders.Deps, req: Request) => Promise<orders.Result>;

export function endpoint(methods: string[], handler: Handler) {
  return async (req: Request, rt: Runtime): Promise<Response> => {
    const config = loadConfig(rt.env);
    const h = cors(config.allowedOrigin, req.headers.get('origin'));
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (!methods.includes(req.method)) return json(405, { ok: false, error: 'method_not_allowed' }, h);
    try {
      const r = await handler({ config, fetch: rt.fetch, now: rt.now, log: rt.log }, req);
      return json(r.status, r.body, h);
    } catch (e) {
      (rt.log ?? console.error)('[vayora] unhandled error', e instanceof Error ? e.message : e);
      return json(500, { ok: false, error: 'server_error' }, h);
    }
  };
}

async function body(req: Request): Promise<Record<string, unknown>> {
  try { const b = await req.json(); return b && typeof b === 'object' ? b : {}; } catch { return {}; }
}

export const createOrderHandler = endpoint(['POST'], async (d, req) => orders.createOrder(d, await body(req)));
export const verifyPaymentHandler = endpoint(['POST'], async (d, req) => orders.verifyPayment(d, await body(req)));
export const recordFailureHandler = endpoint(['POST'], async (d, req) => orders.recordFailure(d, await body(req)));
export const getOrderHandler = endpoint(['GET'], async (d, req) => {
  const u = new URL(req.url);
  return orders.getOrder(d, u.searchParams.get('id') || '', u.searchParams.get('token') || '');
});
export const webhookHandler = endpoint(['POST'], async (d, req) => {
  const raw = await req.text(); // the signature covers the exact raw bytes
  return orders.handleWebhook(d, raw, req.headers.get('x-razorpay-signature') || '', req.headers.get('x-razorpay-event-id') || '');
});
