-- Member Data Platform · Phase 3 (ADR-069). Saved, reusable audience definitions
-- over tags + computed traits. Staff-only (service-role access; no public RLS policy).
-- Definitions are validated against the trait registry at the app layer. Applied via MCP.
create table if not exists public.segments (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  definition  jsonb not null,
  is_system   boolean not null default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.segments enable row level security; -- no policies: service-role only

comment on table public.segments is
  'Saved audience definitions (predicates over tags + computed traits). Staff-only. Validated against lib/traits/registry.ts. See MEMBER-DATA-PLATFORM.md, ADR-069.';

-- Starter segments demonstrating the model (combinator + predicates).
insert into public.segments (slug, name, description, definition, is_system) values
  ('web-beta', 'Web Beta', 'The founding cohort — your earliest members.',
   '{"combinator":"all","predicates":[{"type":"tag","key":"web_beta"}]}', true),
  ('weekly-active', 'Weekly Active', 'Members with a verified practice in the last 7 days (the North Star).',
   '{"combinator":"all","predicates":[{"type":"trait","key":"wam_status","op":"eq","value":true}]}', true),
  ('web-beta-active', 'Web Beta · still active', 'Founding members who are Weekly Active — your core advocates.',
   '{"combinator":"all","predicates":[{"type":"tag","key":"web_beta"},{"type":"trait","key":"wam_status","op":"eq","value":true}]}', true),
  ('at-risk', 'At risk', 'Active 14–30 days ago — prime for a gentle win-back.',
   '{"combinator":"all","predicates":[{"type":"trait","key":"lifecycle_stage","op":"eq","value":"at_risk"}]}', true),
  ('newcomers', 'Newcomers', 'Joined recently, not yet activated — the onboarding focus.',
   '{"combinator":"all","predicates":[{"type":"trait","key":"lifecycle_stage","op":"eq","value":"new"}]}', true)
on conflict (slug) do nothing;
