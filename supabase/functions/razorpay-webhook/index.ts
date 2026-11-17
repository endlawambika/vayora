// Supabase Edge Function: razorpay-webhook
import { webhookHandler } from '../_shared/http.ts';

Deno.serve((req: Request) => webhookHandler(req, { env: Deno.env, fetch }));
