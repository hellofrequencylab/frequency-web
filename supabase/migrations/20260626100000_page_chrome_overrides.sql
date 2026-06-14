-- Page chrome overrides: operator-managed SHELL CHROME (the right rail) per route.
-- Makes the code-only chrome map (lib/layout/page-chrome.ts) operator-overridable
-- WITHOUT a code deploy. Each row pins one route to a rail mode; an absent row keeps
-- the code default (railFor). See docs/PAGE-FRAMEWORK.md §3/§8 (the one shell + five
-- templates + the chrome map): 'global' = the community right rail, 'scoped' = the
-- entity-detail page renders its own in-body scope rail (global suppressed), 'none' =
-- a FOCUS full-width work surface with no rail.
--
-- v1 STORES intent: the management surface (/admin/page-layout) and the fail-safe
-- resolver (lib/layout/page-chrome.ts resolvePageChrome / mergeChrome) land now; the
-- live app-shell adopting the resolver is a flagged FOLLOW-UP (the events agent + the
-- app-shell monolith make rewiring the live read risky today). Until then an override
-- configures the intended chrome; the visible effect arrives when the shell reads it.
--
-- House style: additive + idempotent, RLS on. Applied to production via the Supabase
-- SQL Editor (the repo migration-history baseline predates `db push` being safe here —
-- see docs/WORKFLOW.md). lib/database.types.ts is regenerated separately; the reader
-- (loadChromeOverrides) is FAIL-SAFE and returns {} until this migration is applied.

-- ── The route → rail override store ─────────────────────────────────────────────────────
create table if not exists public.page_chrome_overrides (
  -- A safe app path string (e.g. '/feed', '/admin'); validated app-side before write.
  route      text primary key,
  -- The rail mode this route should resolve to. Mirrors lib/layout/page-chrome.ts Rail.
  rail       text not null check (rail in ('global', 'scoped', 'none')),
  -- Optional operator note (why this route was reframed).
  note       text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
comment on table public.page_chrome_overrides is
  'Operator overrides for a route''s SHELL CHROME (right rail): route -> rail in (global|scoped|none). Merged over the code defaults in lib/layout/page-chrome.ts (railFor). docs/PAGE-FRAMEWORK.md §3/§8.';

alter table public.page_chrome_overrides enable row level security;

-- World-readable: the chrome resolver merges these over the code defaults per request
-- and must see them regardless of the caller's auth context (the rail is non-sensitive
-- presentation data, like the menu_config / themes config). Writes go EXCLUSIVELY
-- through the service-role admin client in a janitor-gated server action; there is
-- intentionally no client-facing write policy.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'page_chrome_overrides'
      and policyname = 'page_chrome_overrides_read_all'
  ) then
    create policy page_chrome_overrides_read_all
      on public.page_chrome_overrides for select
      using (true);
  end if;
end $$;
