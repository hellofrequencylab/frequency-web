-- Operator-tunable Vera config (AI-VERA.md). A single JSON row a janitor edits from
-- /admin/vera to tune Vera's style + responses + the induction/funnel copy — no
-- deploy needed. Staff-only: service-role access, no public RLS policy. Applied via MCP.
create table if not exists public.vera_config (
  id         text primary key default 'singleton',
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint vera_config_singleton check (id = 'singleton')
);
alter table public.vera_config enable row level security; -- no policies: service-role only

insert into public.vera_config (id, config) values ('singleton', '{}'::jsonb)
on conflict (id) do nothing;

comment on table public.vera_config is
  'Operator-tunable Vera config (style, responses, induction copy). Single row, staff-edited from /admin/vera. Defaults in lib/ai/vera/config.ts. See AI-VERA.md.';
