-- H1-1 — Resolve the polymorphic scope foreign keys (Foundation Hardening, ADR-449).
-- EXPAND phase of an expand/contract migration. Additive + non-breaking: zero app change.
--
-- The problem (FOUNDATION-HARDENING-PLAN §5 H1-1, "highest priority in H1"): `posts.scope_id`
-- and `events.scope_id` are bare UUIDs with NO foreign key. Nothing stops a future orphan
-- (delete a circle, its posts/events dangle) and RLS that keys off an unconstrained column can
-- mis-evaluate. Grounded against prod (2026-06-29) the real arcs are:
--
--   posts.scope_id   (nullable, no scope_type) → circle | event | profile(wall).  3-way,
--     resolved by precedence in lib/feed/post-origin.ts (circle → event → wall → feed).
--     Today: 54 → profiles, 5 → circles, 0 → events, 0 orphans. (event-scoped posts are a
--     supported write path with no rows yet, so the arc MUST keep the event target.)
--   events.scope_id  (NOT NULL, has scope_type) → circle (scope_type='circle')
--                                                | nexus_region (scope_type='public').
--     Today: 1 circle + 7 region (the root-region sentinel). 0 true orphans.
--
-- The fix is the typed exclusive-arc (owner decision): one nullable, REAL foreign key per
-- target type, so referential integrity is DB-enforced and a parent delete can no longer
-- silently orphan a child.
--
-- EXPAND (this migration) is deliberately non-breaking:
--   1. add the typed FK columns (nullable),
--   2. backfill them from the existing scope_id (matching each target table),
--   3. a BEFORE INSERT/UPDATE trigger keeps them DERIVED from the scope_id the app already
--      writes — so no application code changes in this phase,
--   4. partial indexes on the typed columns.
--
-- Deliberately deferred to the CONTRACT phase (a later, branch-first migration, once the app
-- writes the typed columns directly):
--   • the exclusive-arc CHECK (exactly one typed column non-null),
--   • dropping the bare `scope_id` / `scope_type` columns,
--   • re-pointing RLS policies at the typed columns,
--   • the deletion-graph decision (cascade vs set-null per arc) — that is H1-5, made
--     deliberately with the app's delete flows in view. Until then these FKs use
--     ON DELETE SET NULL, which PRESERVES today's behavior exactly: with no FK today a parent
--     delete leaves the child alive with a dangling pointer; SET NULL keeps the child alive
--     and simply nulls the typed link (the orphan-repair job, H1-7, sweeps the stale scope_id).
--
-- Safety invariant of the trigger + backfill: a typed column is only ever set when the target
-- row actually EXISTS. So this migration can never turn a previously-successful insert into an
-- FK violation — an unresolvable scope_id just leaves the typed column NULL (tracked for H1-7),
-- exactly as today.

begin;

-- ── 1. Typed FK columns (nullable; ON DELETE SET NULL preserves current behavior) ────────────

alter table public.posts
  add column if not exists scope_circle_id  uuid references public.circles(id)  on delete set null,
  add column if not exists scope_event_id   uuid references public.events(id)   on delete set null,
  add column if not exists scope_profile_id uuid references public.profiles(id) on delete set null;

alter table public.events
  add column if not exists scope_circle_id uuid references public.circles(id)       on delete set null,
  add column if not exists scope_region_id uuid references public.nexus_regions(id) on delete set null;

comment on column public.posts.scope_circle_id  is 'H1-1 typed scope arc: set when the post lives in a circle. Derived from scope_id (expand phase).';
comment on column public.posts.scope_event_id   is 'H1-1 typed scope arc: set when the post is tied to an event.';
comment on column public.posts.scope_profile_id is 'H1-1 typed scope arc: set when the post lives on a member wall/profile.';
comment on column public.events.scope_circle_id is 'H1-1 typed scope arc: set when scope_type=circle.';
comment on column public.events.scope_region_id is 'H1-1 typed scope arc: set when scope_type=public (a nexus_region).';

-- ── 2. Backfill from the existing scope_id (EXISTS-guarded → never violates the new FKs) ──────

update public.posts set scope_circle_id = scope_id
  where scope_id is not null and scope_circle_id is null
    and exists (select 1 from public.circles c where c.id = posts.scope_id);

update public.posts set scope_event_id = scope_id
  where scope_id is not null and scope_event_id is null and scope_circle_id is null
    and exists (select 1 from public.events e where e.id = posts.scope_id);

update public.posts set scope_profile_id = scope_id
  where scope_id is not null and scope_profile_id is null
    and scope_circle_id is null and scope_event_id is null
    and exists (select 1 from public.profiles p where p.id = posts.scope_id);

update public.events set scope_circle_id = scope_id
  where scope_type = 'circle' and scope_circle_id is null
    and exists (select 1 from public.circles c where c.id = events.scope_id);

update public.events set scope_region_id = scope_id
  where scope_type = 'public' and scope_region_id is null
    and exists (select 1 from public.nexus_regions r where r.id = events.scope_id);

-- ── 3. Sync triggers: keep the typed columns derived from the scope the app already writes ────
-- SECURITY DEFINER + pinned search_path per H2-3 hygiene (these trigger fns read sibling tables).

create or replace function public.sync_post_scope_arc()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Contract-phase forward path (no-op today): if the app writes a typed column directly and
  -- leaves scope_id null, denormalise scope_id from the single typed column it set.
  if new.scope_id is null then
    new.scope_id := coalesce(new.scope_circle_id, new.scope_event_id, new.scope_profile_id);
  end if;

  -- On a re-scope (scope_id changed), clear stale typed columns so they re-derive below.
  if tg_op = 'UPDATE' and new.scope_id is distinct from old.scope_id then
    new.scope_circle_id := null;
    new.scope_event_id := null;
    new.scope_profile_id := null;
  end if;

  -- Expand-phase derive path: the app writes only scope_id. Resolve it to the matching typed FK.
  -- Precedence mirrors lib/feed/post-origin.ts (circle → event → wall). EXISTS-guarded so an
  -- unresolvable scope_id leaves the typed columns NULL rather than failing the insert.
  if new.scope_id is not null
     and new.scope_circle_id is null and new.scope_event_id is null and new.scope_profile_id is null then
    if exists (select 1 from public.circles c where c.id = new.scope_id) then
      new.scope_circle_id := new.scope_id;
    elsif exists (select 1 from public.events e where e.id = new.scope_id) then
      new.scope_event_id := new.scope_id;
    elsif exists (select 1 from public.profiles p where p.id = new.scope_id) then
      new.scope_profile_id := new.scope_id;
    end if;
  end if;

  return new;
end $$;

create or replace function public.sync_event_scope_arc()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Contract-phase reverse path (no-op while scope_id is NOT NULL): typed column → scope_id/type.
  if new.scope_id is null then
    if new.scope_circle_id is not null then
      new.scope_id := new.scope_circle_id; new.scope_type := coalesce(new.scope_type, 'circle');
    elsif new.scope_region_id is not null then
      new.scope_id := new.scope_region_id; new.scope_type := coalesce(new.scope_type, 'public');
    end if;
  end if;

  -- On a re-scope, clear stale typed columns so they re-derive below.
  if tg_op = 'UPDATE'
     and (new.scope_id is distinct from old.scope_id or new.scope_type is distinct from old.scope_type) then
    new.scope_circle_id := null;
    new.scope_region_id := null;
  end if;

  -- Expand-phase derive path: scope_type tells us the target table directly. EXISTS-guarded so a
  -- scope_id that does not resolve (legacy/unknown scope_type) leaves the typed column NULL and
  -- the insert still succeeds, exactly as today.
  if new.scope_id is not null and new.scope_circle_id is null and new.scope_region_id is null then
    if new.scope_type = 'circle' and exists (select 1 from public.circles c where c.id = new.scope_id) then
      new.scope_circle_id := new.scope_id;
    elsif new.scope_type = 'public' and exists (select 1 from public.nexus_regions r where r.id = new.scope_id) then
      new.scope_region_id := new.scope_id;
    end if;
  end if;

  return new;
end $$;

-- These are trigger-only functions (return type trigger): they fire as the table owner and are
-- never callable via PostgREST/RPC. REVOKE EXECUTE from the API roles anyway — H2-3 security-definer
-- hygiene, and it keeps them off the `*_security_definer_function_executable` advisor.
revoke execute on function public.sync_post_scope_arc()  from public, anon, authenticated;
revoke execute on function public.sync_event_scope_arc() from public, anon, authenticated;

drop trigger if exists trg_posts_sync_scope_arc on public.posts;
create trigger trg_posts_sync_scope_arc
  before insert or update on public.posts
  for each row execute function public.sync_post_scope_arc();

drop trigger if exists trg_events_sync_scope_arc on public.events;
create trigger trg_events_sync_scope_arc
  before insert or update on public.events
  for each row execute function public.sync_event_scope_arc();

-- ── 4. Partial indexes on the typed columns (lean: only the populated rows) ───────────────────

create index if not exists idx_posts_scope_circle  on public.posts(scope_circle_id)  where scope_circle_id  is not null;
create index if not exists idx_posts_scope_event   on public.posts(scope_event_id)   where scope_event_id   is not null;
create index if not exists idx_posts_scope_profile on public.posts(scope_profile_id) where scope_profile_id is not null;
create index if not exists idx_events_scope_circle on public.events(scope_circle_id) where scope_circle_id is not null;
create index if not exists idx_events_scope_region on public.events(scope_region_id) where scope_region_id is not null;

commit;
