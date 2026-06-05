-- Audit log for platform_flags toggles + the operator surface behind /admin/ai
-- (ADR-096 addendum). Append-only: who flipped which flag, when, old → new. The
-- AI kill switch (platform_flags.ai_enabled) is now operable from the Janitor menu
-- instead of only via SQL, and every change is recorded here for accountability.
--
-- Operator-only: reads/writes go through the service-role admin client behind
-- requireAdmin('janitor') (same model as platform_flags itself — RLS on, no policy
-- means clients can't touch it). Additive; regenerate types after applying.
create table if not exists public.platform_flag_events (
  id          uuid primary key default gen_random_uuid(),
  flag_key    text not null,
  value       boolean not null,        -- the new value
  previous    boolean,                 -- prior value (null when first set)
  changed_by  uuid references public.profiles(id) on delete set null,
  source      text not null default 'admin' check (source in ('admin', 'setup', 'system')),
  created_at  timestamptz not null default now()
);
create index if not exists platform_flag_events_key_idx
  on public.platform_flag_events (flag_key, created_at desc);

alter table public.platform_flag_events enable row level security;
-- No policies: operator-only via the service role behind requireAdmin('janitor').

comment on table public.platform_flag_events is
  'Append-only audit of platform_flags toggles (who/when/old->new). Operator-only via service role; surfaced at /admin/ai. See ADR-096.';
