-- PROG-E9 part 2 (docs/EDITOR-ARCHITECTURE.md E9; docs/EDITOR-GATES.md section 4): the Loom function store.
--
-- A Loom function is a declaration an operator composes from the primitive manifest (lib/loom/functions/
-- primitives.ts) over a real block schema: strict JSON data, never JavaScript (ADR-975's declarative ceiling).
-- This adds the one table that persists them:
--
--   * public.loom_functions: one row per (Space, surface, slug). `declaration` is the validated function as
--     stored; `slug` repeats its `id` so the key is a real column. `version` counts saves (1, 2, 3), so an
--     update can refuse a stale write.
--
-- Service role only, like page_versions: RLS on with no policy, and no grant to anon or authenticated. The only
-- reader and writer is lib/loom/store.ts, and every write there goes through validateLoomFunction first
-- (check:loom-integrity M4 and M5). A row that fails today's validator is never run (lib/loom/functions/run.ts).
--
-- Nothing calls this until the app is deployed and EDITOR_CANVAS is on. Additive and idempotent.

begin;

create table if not exists public.loom_functions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  surface text not null check (surface ~ '^[a-z][a-z0-9-]{1,39}$'),
  slug text not null check (slug ~ '^[a-z][a-z0-9-]{1,62}$'),
  declaration jsonb not null check (jsonb_typeof(declaration) = 'object' and declaration->>'id' = slug),
  version integer not null default 1 check (version >= 1),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The key, and the index on space_id (it leads).
create unique index if not exists loom_functions_space_surface_slug_key on public.loom_functions (space_id, surface, slug);
create index if not exists loom_functions_created_by_idx on public.loom_functions (created_by);
create index if not exists loom_functions_updated_by_idx on public.loom_functions (updated_by);

alter table public.loom_functions enable row level security;
revoke all on table public.loom_functions from anon, authenticated;

commit;
