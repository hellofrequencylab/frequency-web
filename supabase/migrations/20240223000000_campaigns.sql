-- Phase 6.4 (COMMS-CRM §3): Studio marketing campaigns. A campaign is a broadcast
-- email sent to a contact segment through the spine (queued, consent-checked,
-- suppression-aware, with per-recipient unsubscribe). Service-role only. Additive.

create table if not exists public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  subject         text not null,
  body            text not null,
  segment         text not null default 'members',  -- members | subscribed_members
  status          text not null default 'draft',     -- draft | sent
  recipient_count integer not null default 0,
  created_by      uuid references public.profiles(id) on delete set null,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists campaigns_created_idx on public.campaigns (created_at desc);

alter table public.campaigns enable row level security;
-- No policies: Studio-only, behind requireStaff().

comment on table public.campaigns is
  'Studio marketing campaigns (broadcast emails to a contact segment via the spine). Service-role only. See docs/COMMS-CRM-ARCHITECTURE.md §3.';
