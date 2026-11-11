-- FH-036..FH-040, FH-046, FH-047: Frequency Hunts money storage (Tier 4 and Tier 5, Build Plan).
--
-- A Hunt never sells anything and never moves money. An Event ticket or a store order settles
-- through the canonical Stripe path; this migration holds what a Hunt projects FROM that settlement:
--
--   * hunt_pass_bindings      one Experience Pass = one published Hunt version bound to one Event ticket tier,
--                             frozen (benefit codes, seller, version) so a later edit cannot reach a purchase
--   * hunt_store_offers       an approved store item a Hunt links to, optionally carrying one benefit code (FH-038)
--   * hunt_entitlements       one row per (source, seat or order unit, benefit code): the benefit itself.
--                             Unique on that key, so a webhook and a checkout return that race write ONE row
--   * hunt_entitlement_events append-only audit; unique per (entitlement, kind, ref) so a repeated delivery
--                             of the same refund or dispute does nothing twice
--   * hunt_refund_cases       the review queue: an unmapped partial refund, a consumed benefit that was
--                             reversed, a service case
--   * hunt_reconciliation     expected provider amount against what was received, by source, with aging
--   * hunt_commerce_state     the kill switch. It stops NEW sales; payment, refund and reconciliation go on
--   * hunt_donation_*         a separate, optional, approved beneficiary ask and its settled totals (FH-046)
--   * hunt_sponsor_*          one capped sponsor pledge per Hunt, a threshold frozen once, a settlement
--                             recorded once (FH-047)
--
-- Serialization: consuming and reversing an entitlement both take the row lock (select ... for update),
-- so a refund and a staff scan racing for the same unused benefit cannot both win.
--
-- Nothing here calls Stripe, sends mail or reads a card. Service role only, like every Hunt table.
-- Additive and idempotent.

begin;

-- ── the kill switch ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.hunt_commerce_state (
  id boolean primary key default true check (id),
  sales_open boolean not null default true,
  reason text check (reason is null or char_length(reason) <= 300),
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);
insert into public.hunt_commerce_state (id) values (true) on conflict (id) do nothing;

create table if not exists public.hunt_commerce_audit (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(action) between 1 and 60),
  detail jsonb not null default '{}'::jsonb
);
create index if not exists hunt_commerce_state_changed_by_idx on public.hunt_commerce_state(changed_by) where changed_by is not null;
create index if not exists hunt_commerce_audit_actor_idx on public.hunt_commerce_audit(actor_profile_id) where actor_profile_id is not null;
create index if not exists hunt_commerce_audit_at_idx on public.hunt_commerce_audit(at desc);

-- ── pass bindings (FH-036) ──────────────────────────────────────────────────────────────────────
create table if not exists public.hunt_pass_bindings (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null references public.hunts(id) on delete restrict,
  version_id uuid not null,
  event_id uuid not null references public.events(id) on delete restrict,
  ticket_type_id uuid not null references public.event_ticket_types(id) on delete restrict,
  seller_space_id uuid not null references public.spaces(id) on delete restrict,
  benefit_codes text[] not null,
  revision integer not null default 1 check (revision >= 1),
  status text not null default 'active' check (status in ('active','retired')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  foreign key (version_id, hunt_id) references public.hunt_versions(id, hunt_id),
  unique (id, hunt_id),
  check (cardinality(benefit_codes) between 1 and 10),
  check (status <> 'retired' or retired_at is not null)
);
-- One live Experience Pass per ticket tier.
create unique index if not exists hunt_pass_bindings_one_active_tier
  on public.hunt_pass_bindings(ticket_type_id) where status = 'active';
create index if not exists hunt_pass_bindings_hunt_idx on public.hunt_pass_bindings(hunt_id);
create index if not exists hunt_pass_bindings_event_idx on public.hunt_pass_bindings(event_id);
create index if not exists hunt_pass_bindings_seller_idx on public.hunt_pass_bindings(seller_space_id);
create index if not exists hunt_pass_bindings_version_idx on public.hunt_pass_bindings(version_id, hunt_id);
create index if not exists hunt_pass_bindings_created_by_idx on public.hunt_pass_bindings(created_by) where created_by is not null;

-- A binding is frozen: only its status may change (active to retired). A different pass is a new row.
create or replace function public.hunt_pass_binding_freeze()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.hunt_id is distinct from old.hunt_id
     or new.version_id is distinct from old.version_id
     or new.event_id is distinct from old.event_id
     or new.ticket_type_id is distinct from old.ticket_type_id
     or new.seller_space_id is distinct from old.seller_space_id
     or new.benefit_codes is distinct from old.benefit_codes
     or new.revision is distinct from old.revision then
    raise exception 'a pass binding is frozen; retire it and bind a new one' using errcode = '23514';
  end if;
  if old.status = 'retired' and new.status = 'active' then
    raise exception 'a retired pass binding cannot be reactivated' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists hunt_pass_binding_freeze on public.hunt_pass_bindings;
create trigger hunt_pass_binding_freeze before update on public.hunt_pass_bindings
  for each row execute function public.hunt_pass_binding_freeze();

-- ── approved store items (FH-038) ───────────────────────────────────────────────────────────────
-- A Hunt links to an approved store item. The store keeps price, stock, tax, shipping, receipts and
-- refunds; a link or an impression creates nothing. benefit_code is set only when the offer includes a
-- Hunt benefit, and is frozen to that exact SKU.
create table if not exists public.hunt_store_offers (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null references public.hunts(id) on delete restrict,
  seller_space_id uuid not null references public.spaces(id) on delete restrict,
  product_id uuid not null references public.commerce_products(id) on delete restrict,
  variant_id uuid references public.commerce_variants(id) on delete restrict,
  benefit_code text check (benefit_code is null or benefit_code ~ '^[a-z][a-z0-9_-]{1,40}$'),
  requires_state text not null default 'paid' check (requires_state in ('paid','fulfilled')),
  status text not null default 'approved' check (status in ('approved','withdrawn')),
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  unique (id, hunt_id),
  check (status <> 'withdrawn' or withdrawn_at is not null)
);
create unique index if not exists hunt_store_offers_one_approved
  on public.hunt_store_offers(hunt_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'approved';
create index if not exists hunt_store_offers_product_idx on public.hunt_store_offers(product_id);
create index if not exists hunt_store_offers_variant_idx on public.hunt_store_offers(variant_id) where variant_id is not null;
create index if not exists hunt_store_offers_seller_idx on public.hunt_store_offers(seller_space_id);
create index if not exists hunt_store_offers_approved_by_idx on public.hunt_store_offers(approved_by) where approved_by is not null;

-- ── entitlements (FH-037, FH-039) ───────────────────────────────────────────────────────────────
create table if not exists public.hunt_entitlements (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null references public.hunts(id) on delete restrict,
  -- A ticket benefit comes from a pass binding; a store-order benefit comes from an approved offer.
  binding_id uuid,
  offer_id uuid,
  binding_revision integer not null check (binding_revision >= 1),
  source_type text not null check (source_type in ('event-ticket','store-order')),
  source_id uuid not null,
  -- 'seat-1'..'seat-n' for a ticket; '<order item id>:<n>' for an order line unit.
  unit_key text not null check (char_length(unit_key) between 1 and 120),
  benefit_code text not null check (benefit_code ~ '^[a-z][a-z0-9_-]{1,40}$'),
  seller_space_id uuid not null references public.spaces(id) on delete restrict,
  profile_id uuid references public.profiles(id) on delete set null,
  state text not null default 'pending_claim'
    check (state in ('pending_claim','active','suspended','revoked','consumed')),
  suspended_from text check (suspended_from in ('pending_claim','active')),
  -- The newest canonical source version seen. An older paid delivery cannot overwrite a newer one.
  source_seq integer not null default 0 check (source_seq >= 0),
  semantic_key text not null check (char_length(semantic_key) between 8 and 300),
  revoke_reason text check (revoke_reason is null or char_length(revoke_reason) <= 200),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  revoked_at timestamptz,
  consumed_at timestamptz,
  consumed_by uuid references public.profiles(id) on delete set null,
  foreign key (binding_id, hunt_id) references public.hunt_pass_bindings(id, hunt_id),
  foreign key (offer_id, hunt_id) references public.hunt_store_offers(id, hunt_id),
  check (num_nonnulls(binding_id, offer_id) = 1),
  check ((source_type = 'event-ticket') = (binding_id is not null)),
  unique (semantic_key),
  unique (source_type, source_id, unit_key, benefit_code),
  check ((state = 'suspended') = (suspended_from is not null)),
  check (state <> 'revoked' or revoked_at is not null),
  check (state <> 'consumed' or consumed_at is not null)
);
create index if not exists hunt_entitlements_hunt_idx on public.hunt_entitlements(hunt_id);
create index if not exists hunt_entitlements_binding_idx on public.hunt_entitlements(binding_id, hunt_id) where binding_id is not null;
create index if not exists hunt_entitlements_offer_idx on public.hunt_entitlements(offer_id, hunt_id) where offer_id is not null;
create index if not exists hunt_entitlements_source_idx on public.hunt_entitlements(source_type, source_id);
create index if not exists hunt_entitlements_profile_idx on public.hunt_entitlements(profile_id) where profile_id is not null;
create index if not exists hunt_entitlements_seller_idx on public.hunt_entitlements(seller_space_id);
create index if not exists hunt_entitlements_consumed_by_idx on public.hunt_entitlements(consumed_by) where consumed_by is not null;

create table if not exists public.hunt_entitlement_events (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null references public.hunt_entitlements(id) on delete cascade,
  kind text not null check (kind in ('projected','claimed','consumed','revoked','suspended','restored','review')),
  ref text not null check (char_length(ref) between 1 and 200),
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now(),
  unique (entitlement_id, kind, ref)
);

create table if not exists public.hunt_refund_cases (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('event-ticket','store-order')),
  source_id uuid not null,
  unit_key text check (unit_key is null or char_length(unit_key) between 1 and 120),
  kind text not null check (kind in ('partial_unmapped','consumed_reversal','dispute_consumed','intent_mismatch','service')),
  ref text not null check (char_length(ref) between 1 and 200),
  amount_minor bigint check (amount_minor is null or amount_minor >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  status text not null default 'open' check (status in ('open','resolved')),
  resolution text check (resolution is null or char_length(resolution) <= 500),
  resolved_by uuid references public.profiles(id) on delete set null,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (source_type, source_id, kind, ref),
  check (status <> 'resolved' or (resolved_at is not null and resolution is not null))
);
create index if not exists hunt_refund_cases_open_idx on public.hunt_refund_cases(opened_at) where status = 'open';
create index if not exists hunt_refund_cases_resolved_by_idx on public.hunt_refund_cases(resolved_by) where resolved_by is not null;

-- The durable intent: a settled source that must be projected. Written with settlement or found by the
-- repair scan; the semantic key makes the second writer a no-op.
create table if not exists public.hunt_commerce_intents (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('event-ticket','store-order')),
  source_id uuid not null,
  binding_id uuid references public.hunt_pass_bindings(id) on delete restrict,
  offer_id uuid references public.hunt_store_offers(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','projected','review')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text check (last_error is null or char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  projected_at timestamptz,
  check (num_nonnulls(binding_id, offer_id) = 1),
  unique (source_type, source_id, binding_id, offer_id)
);
create index if not exists hunt_commerce_intents_due_idx on public.hunt_commerce_intents(next_attempt_at) where status = 'pending';
create index if not exists hunt_commerce_intents_binding_idx on public.hunt_commerce_intents(binding_id) where binding_id is not null;
create index if not exists hunt_commerce_intents_offer_idx on public.hunt_commerce_intents(offer_id) where offer_id is not null;

-- ── reconciliation (FH-040) ─────────────────────────────────────────────────────────────────────
create table if not exists public.hunt_reconciliation (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('event-ticket','store-order')),
  source_id uuid not null,
  seller_space_id uuid not null references public.spaces(id) on delete restrict,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  expected_amount_minor bigint not null check (expected_amount_minor >= 0),
  provider_amount_minor bigint check (provider_amount_minor is null or provider_amount_minor >= 0),
  fee_minor bigint not null default 0 check (fee_minor >= 0),
  refunded_minor bigint not null default 0 check (refunded_minor >= 0),
  transfer_minor bigint check (transfer_minor is null or transfer_minor >= 0),
  entitlement_count integer not null default 0 check (entitlement_count >= 0),
  status text not null default 'pending' check (status in ('matched','pending','exception')),
  note text check (note is null or char_length(note) <= 300),
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  unique (source_type, source_id)
);
create index if not exists hunt_reconciliation_seller_idx on public.hunt_reconciliation(seller_space_id, first_seen_at desc);
create index if not exists hunt_reconciliation_open_idx on public.hunt_reconciliation(first_seen_at) where status <> 'matched';

-- ── the donation ask (FH-046) ───────────────────────────────────────────────────────────────────
create table if not exists public.hunt_donation_asks (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null references public.hunts(id) on delete restrict,
  beneficiary_space_id uuid not null references public.spaces(id) on delete restrict,
  -- Off until the beneficiary model is approved (D8 / FH-045). Never changes a player's progress.
  enabled boolean not null default false,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  headline text check (headline is null or char_length(headline) <= 120),
  created_at timestamptz not null default now(),
  unique (hunt_id),
  check (not enabled or (approved_at is not null and approved_by is not null))
);
create index if not exists hunt_donation_asks_beneficiary_idx on public.hunt_donation_asks(beneficiary_space_id);
create index if not exists hunt_donation_asks_approved_by_idx on public.hunt_donation_asks(approved_by) where approved_by is not null;

create table if not exists public.hunt_donation_gifts (
  id uuid primary key default gen_random_uuid(),
  ask_id uuid not null references public.hunt_donation_asks(id) on delete restrict,
  -- The canonical Space donation this gift is. The Hunt copies the status; it never takes the payment.
  donation_id uuid not null references public.space_donations(id) on delete restrict,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount_minor bigint not null check (amount_minor > 0),
  refunded_minor bigint not null default 0 check (refunded_minor >= 0),
  status text not null default 'started' check (status in ('started','settled','abandoned','refunded')),
  -- The benefactor's own consent to be named, separate from the donation and from any email consent.
  consent_named boolean not null default false,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (donation_id),
  check (refunded_minor <= amount_minor),
  check (status <> 'settled' or settled_at is not null)
);
create index if not exists hunt_donation_gifts_ask_idx on public.hunt_donation_gifts(ask_id, status);

-- ── the capped sponsor milestone (FH-047) ───────────────────────────────────────────────────────
create table if not exists public.hunt_sponsor_agreements (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null references public.hunts(id) on delete restrict,
  sponsor_label text not null check (char_length(sponsor_label) between 1 and 120),
  threshold integer not null check (threshold >= 1),
  -- One cap per Hunt, no rollover. The pledge is an exact fraction of a cent, rounded down once.
  cap_cents bigint not null check (cap_cents >= 0),
  pledge_numerator bigint not null check (pledge_numerator >= 0),
  pledge_denominator bigint not null check (pledge_denominator > 0),
  status text not null default 'draft' check (status in ('draft','active','void')),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (hunt_id),
  check (status <> 'active' or (approved_at is not null and approved_by is not null))
);
create index if not exists hunt_sponsor_agreements_approved_by_idx on public.hunt_sponsor_agreements(approved_by) where approved_by is not null;

create table if not exists public.hunt_sponsor_snapshots (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.hunt_sponsor_agreements(id) on delete restrict,
  frozen_at timestamptz not null default now(),
  hunt_ends_at timestamptz not null,
  qualification_keys text[] not null,
  owed_cents bigint not null check (owed_cents >= 0),
  -- Frozen once. A replay or a fraud correction later cannot change what this snapshot priced.
  unique (agreement_id)
);

create table if not exists public.hunt_sponsor_settlements (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.hunt_sponsor_snapshots(id) on delete restrict,
  amount_cents bigint not null check (amount_cents >= 0),
  status text not null default 'invoiced' check (status in ('invoiced','paid','void')),
  invoice_ref text check (invoice_ref is null or char_length(invoice_ref) <= 200),
  provider_ref text check (provider_ref is null or char_length(provider_ref) <= 200),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  -- Invoiced once per snapshot, so replay cannot invoice twice.
  unique (snapshot_id),
  check (status <> 'paid' or (paid_at is not null and provider_ref is not null))
);

-- ── access: service role only, like every Hunt table ────────────────────────────────────────────
alter table public.hunt_commerce_state enable row level security;
revoke all on table public.hunt_commerce_state from public, anon, authenticated;
grant all on public.hunt_commerce_state to service_role;
alter table public.hunt_commerce_audit enable row level security;
revoke all on table public.hunt_commerce_audit from public, anon, authenticated;
grant all on public.hunt_commerce_audit to service_role;
alter table public.hunt_pass_bindings enable row level security;
revoke all on table public.hunt_pass_bindings from public, anon, authenticated;
grant all on public.hunt_pass_bindings to service_role;
alter table public.hunt_store_offers enable row level security;
revoke all on table public.hunt_store_offers from public, anon, authenticated;
grant all on public.hunt_store_offers to service_role;
alter table public.hunt_entitlements enable row level security;
revoke all on table public.hunt_entitlements from public, anon, authenticated;
grant all on public.hunt_entitlements to service_role;
alter table public.hunt_entitlement_events enable row level security;
revoke all on table public.hunt_entitlement_events from public, anon, authenticated;
grant all on public.hunt_entitlement_events to service_role;
alter table public.hunt_refund_cases enable row level security;
revoke all on table public.hunt_refund_cases from public, anon, authenticated;
grant all on public.hunt_refund_cases to service_role;
alter table public.hunt_commerce_intents enable row level security;
revoke all on table public.hunt_commerce_intents from public, anon, authenticated;
grant all on public.hunt_commerce_intents to service_role;
alter table public.hunt_reconciliation enable row level security;
revoke all on table public.hunt_reconciliation from public, anon, authenticated;
grant all on public.hunt_reconciliation to service_role;
alter table public.hunt_donation_asks enable row level security;
revoke all on table public.hunt_donation_asks from public, anon, authenticated;
grant all on public.hunt_donation_asks to service_role;
alter table public.hunt_donation_gifts enable row level security;
revoke all on table public.hunt_donation_gifts from public, anon, authenticated;
grant all on public.hunt_donation_gifts to service_role;
alter table public.hunt_sponsor_agreements enable row level security;
revoke all on table public.hunt_sponsor_agreements from public, anon, authenticated;
grant all on public.hunt_sponsor_agreements to service_role;
alter table public.hunt_sponsor_snapshots enable row level security;
revoke all on table public.hunt_sponsor_snapshots from public, anon, authenticated;
grant all on public.hunt_sponsor_snapshots to service_role;
alter table public.hunt_sponsor_settlements enable row level security;
revoke all on table public.hunt_sponsor_settlements from public, anon, authenticated;
grant all on public.hunt_sponsor_settlements to service_role;

-- ── functions ───────────────────────────────────────────────────────────────────────────────────

-- Project one benefit from a settled source. Idempotent on the unit key: a webhook and a return that race
-- write one row. A revoked unit is never reopened by an older delivery, and an older source version never
-- overwrites a newer one. A guest seat stays pending until a profile is attached.
create or replace function public.hunt_entitlement_project(
  p_hunt_id uuid, p_binding_id uuid, p_offer_id uuid, p_binding_revision integer, p_source_type text,
  p_source_id uuid, p_unit_key text, p_benefit_code text, p_seller_space_id uuid, p_profile_id uuid,
  p_source_seq integer, p_semantic_key text)
returns text
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  r public.hunt_entitlements;
  new_id uuid;
begin
  insert into public.hunt_entitlements
    (hunt_id, binding_id, offer_id, binding_revision, source_type, source_id, unit_key, benefit_code, seller_space_id,
     profile_id, state, source_seq, semantic_key, activated_at)
  values
    (p_hunt_id, p_binding_id, p_offer_id, p_binding_revision, p_source_type, p_source_id, p_unit_key, p_benefit_code,
     p_seller_space_id, p_profile_id,
     case when p_profile_id is null then 'pending_claim' else 'active' end,
     greatest(p_source_seq, 0), p_semantic_key,
     case when p_profile_id is null then null else now() end)
  on conflict (source_type, source_id, unit_key, benefit_code) do nothing
  returning id into new_id;

  if new_id is not null then
    insert into public.hunt_entitlement_events (entitlement_id, kind, ref)
    values (new_id, 'projected', p_semantic_key) on conflict do nothing;
    return 'created';
  end if;

  select * into r from public.hunt_entitlements
   where source_type = p_source_type and source_id = p_source_id
     and unit_key = p_unit_key and benefit_code = p_benefit_code
   for update;
  if not found then return 'conflict'; end if;

  if r.state = 'revoked' then return 'refused_revoked'; end if;
  if p_source_seq < r.source_seq then return 'stale'; end if;

  if r.state = 'pending_claim' and p_profile_id is not null then
    update public.hunt_entitlements
       set profile_id = p_profile_id, state = 'active', activated_at = now(),
           source_seq = greatest(source_seq, p_source_seq)
     where id = r.id;
    insert into public.hunt_entitlement_events (entitlement_id, kind, ref)
    values (r.id, 'claimed', 'claim:' || p_profile_id::text) on conflict do nothing;
    return 'claimed';
  end if;

  if p_source_seq > r.source_seq then
    update public.hunt_entitlements set source_seq = p_source_seq where id = r.id;
  end if;
  return 'exists';
end;
$$;

-- Attach a verified attendee to a paid guest seat. Once only: a second profile cannot take the seat.
create or replace function public.hunt_entitlement_attach(
  p_source_type text, p_source_id uuid, p_unit_key text, p_profile_id uuid)
returns integer
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare n integer := 0; r record;
begin
  for r in
    select id from public.hunt_entitlements
     where source_type = p_source_type and source_id = p_source_id and unit_key = p_unit_key
       and state = 'pending_claim'
     for update
  loop
    update public.hunt_entitlements
       set profile_id = p_profile_id, state = 'active', activated_at = now()
     where id = r.id;
    insert into public.hunt_entitlement_events (entitlement_id, kind, ref)
    values (r.id, 'claimed', 'claim:' || p_profile_id::text) on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Consume an unused benefit. Takes the row lock, so it serializes with a reversal.
create or replace function public.hunt_entitlement_consume(p_entitlement_id uuid, p_actor uuid, p_ref text)
returns text
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare r public.hunt_entitlements;
begin
  select * into r from public.hunt_entitlements where id = p_entitlement_id for update;
  if not found then return 'not_found'; end if;
  if r.state = 'consumed' then return 'already_consumed'; end if;
  if r.state <> 'active' then return r.state; end if;
  update public.hunt_entitlements
     set state = 'consumed', consumed_at = now(), consumed_by = p_actor
   where id = r.id;
  insert into public.hunt_entitlement_events (entitlement_id, kind, ref)
  values (r.id, 'consumed', coalesce(nullif(p_ref, ''), 'consume:' || r.id::text)) on conflict do nothing;
  return 'consumed';
end;
$$;

-- Reverse a source (or one unit of it). p_mode: refund | dispute_open | dispute_lost | dispute_won.
-- p_ref is the canonical refund or dispute identity, so a repeated delivery does nothing twice. A
-- consumed benefit is never reopened: it opens a case instead. Returns counts.
create or replace function public.hunt_entitlement_reverse(
  p_source_type text, p_source_id uuid, p_unit_key text, p_mode text, p_ref text)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  r record;
  fresh integer;
  revoked_n integer := 0;
  suspended_n integer := 0;
  restored_n integer := 0;
  cases_n integer := 0;
begin
  if p_mode not in ('refund','dispute_open','dispute_lost','dispute_won') then
    raise exception 'unknown reversal mode %', p_mode using errcode = '22023';
  end if;
  if p_ref is null or char_length(btrim(p_ref)) = 0 then
    raise exception 'a reversal needs the canonical refund or dispute reference' using errcode = '22023';
  end if;

  for r in
    select id, state, suspended_from, unit_key from public.hunt_entitlements
     where source_type = p_source_type and source_id = p_source_id
       and (p_unit_key is null or unit_key = p_unit_key)
     order by id
     for update
  loop
    if r.state = 'consumed' then
      if p_mode in ('refund','dispute_lost') then
        insert into public.hunt_refund_cases (source_type, source_id, unit_key, kind, ref)
        values (p_source_type, p_source_id, r.unit_key,
                case when p_mode = 'refund' then 'consumed_reversal' else 'dispute_consumed' end, p_ref)
        on conflict do nothing;
        get diagnostics fresh = row_count;
        cases_n := cases_n + fresh;
      end if;
      continue;
    end if;

    if p_mode in ('refund','dispute_lost') then
      if r.state <> 'revoked' then
        insert into public.hunt_entitlement_events (entitlement_id, kind, ref)
        values (r.id, 'revoked', p_mode || ':' || p_ref) on conflict do nothing;
        get diagnostics fresh = row_count;
        update public.hunt_entitlements
           set state = 'revoked', suspended_from = null, revoked_at = coalesce(revoked_at, now()),
               revoke_reason = left(p_mode, 200)
         where id = r.id;
        revoked_n := revoked_n + 1;
      end if;
    elsif p_mode = 'dispute_open' then
      if r.state in ('pending_claim','active') then
        update public.hunt_entitlements set state = 'suspended', suspended_from = r.state where id = r.id;
        insert into public.hunt_entitlement_events (entitlement_id, kind, ref)
        values (r.id, 'suspended', p_mode || ':' || p_ref) on conflict do nothing;
        suspended_n := suspended_n + 1;
      end if;
    elsif p_mode = 'dispute_won' then
      if r.state = 'suspended' then
        update public.hunt_entitlements set state = r.suspended_from, suspended_from = null where id = r.id;
        insert into public.hunt_entitlement_events (entitlement_id, kind, ref)
        values (r.id, 'restored', p_mode || ':' || p_ref) on conflict do nothing;
        restored_n := restored_n + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object('revoked', revoked_n, 'suspended', suspended_n, 'restored', restored_n, 'cases', cases_n);
end;
$$;

-- Open a review case once. A repeated delivery with the same reference opens nothing new.
create or replace function public.hunt_refund_case_open(
  p_source_type text, p_source_id uuid, p_unit_key text, p_kind text, p_ref text,
  p_amount_minor bigint, p_currency text)
returns boolean
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare n integer;
begin
  insert into public.hunt_refund_cases (source_type, source_id, unit_key, kind, ref, amount_minor, currency)
  values (p_source_type, p_source_id, p_unit_key, p_kind, p_ref, p_amount_minor, p_currency)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- The kill switch. Stops NEW sales; projection, refund handling and reconciliation do not read it.
create or replace function public.hunt_commerce_set_sales(p_open boolean, p_actor uuid, p_reason text)
returns boolean
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if not p_open and char_length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'closing sales needs a reason' using errcode = '22023';
  end if;
  update public.hunt_commerce_state
     set sales_open = p_open, reason = left(p_reason, 300), changed_by = p_actor, changed_at = now()
   where id;
  insert into public.hunt_commerce_audit (actor_profile_id, action, detail)
  values (p_actor, case when p_open then 'sales_open' else 'sales_closed' end,
          jsonb_build_object('reason', left(coalesce(p_reason, ''), 300)));
  return p_open;
end;
$$;

-- Freeze the sponsor threshold once. A second call (replay, a fraud correction) returns the first snapshot
-- unchanged and never re-prices it.
create or replace function public.hunt_sponsor_freeze(
  p_agreement_id uuid, p_hunt_ends_at timestamptz, p_keys text[], p_owed_cents bigint)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare s public.hunt_sponsor_snapshots; created boolean := false;
begin
  insert into public.hunt_sponsor_snapshots (agreement_id, hunt_ends_at, qualification_keys, owed_cents)
  values (p_agreement_id, p_hunt_ends_at, p_keys, p_owed_cents)
  on conflict (agreement_id) do nothing
  returning * into s;
  if found then
    created := true;
  else
    select * into s from public.hunt_sponsor_snapshots where agreement_id = p_agreement_id;
  end if;
  return jsonb_build_object('snapshot_id', s.id, 'owed_cents', s.owed_cents, 'created', created);
end;
$$;

revoke all on function public.hunt_pass_binding_freeze() from public, anon, authenticated;
grant execute on function public.hunt_pass_binding_freeze() to service_role;
revoke all on function public.hunt_entitlement_project(uuid,uuid,uuid,integer,text,uuid,text,text,uuid,uuid,integer,text) from public, anon, authenticated;
grant execute on function public.hunt_entitlement_project(uuid,uuid,uuid,integer,text,uuid,text,text,uuid,uuid,integer,text) to service_role;
revoke all on function public.hunt_entitlement_attach(text,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.hunt_entitlement_attach(text,uuid,text,uuid) to service_role;
revoke all on function public.hunt_entitlement_consume(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.hunt_entitlement_consume(uuid,uuid,text) to service_role;
revoke all on function public.hunt_entitlement_reverse(text,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.hunt_entitlement_reverse(text,uuid,text,text,text) to service_role;
revoke all on function public.hunt_refund_case_open(text,uuid,text,text,text,bigint,text) from public, anon, authenticated;
grant execute on function public.hunt_refund_case_open(text,uuid,text,text,text,bigint,text) to service_role;
revoke all on function public.hunt_commerce_set_sales(boolean,uuid,text) from public, anon, authenticated;
grant execute on function public.hunt_commerce_set_sales(boolean,uuid,text) to service_role;
revoke all on function public.hunt_sponsor_freeze(uuid,timestamptz,text[],bigint) from public, anon, authenticated;
grant execute on function public.hunt_sponsor_freeze(uuid,timestamptz,text[],bigint) to service_role;

comment on table public.hunt_entitlements is 'FH-037: one benefit per (source, seat or order unit, benefit code). Projected from settlement, never from a Hunt claim. Service role only.';
comment on table public.hunt_pass_bindings is 'FH-036: a published Hunt version bound to one Event ticket tier. Frozen once written.';
comment on table public.hunt_commerce_state is 'FH-040: the sales kill switch. Closing it stops new sales only.';

commit;
