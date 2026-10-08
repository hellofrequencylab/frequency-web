-- LIVE-786: durable per-renewal state on the existing service-role-only purchase table.
-- Generated with Supabase CLI, then ordered after the table's existing migration.
-- Additive; rollback drops these five columns. RLS and grants remain unchanged.
alter table public.space_domain_purchases
  add column if not exists renewal_state text check (renewal_state in ('charging','charged','renewing','ordered','attention')),
  add column if not exists renewal_due_at timestamptz,
  add column if not exists renewal_intent_id text,
  add column if not exists renewal_order_id text,
  add column if not exists renewal_vercel_cents integer check (renewal_vercel_cents >= 0);
comment on column public.space_domain_purchases.renewal_state is
  'Null means no attempt; charging/renewing with no persisted result require operator reconcile, never blind retry.';
