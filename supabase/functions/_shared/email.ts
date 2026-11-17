// Order emails: customer confirmation and admin notification, sent through Brevo or Resend.
import type { Config } from './config.ts';
import type { OrderRow } from './db.ts';
import { formatInr } from './pricing.ts';
type Fetch = typeof fetch;

export type Mail = { to: { email: string; name?: string }; subject: string; html: string; text: string; replyTo?: string };
export type SendResult = { ok: boolean; id?: string; error?: string };

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));

function parseFrom(from: string): { name: string; email: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].replace(/^"|"$/g, '') || 'Team Vayora', email: m[2].trim() } : { name: 'Team Vayora', email: from.trim() };
}

export function emailConfigured(c: Config): boolean {
  if (!c.emailFrom) return false;
  if (c.emailProvider === 'brevo') return !!c.brevoApiKey;
  if (c.emailProvider === 'resend') return !!c.resendApiKey;
  return false;
}

export async function sendMail(c: Config, f: Fetch, mail: Mail): Promise<SendResult> {
  if (!emailConfigured(c)) return { ok: false, error: 'Email is not configured (EMAIL_PROVIDER, API key, EMAIL_FROM)' };
  try {
    let res: Response;
    if (c.emailProvider === 'brevo') {
      res = await f('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': c.brevoApiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sender: parseFrom(c.emailFrom),
          to: [{ email: mail.to.email, name: mail.to.name }],
          subject: mail.subject, htmlContent: mail.html, textContent: mail.text,
          ...(mail.replyTo ? { replyTo: { email: mail.replyTo } } : {}),
        }),
      });
    } else {
      res = await f('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${c.resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: c.emailFrom, to: [mail.to.email], subject: mail.subject, html: mail.html, text: mail.text,
          ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
        }),
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.message || `Email provider returned ${res.status}` };
    return { ok: true, id: data?.messageId || data?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const NAVY = '#0D426D', TEAL = '#0B7A73', BLUE = '#0B5B98', LINE = '#DCE4EC', SOFT = '#F3F8FB';

function shell(c: Config, inner: string, preheader: string): string {
  const logo = c.siteUrl
    ? `<img src="${esc(c.siteUrl)}/assets/img/brand/vayora-logo-email.png" width="168" height="60" alt="Vayora" style="display:block;border:0;height:60px;width:auto">`
    : `<span style="font:800 26px Arial,sans-serif;color:${NAVY}">Vayora</span>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${SOFT}">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SOFT};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${LINE}">
<tr><td style="height:6px;background:linear-gradient(90deg,${TEAL},${BLUE});background-color:${TEAL}"></td></tr>
<tr><td style="padding:28px 32px 8px">${logo}</td></tr>
<tr><td style="padding:8px 32px 32px;font:16px/1.6 Arial,Helvetica,sans-serif;color:#17212E">${inner}</td></tr>
<tr><td style="padding:18px 32px;background:${SOFT};font:13px/1.5 Arial,Helvetica,sans-serif;color:#4A5667;border-top:1px solid ${LINE}">
<strong style="color:${NAVY}">Designed for the Vayu You Live In.</strong><br>For assistance, call <a href="tel:+91${esc(c.supportPhone)}" style="color:${TEAL}">${esc(c.supportPhone)}</a>.</td></tr>
</table></td></tr></table></body></html>`;
}

function detailsTable(rows: [string, string][]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 22px;border:1px solid ${LINE};border-radius:12px;border-collapse:separate">
${rows.map(([k, v], i) => `<tr><td style="padding:10px 14px;font:600 14px Arial,sans-serif;color:#4A5667;width:40%;${i ? `border-top:1px solid ${LINE};` : ''}">${esc(k)}</td><td style="padding:10px 14px;font:14px Arial,sans-serif;color:${NAVY};${i ? `border-top:1px solid ${LINE};` : ''}">${esc(v)}</td></tr>`).join('')}
</table>`;
}

export function customerEmail(c: Config, o: OrderRow): Mail {
  const status = o.payment_status === 'paid' ? 'Paid' : o.payment_status;
  const rows: [string, string][] = [
    ['Order ID', o.id],
    ['Product', 'Vayora Portable Personal Comfort Device'],
    ['Quantity', String(o.quantity)],
    ['Total Amount', formatInr(o.total_paise)],
    ['Payment Status', status],
    ['Shipping Address', o.shipping_address],
  ];
  const html = shell(c, `
<p style="margin:0 0 14px">Hello ${esc(o.customer_name)},</p>
<p style="margin:0 0 14px;font-weight:700;color:${NAVY}">Thank you for choosing Vayora!</p>
<p style="margin:0 0 6px">We are delighted to confirm that your order has been successfully placed.</p>
<p style="margin:14px 0 0">Here are your order details:</p>
${detailsTable(rows)}
<p style="margin:0 0 14px">We appreciate your trust in Vayora.</p>
<p style="margin:0 0 14px;color:${TEAL};font-weight:700">Designed for the Vayu You Live In.</p>
<p style="margin:0 0 14px">For assistance, contact us at ${esc(c.supportPhone)}.</p>
<p style="margin:0">Warm regards,<br><strong style="color:${NAVY}">Team Vayora</strong></p>`, `Order ${o.id} confirmed`);
  const text = [
    `Hello ${o.customer_name},`, '', 'Thank you for choosing Vayora!', '',
    'We are delighted to confirm that your order has been successfully placed.', '',
    'Here are your order details:', '',
    ...rows.map(([k, v]) => `- ${k}: ${v}`), '',
    'We appreciate your trust in Vayora.', '', 'Designed for the Vayu You Live In.', '',
    `For assistance, contact us at ${c.supportPhone}.`, '', 'Warm regards,', 'Team Vayora',
  ].join('\n');
  return { to: { email: o.email, name: o.customer_name }, subject: 'Your Vayora Order Has Been Confirmed!', html, text, replyTo: c.adminEmail || undefined };
}

export function adminEmail(c: Config, o: OrderRow): Mail {
  const date = new Date(o.paid_at || o.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  const rows: [string, string][] = [
    ['Order ID', o.id], ['Customer Name', o.customer_name], ['Email', o.email], ['Phone Number', '+91 ' + o.mobile],
    ['Product', o.product_name], ['Quantity', String(o.quantity)], ['Total Amount', formatInr(o.total_paise)],
    ['Payment Status', o.payment_status === 'paid' ? `Paid (Razorpay ${o.payment_id})` : o.payment_status],
    ['Shipping Address', o.shipping_address], ['Order Date', date + ' IST'],
  ];
  const html = shell(c, `<p style="margin:0 0 6px;font-weight:700;color:${NAVY};font-size:18px">New Vayora order</p>
<p style="margin:0">A payment has been verified and the order below is confirmed.</p>${detailsTable(rows)}`, `New order ${o.id}`);
  const text = ['New Vayora order', '', ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n');
  return { to: { email: c.adminEmail }, subject: `New Vayora order ${o.id} (${formatInr(o.total_paise)})`, html, text, replyTo: o.email };
}
