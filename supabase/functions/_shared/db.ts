// Database access through Supabase's REST API (PostgREST) with the service-role key.
// Conditional updates (filters on the current status) make every state change atomic and idempotent.
import type { Config } from './config.ts';
type Fetch = typeof fetch;

export type OrderRow = {
  id: string; access_token: string; idempotency_key: string;
  customer_name: string; email: string; mobile: string;
  house: string; street: string; city: string; state: string; pin_code: string; country: string; shipping_address: string;
  product_name: string; quantity: number; unit_price_paise: number; subtotal_paise: number; shipping_paise: number;
  tax_paise: number; total_paise: number; currency: string;
  razorpay_order_id: string | null; payment_id: string | null;
  payment_status: 'created' | 'paid' | 'failed' | 'cancelled';
  order_status: 'pending_payment' | 'confirmed' | 'payment_failed' | 'cancelled';
  verified_by: string | null; failure_reason: string | null;
  customer_email_status: string | null; admin_email_status: string | null;
  created_at: string; paid_at: string | null; updated_at: string;
};

export type Filter = Record<string, string>; // column -> PostgREST operator expression, e.g. { id: 'eq.VAY-1', payment_status: 'neq.paid' }

export class DbError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) { super(message); this.status = status; this.code = code; }
}

export function makeDb(c: Config, f: Fetch) {
  const base = `${c.supabaseUrl}/rest/v1`;
  const headers = (extra: Record<string, string> = {}) => ({
    apikey: c.serviceRoleKey,
    Authorization: `Bearer ${c.serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...extra,
  });
  const qs = (filter: Filter) => Object.entries(filter).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

  async function req(method: string, url: string, body?: unknown, prefer?: string): Promise<any[]> {
    const res = await f(url, { method, headers: headers(prefer ? { Prefer: prefer } : {}), body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    const data = text ? JSON.parse(text) : [];
    if (!res.ok) throw new DbError(data?.message || `Database ${method} failed (${res.status})`, res.status, data?.code || '');
    return Array.isArray(data) ? data : [data];
  }

  return {
    /** Insert unless the unique key already exists; returns the inserted row or null on conflict. */
    async insertIgnore<T>(table: string, row: Record<string, unknown>, onConflict: string): Promise<T | null> {
      const rows = await req('POST', `${base}/${table}?on_conflict=${encodeURIComponent(onConflict)}`, row, 'resolution=ignore-duplicates,return=representation');
      return (rows[0] as T) ?? null;
    },
    async selectOne<T>(table: string, filter: Filter): Promise<T | null> {
      const rows = await req('GET', `${base}/${table}?select=*&${qs(filter)}&limit=1`);
      return (rows[0] as T) ?? null;
    },
    /** Update rows matching filter; returns the updated rows (empty when the condition no longer holds). */
    async update<T>(table: string, filter: Filter, patch: Record<string, unknown>): Promise<T[]> {
      return (await req('PATCH', `${base}/${table}?${qs(filter)}`, patch, 'return=representation')) as T[];
    },
  };
}
export type Db = ReturnType<typeof makeDb>;
