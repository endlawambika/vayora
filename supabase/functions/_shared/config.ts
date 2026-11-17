// Reads every setting from environment variables (Supabase secrets). Nothing secret lives in the site.
export type EnvSource = { get(name: string): string | undefined };

export type Config = {
  supabaseUrl: string;
  serviceRoleKey: string;
  razorpayKeyId: string;
  razorpayKeySecret: string;
  razorpayWebhookSecret: string;
  productName: string;
  unitPriceInr: number;
  shippingFeeInr: number;
  taxRatePercent: number;
  maxQuantity: number;
  currency: string;
  emailProvider: string;          // 'brevo' | 'resend' | '' (email off)
  brevoApiKey: string;
  resendApiKey: string;
  emailFrom: string;              // "Team Vayora <orders@yourdomain.com>"
  adminEmail: string;             // where new-order notifications go
  siteUrl: string;                // https://<user>.github.io/<repo> — used for the logo and links in emails
  allowedOrigin: string;          // CORS origin for the checkout pages, or *
  supportPhone: string;
};

const num = (v: string | undefined, fallback: number): number => {
  if (v === undefined || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

export function loadConfig(env: EnvSource): Config {
  const g = (k: string) => (env.get(k) ?? '').trim();
  return {
    supabaseUrl: g('SUPABASE_URL').replace(/\/+$/, ''),
    serviceRoleKey: g('SUPABASE_SERVICE_ROLE_KEY'),
    razorpayKeyId: g('RAZORPAY_KEY_ID'),
    razorpayKeySecret: g('RAZORPAY_KEY_SECRET'),
    razorpayWebhookSecret: g('RAZORPAY_WEBHOOK_SECRET'),
    productName: g('PRODUCT_NAME') || 'Vayora – Portable All-in-One Personal Comfort Device',
    unitPriceInr: num(env.get('PRODUCT_PRICE_INR'), NaN),
    shippingFeeInr: num(env.get('SHIPPING_FEE_INR'), 0),
    taxRatePercent: num(env.get('TAX_RATE_PERCENT'), 0),
    maxQuantity: num(env.get('MAX_QUANTITY'), 5),
    currency: 'INR',
    emailProvider: g('EMAIL_PROVIDER').toLowerCase(),
    brevoApiKey: g('BREVO_API_KEY'),
    resendApiKey: g('RESEND_API_KEY'),
    emailFrom: g('EMAIL_FROM'),
    adminEmail: g('ADMIN_EMAIL'),
    siteUrl: g('SITE_URL').replace(/\/+$/, ''),
    allowedOrigin: g('ALLOWED_ORIGIN') || '*',
    supportPhone: g('SUPPORT_PHONE') || '9564910918',
  };
}

/** Names of required settings that are missing, for a clear "not configured" error. */
export function missingForCheckout(c: Config): string[] {
  const m: string[] = [];
  if (!c.supabaseUrl) m.push('SUPABASE_URL');
  if (!c.serviceRoleKey) m.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!c.razorpayKeyId) m.push('RAZORPAY_KEY_ID');
  if (!c.razorpayKeySecret) m.push('RAZORPAY_KEY_SECRET');
  if (!(c.unitPriceInr > 0)) m.push('PRODUCT_PRICE_INR');
  if (!(c.shippingFeeInr >= 0)) m.push('SHIPPING_FEE_INR');
  if (!(c.taxRatePercent >= 0 && c.taxRatePercent <= 100)) m.push('TAX_RATE_PERCENT');
  if (!(Number.isInteger(c.maxQuantity) && c.maxQuantity >= 1 && c.maxQuantity <= 20)) m.push('MAX_QUANTITY');
  return m;
}
