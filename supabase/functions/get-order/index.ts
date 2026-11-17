// Supabase Edge Function: get-order
import { getOrderHandler } from '../_shared/http.ts';

Deno.serve((req: Request) => getOrderHandler(req, { env: Deno.env, fetch }));
