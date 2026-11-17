// Supabase Edge Function: record-payment-failure
import { recordFailureHandler } from '../_shared/http.ts';

Deno.serve((req: Request) => recordFailureHandler(req, { env: Deno.env, fetch }));
