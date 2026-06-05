-- Entry Points & Campaigns — Phase 1 (ADR-126, docs/ENTRY-POINTS.md).
--
-- An Entry Point is a crew/org-owned `qr_codes` row (owner_profile_id set, purpose
-- NULL — so the unique (owner,purpose) index doesn't cap them) built from a TEMPLATE
-- and carrying FLYER slot content. It reuses the whole QR pipeline: the printed image
-- encodes /q/<slug>, the resolver already credits the owner when an anonymous scan
-- signs up (invite_accepted zaps), and the styled renderer makes the QR. This
-- migration only adds the template/flyer/campaign metadata + the create-reward config.
-- ADDITIVE; existing codes unaffected. After applying, regenerate types:
--   npx supabase gen types typescript --linked > lib/database.types.ts

-- Campaigns: a themed group of entry points (admin, Phase 2). Created now so the FK
-- exists; crew entry points leave campaign_id null in Phase 1.
create table if not exists public.entry_campaigns (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  goal             text,                                          -- the template/goal key
  template_id      text,
  owner_profile_id uuid references public.profiles(id) on delete set null,
  status           text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists entry_campaigns_owner_idx on public.entry_campaigns (owner_profile_id);

create trigger entry_campaigns_set_updated_at
  before update on public.entry_campaigns
  for each row execute function public.set_updated_at();

alter table public.entry_campaigns enable row level security;
-- Server-mediated (service role), like qr_codes / contacts. No client policies.

-- Entry-point metadata on qr_codes: which template built it, its flyer slot content,
-- and (optional) the campaign it belongs to. An entry point is identified by
-- template_id IS NOT NULL (distinguishes it from a bare marketing code).
alter table public.qr_codes add column if not exists template_id text;
alter table public.qr_codes add column if not exists flyer       jsonb not null default '{}'::jsonb;
alter table public.qr_codes add column if not exists campaign_id uuid references public.entry_campaigns(id) on delete set null;
create index if not exists qr_codes_template_idx on public.qr_codes (owner_profile_id, template_id);
create index if not exists qr_codes_campaign_idx on public.qr_codes (campaign_id);

comment on column public.qr_codes.template_id is
  'Entry Points (ADR-126): the template a code was built from. NOT NULL ⇒ this code is an Entry Point.';
comment on column public.qr_codes.flyer is
  'Entry Points (ADR-126): flyer slot content { headline, subhead, footer } for the print-ready flyer.';

-- Reward config for the create + activate actions (lib/zaps.ts reads zap_config;
-- ZAP_AMOUNTS is the fallback). Create is capped in app code to the first N per
-- member (anti-farm); the activate bonus credits the referrer when a referred member
-- hits their first verified practice.
insert into public.zap_config (action_type, zaps_amount, daily_cap, description) values
  ('entry_point_created', 20, null, 'Set up an entry point / funnel (capped to the first few per member)'),
  ('referral_activated',  25, null, 'A member you brought in hit their first verified practice')
on conflict (action_type) do nothing;

comment on table public.entry_campaigns is
  'Entry Points & Campaigns (ADR-126): a themed group of entry points. Server-mediated. See docs/ENTRY-POINTS.md.';
