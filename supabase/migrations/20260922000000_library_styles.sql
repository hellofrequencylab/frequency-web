-- The Loom brand STYLES — trained house styles for consistent generated sets (ADR-489).
--
-- Recraft can train a reusable "style" from a handful of reference images and return a style_id;
-- passing that style_id to a generation makes every image match the set (icons that look like one
-- family, trophies in one house look). This table persists the operator's trained styles so the
-- Image Studio can offer them as a pick when generating. The images themselves live on Recraft's
-- side; we only keep the id + a friendly name + which lane it targets.
--
-- Service-role only, matching the rest of the Loom (library_assets et al.): RLS is ENABLED with NO
-- policy, so anon/auth clients are fully fail-closed and the only access path is the gated admin
-- server actions. See docs/LIBRARY.md.

create table if not exists public.library_styles (
  id               uuid primary key default gen_random_uuid(),
  space_id         uuid not null references public.spaces(id) on delete cascade,
  name             text not null,
  recraft_style_id text not null,
  lane             text not null default 'vector',   -- 'vector' | 'raster'
  base_style       text,                             -- the Recraft base the style was trained on
  ref_count        int  not null default 0,          -- how many reference images trained it
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists library_styles_space_idx
  on public.library_styles (space_id, created_at desc);

alter table public.library_styles enable row level security;
-- No policy: fail-closed. All reads/writes go through the service-role admin client in
-- lib/library/styles.ts + app/(main)/admin/library/recraft-actions.ts.
