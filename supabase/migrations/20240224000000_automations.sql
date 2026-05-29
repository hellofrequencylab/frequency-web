-- Phase 6.4 (COMMS-CRM §3): Automations rules engine. A rule subscribes to the one
-- event backbone (ADR-025): when a matching engagement event is recorded, it runs an
-- action. MVP action: email the event's actor (consent-checked, queued). Service-role
-- only. Additive.

create table if not exists public.automation_rules (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  trigger_event text not null,                         -- engagement_events.event_type, e.g. 'practice.verified'
  action_type   text not null default 'email_actor',   -- email_actor (MVP)
  action_config jsonb not null default '{}'::jsonb,     -- e.g. { subject, body }
  enabled       boolean not null default true,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists automation_rules_trigger_idx
  on public.automation_rules (trigger_event, enabled);

alter table public.automation_rules enable row level security;
-- No policies: Studio-only (behind requireStaff) + the server-side evaluator.

comment on table public.automation_rules is
  'Studio automations: trigger (engagement event_type) -> action. Evaluated by lib/automations.ts as a subscriber to the event backbone. Service-role only. See docs/COMMS-CRM-ARCHITECTURE.md §3.';
