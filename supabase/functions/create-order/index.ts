// Supabase Edge Function: create-order
import { createOrderHandler } from '../_shared/http.ts';

Deno.serve((req: Request) => createOrderHandler(req, { env: Deno.env, fetch }));
