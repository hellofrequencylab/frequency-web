-- Operator template curation (ADR-126 Phase 2b). Which entry-point templates crew may
-- use. The templates themselves are a code registry (lib/entry-points/templates.ts);
-- this is just an enabled/disabled override per template_id. A missing row means
-- enabled (so new templates are available by default). Service-role only.

create table if not exists public.entry_template_settings (
  template_id text primary key,
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now()
);

comment on table public.entry_template_settings is
  'ADR-126 Phase 2b: operator curation of which entry-point templates crew may use. Row absent => enabled. Service-role only.';

drop trigger if exists entry_template_settings_set_updated_at on public.entry_template_settings;
create trigger entry_template_settings_set_updated_at
  before update on public.entry_template_settings
  for each row execute function public.set_updated_at();

alter table public.entry_template_settings enable row level security;
