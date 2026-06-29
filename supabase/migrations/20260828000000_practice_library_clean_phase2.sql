-- =============================================================================
-- Practice library at scale — Phase 2 "Clean" foundation (ADR-438; spec PRACTICE-LIBRARY §6).
--
-- Schema + the merge RPC the Clean phase needs:
--   1. updated_at (+ touch trigger) — the freshness signal for the quality score (2.3).
--      practices only had created_at; "stale" needs a real last-touched timestamp.
--   2. merged_into — audit pointer on a retired duplicate to its canonical (2.2).
--   3. practice_slug_redirects — old slug → canonical id, so a merged practice's links/SEO
--      keep working (the route falls back to this when a slug misses) (2.2).
--   4. merge_practices(from_id, to_id) — re-points every practice_id FK onto the canonical,
--      handling the three unique-constrained tables (member_practices · practice_logs ·
--      practice_tags) by dropping the losing duplicate first, then re-pointing the rest;
--      re-points the no-constraint tables (circle_practices · journey_plan_items ·
--      practice_sessions) freely; fixes lineage self-refs; records the slug redirect; and
--      retires the source (archived + unpublished + merged_into). Re-point, never delete:
--      history is preserved on the canonical.
--
-- DOES NOT TOUCH the log-time chokepoint or valuation (Phase 4). Behavior-neutral for members:
-- additive columns; a merged source is archived + unpublished, so member reads (is_public=true)
-- never surface it, and its links 301 to the canonical via the redirect table.
--
-- IDEMPOTENT: guarded adds + create-or-replace. Apply on a branch / via MCP with verification,
-- regenerate types, then merge. service_role-only RPC (the admin workspace reads via service role).
-- =============================================================================

-- 1. Freshness: updated_at + a touch trigger.
alter table public.practices add column if not exists updated_at timestamptz not null default now();

create or replace function public.practices_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_practices_touch_updated_at on public.practices;
create trigger trg_practices_touch_updated_at
  before update on public.practices
  for each row execute function public.practices_touch_updated_at();

comment on column public.practices.updated_at is
  'Last-touched timestamp (maintained by trg_practices_touch_updated_at). The freshness input to the Phase-2 quality score; created_at alone is not freshness.';

-- 2. Merge audit pointer.
alter table public.practices add column if not exists merged_into uuid references public.practices(id) on delete set null;
create index if not exists practices_merged_into_idx on public.practices (merged_into) where merged_into is not null;
comment on column public.practices.merged_into is
  'When set, this practice was merged into the referenced canonical (Phase 2 dedup). The row is archived + unpublished; its old slug redirects via practice_slug_redirects.';

-- 3. Slug redirects (old slug → canonical practice). RLS on, no policies → service_role only
--    (the public practice route resolves a missed slug through this via the service-role read).
create table if not exists public.practice_slug_redirects (
  old_slug text primary key,
  practice_id uuid not null references public.practices(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists practice_slug_redirects_practice_idx on public.practice_slug_redirects (practice_id);
alter table public.practice_slug_redirects enable row level security;
comment on table public.practice_slug_redirects is
  'Old practice slug → the canonical it was merged into. The /practices and /discover/practices routes fall back to this when a slug no longer matches a live practice, so merged links 301 instead of 404. service_role only (read via the service role server-side).';

-- 4. The merge choreography. Re-point all FKs onto the canonical, retire the source.
create or replace function public.merge_practices(from_id uuid, to_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  from_slug text;
begin
  if from_id = to_id then raise exception 'cannot merge a practice into itself'; end if;
  if not exists (select 1 from practices where id = from_id) then raise exception 'source practice % not found', from_id; end if;
  if not exists (select 1 from practices where id = to_id) then raise exception 'canonical practice % not found', to_id; end if;
  if exists (select 1 from practices where id = from_id and merged_into is not null) then raise exception 'source % is already merged', from_id; end if;
  if exists (select 1 from practices where id = to_id and merged_into is not null) then raise exception 'canonical % is itself merged; merge into the live practice', to_id; end if;

  select slug into from_slug from practices where id = from_id;

  -- Unique-constrained tables: drop the duplicate that would collide, then re-point the rest.
  delete from member_practices mf using member_practices mt
    where mf.practice_id = from_id and mt.practice_id = to_id and mf.profile_id = mt.profile_id;
  update member_practices set practice_id = to_id where practice_id = from_id;

  delete from practice_logs lf using practice_logs lt
    where lf.practice_id = from_id and lt.practice_id = to_id
      and lf.profile_id = lt.profile_id and lf.logged_for = lt.logged_for;
  update practice_logs set practice_id = to_id where practice_id = from_id;

  delete from practice_tags tf using practice_tags tt
    where tf.practice_id = from_id and tt.practice_id = to_id and tf.tag_id = tt.tag_id;
  update practice_tags set practice_id = to_id where practice_id = from_id;

  -- No unique constraint on practice_id: re-point freely.
  update circle_practices set practice_id = to_id where practice_id = from_id;
  update journey_plan_items set practice_id = to_id where practice_id = from_id;
  update practice_sessions set practice_id = to_id where practice_id = from_id;

  -- Lineage self-refs that pointed at the retired practice now point at the canonical.
  update practices set remixed_from = to_id where remixed_from = from_id;
  update practices set root_practice_id = to_id where root_practice_id = from_id;

  -- Keep the old links alive.
  if from_slug is not null then
    insert into practice_slug_redirects (old_slug, practice_id) values (from_slug, to_id)
      on conflict (old_slug) do update set practice_id = excluded.practice_id;
  end if;

  -- Retire the source (re-point, never delete: history lives on the canonical now).
  update practices set status = 'archived', is_public = false, merged_into = to_id where id = from_id;

  return jsonb_build_object('from', from_id, 'to', to_id, 'old_slug', from_slug);
end;
$$;

revoke all on function public.merge_practices(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_practices(uuid, uuid) to service_role;

comment on function public.merge_practices is
  'Phase-2 dedup merge (ADR-438): re-points every practice_id FK (adoptions, logs, tags, circle, journey, sessions) + lineage self-refs onto the canonical, dropping duplicates that would violate the unique constraints; records the old slug as a redirect; archives + unpublishes + stamps merged_into on the source. Re-point, never delete. service_role only.';
