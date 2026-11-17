-- Vayora checkout: orders and Razorpay webhook events.
-- Only the Edge Functions (service role) read or write these tables. RLS is on with no policies,
-- so the public anon key can never read customer data.

create table if not exists public.orders (
  id                      text primary key,                        -- public Order ID, e.g. VAY-261116-7KQ2MX
  access_token            text not null,                           -- secret shown only to the buyer; required to view the order
  idempotency_key         text not null unique,                    -- one checkout attempt = one order (prevents duplicates)

  customer_name           text not null check (char_length(customer_name) between 2 and 80),
  email                   text not null check (char_length(email) <= 120),
  mobile                  text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  house                   text not null,
  street                  text not null,
  city                    text not null,
  state                   text not null,
  pin_code                text not null check (pin_code ~ '^[1-9][0-9]{5}$'),
  country                 text not null default 'India',
  shipping_address        text not null,

  product_name            text not null,
  quantity                integer not null check (quantity between 1 and 20),
  unit_price_paise        integer not null check (unit_price_paise > 0),
  subtotal_paise          integer not null check (subtotal_paise = unit_price_paise * quantity),
  shipping_paise          integer not null default 0 check (shipping_paise >= 0),
  tax_paise               integer not null default 0 check (tax_paise >= 0),
  total_paise             integer not null check (total_paise = subtotal_paise + shipping_paise + tax_paise),
  currency                text not null default 'INR',

  razorpay_order_id       text unique,
  payment_id              text unique,                             -- Razorpay payment id, set only after verification
  payment_status          text not null default 'created'
                          check (payment_status in ('created', 'paid', 'failed', 'cancelled')),
  order_status            text not null default 'pending_payment'
                          check (order_status in ('pending_payment', 'confirmed', 'payment_failed', 'cancelled')),
  verified_by             text check (verified_by in ('checkout', 'webhook')),
  failure_reason          text,

  customer_email_status   text check (customer_email_status in ('sending', 'sent', 'failed')),
  admin_email_status      text check (admin_email_status in ('sending', 'sent', 'failed')),

  created_at              timestamptz not null default now(),
  paid_at                 timestamptz,
  updated_at              timestamptz not null default now(),

  -- an order can only be paid with a recorded payment id and a paid timestamp
  constraint paid_needs_payment check (payment_status <> 'paid' or (payment_id is not null and paid_at is not null and order_status = 'confirmed'))
);

create index if not exists orders_email_idx on public.orders (email);
create index if not exists orders_created_idx on public.orders (created_at desc);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

-- Every webhook delivery is stored once (Razorpay retries deliveries; the event id deduplicates them).
create table if not exists public.payment_events (
  event_id     text primary key,
  event_type   text not null,
  order_id     text references public.orders (id),
  payload      jsonb not null,
  received_at  timestamptz not null default now()
);

alter table public.orders enable row level security;
alter table public.payment_events enable row level security;
revoke all on public.orders, public.payment_events from anon, authenticated;
