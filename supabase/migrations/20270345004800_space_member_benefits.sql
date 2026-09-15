-- space_member_benefits: what a membership tier is WORTH at a checkout (ADR-1372).
-- Canonical record: supabase/migrations/20270345004800_space_member_benefits.sql. SAFE to re-run.

create table if not exists public.space_member_benefits (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  kind        text not null
                check (kind in ('included', 'percent', 'amount_off', 'fixed_price')),
  value       integer not null default 0 check (value >= 0),
  scope       text not null default 'space_events'
                check (scope in ('space_events', 'guest_events', 'stays', 'products', 'all')),
  label       text not null,
  max_uses    integer check (max_uses is null or max_uses > 0),
  period      text check (period is null or period in ('month', 'year')),
  starts_at   timestamptz,
  ends_at     timestamptz,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint space_member_benefits_percent_range
    check (kind <> 'percent' or value between 0 and 10000),
  constraint space_member_benefits_window
    check (starts_at is null or ends_at is null or ends_at > starts_at)
);

comment on table public.space_member_benefits is
  'What a membership tier is worth at a checkout (ADR-1372): a priced modifier with a scope, assigned to tiers via space_tier_benefits. Complements the ADR-823 admission gate rather than replacing it. Writes are service-role only, gated on canEditProfile.';
comment on column public.space_member_benefits.kind is
  'included = 100% off; percent = value is basis points (1500 = 15%); amount_off = value is cents off; fixed_price = value is the cents the member pays.';
comment on column public.space_member_benefits.value is
  'Basis points for percent, cents for amount_off and fixed_price, 0 and ignored for included.';
comment on column public.space_member_benefits.scope is
  'What this applies to. all matches every scope; every other value matches only itself.';
comment on column public.space_member_benefits.label is
  'What the BUYER sees on the checkout line, e.g. "Temple Member, 15% off". Never the internal kind.';
comment on column public.space_member_benefits.max_uses is
  'Max redemptions per period; null = uncapped. This is what makes a guest pass a benefit rather than a policy line.';
comment on column public.space_member_benefits.is_active is
  'false = retired: stops applying, but is kept so a past redemption still names a real row.';

create index if not exists space_member_benefits_space_idx
  on public.space_member_benefits (space_id);

create table if not exists public.space_tier_benefits (
  tier_id     uuid not null references public.space_membership_tiers(id) on delete cascade,
  benefit_id  uuid not null references public.space_member_benefits(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (tier_id, benefit_id)
);

comment on table public.space_tier_benefits is
  'Assigns a space_member_benefits row to a space_membership_tiers row (ADR-1372). Many-to-many so one benefit serves several tiers and can never drift between them.';

create index if not exists space_tier_benefits_benefit_idx
  on public.space_tier_benefits (benefit_id);

create table if not exists public.space_benefit_redemptions (
  id                 uuid primary key default gen_random_uuid(),
  benefit_id         uuid not null references public.space_member_benefits(id) on delete cascade,
  member_profile_id  uuid not null references public.profiles(id),
  period_key         text not null default 'lifetime',
  amount_cents       integer not null default 0 check (amount_cents >= 0),
  created_at         timestamptz not null default now()
);

comment on table public.space_benefit_redemptions is
  'One row per benefit redemption (ADR-1372), stamped with the period key it counts against so a max_uses cap is a cheap equality read. Service-role writes only, from the checkout path.';
comment on column public.space_benefit_redemptions.period_key is
  'The window this redemption counts against: YYYY-MM for a monthly cap, YYYY for a yearly one, lifetime when the benefit is uncapped or capped in total.';

create index if not exists space_benefit_redemptions_cap_idx
  on public.space_benefit_redemptions (benefit_id, member_profile_id, period_key);

alter table public.space_member_benefits      enable row level security;
alter table public.space_tier_benefits        enable row level security;
alter table public.space_benefit_redemptions  enable row level security;

-- ── RECOVERY ADDENDUM (2026-09-15) ───────────────────────────────────────────────────────────
-- Everything above this line is the SQL as APPLIED to production on 2026-09-15 20:27:10Z,
-- recovered verbatim from supabase_migrations.schema_migrations.statements (4615 bytes,
-- md5 c8fd8886ae466cf8c7bf8311d2d1ffc7). It was applied with no file on any branch, so the repo
-- could not reproduce its own database until this file existed.
--
-- The three tables are `internal` in scripts/table-grants.txt: RLS on, zero policies, which is
-- the verdict the contract defines for service-role-only tables and the only one that fails
-- closed. The table comments above say so themselves ("Writes are service-role only",
-- "Service-role writes only, from the checkout path").
--
-- These revokes are REQUIRED by that verdict and were NOT in the applied SQL. Supabase's
-- ALTER DEFAULT PRIVILEGES grants anon and authenticated full rights on every new table, and
-- REVOKE ... FROM public does not remove them (ADR-959) -- so all three sat in production with
-- ALL granted to anon and authenticated, held shut only by RLS having no policies. That is safe
-- today and fragile tomorrow: the first policy written for reads would be governed by an ALL
-- grant and would open INSERT/UPDATE/DELETE with it. Applied to production in the same pass that
-- committed this file, so the tree and the database agree.
revoke all on table public.space_member_benefits      from anon, authenticated;
revoke all on table public.space_tier_benefits        from anon, authenticated;
revoke all on table public.space_benefit_redemptions  from anon, authenticated;
