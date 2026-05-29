-- Phase 6.3 (docs/COMMS-CRM-ARCHITECTURE.md §3; ADR-027): Studio CRM data.
--
-- Staff roles are a SEPARATE authz axis from community roles (a community
-- moderator is not a business operator). `contacts` is the unified CRM record for
-- everyone (lead/customer/member); lowercased email is the join key and
-- `profile_id` is auto-linked on signup so CRM history carries onto the member.
-- Both tables are service-role only (the Studio is server-rendered behind
-- requireStaff). Additive; regenerate types after applying.

create table if not exists public.team_members (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'analyst',  -- analyst | marketer | admin | owner
  created_at timestamptz not null default now(),
  unique (profile_id)
);

create table if not exists public.contacts (
  id               uuid primary key default gen_random_uuid(),
  email            text not null,
  profile_id       uuid references public.profiles(id) on delete set null,
  display_name     text,
  consent_state    text not null default 'unknown',  -- unknown | subscribed | unsubscribed
  engagement_score numeric not null default 0,        -- projection off the event backbone + email_events
  source           text,
  meta             jsonb not null default '{}'::jsonb,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists contacts_email_lower_idx on public.contacts (lower(email));
create index if not exists contacts_profile_idx on public.contacts (profile_id);
create index if not exists contacts_consent_idx on public.contacts (consent_state);

alter table public.team_members enable row level security;
alter table public.contacts     enable row level security;
-- No policies: Studio reads/writes are service-role behind requireStaff().

comment on table public.team_members is
  'Studio staff roles (owner/admin/marketer/analyst), distinct from community roles. Gated via lib/staff.ts requireStaff(). See COMMS-CRM §3 + ADR-027.';
comment on table public.contacts is
  'Unified CRM contact (lead/customer/member). lower(email) = unique join key; profile_id nullable, auto-linked on signup. engagement_score is a projection. Service-role only.';
