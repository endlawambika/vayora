// Supabase Edge Function: verify-payment
import { verifyPaymentHandler } from '../_shared/http.ts';

Deno.serve((req: Request) => verifyPaymentHandler(req, { env: Deno.env, fetch }));
