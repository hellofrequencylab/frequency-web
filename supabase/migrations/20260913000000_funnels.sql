-- Growth OS · Engine 2 (Funnel Engine), task GE2-1 — the `funnels` object.
-- docs/GROWTH-OS-BUILD-PLAN.md §5 Engine 2 · ADR-455 (the funnels data model).
--
-- A funnel is a first-class growth object: a NAMED path a persona travels —
-- entry point(s) -> wedge/landing -> capture -> a conversion goal event — that
-- COMPOSES the pieces that already exist (entry_points/qr_codes, entry_campaigns,
-- pages, lead flows, nurture_sequences) rather than re-founding them. It names the
-- ordered stages, links each stage to an existing component, and records the
-- goal_event so the analytics rollup (GE2-2) can measure entry -> wedge -> capture
-- -> convert with drop-off per stage.
--
-- THREE tables:
--   funnels            — the object: name, slug, persona, status, goal_event.
--   funnel_stages      — the ordered stages of one funnel (kind + position).
--   funnel_stage_links — what existing component a stage points at (typed ref).
--
-- HOUSE STYLE: additive + idempotent-friendly (create table if not exists, add
-- column if not exists, every policy guarded by a drop). RLS on every table.
-- SECURITY: writes are server-mediated through the service role (the admin builder
-- re-checks the marketing capability in every action); authenticated staff get a
-- READ policy via the existing get_my_web_role() helper so the typed client can
-- hydrate the builder without the service key. No em or en dashes in any comment or
-- seeded string (CONTENT-VOICE). Reached untyped from app code until
-- lib/database.types.ts regenerates (ADR-246):
--   npx supabase gen types typescript --linked > lib/database.types.ts
--
-- NOT APPLIED in this PR. Ships as a file for owner hand-review + the db-tests
-- fresh-apply path. Rollback notes at the foot of the file.

-- ── Prerequisites already present (referenced, never recreated): profiles,
--    set_updated_at() (20240101000000 / 20260608070000), get_my_web_role()
--    (20260613000050, SECURITY DEFINER). All assumed by earlier migrations.

-- ── funnels ─────────────────────────────────────────────────────────────────
-- One row per funnel. `goal_event` is the engagement_events.event_type that counts
-- as a conversion for this funnel (e.g. 'signup', 'practice_verified', 'event_rsvp');
-- the rollup (GE2-2) reads it. `persona` is the lib/onboarding/personas.ts PersonaId
-- this funnel targets (nullable = persona-agnostic). `template_key` records which
-- per-persona seed template (GE2-4) the funnel was cloned from, for analytics.
create table if not exists public.funnels (
  id            uuid primary key default gen_random_uuid(),
  -- Stable, URL-safe handle for admin deep links + analytics joins. Unique.
  slug          text not null,
  name          text not null,
  description   text,
  -- The PersonaId this funnel is built for (visitor/practitioner/partner/builder/
  -- investor), or null for a persona-agnostic funnel. Validated in app code against
  -- the canon list, kept as free text here so the canon can evolve without a migration.
  persona       text,
  -- The seed template this funnel was cloned from (GE2-4), or null if hand-built.
  template_key  text,
  -- The engagement_events.event_type that counts as conversion for this funnel.
  -- Free text (the event taxonomy lives in lib/engagement), defaulted to signup.
  goal_event    text not null default 'signup',
  status        text not null default 'draft'
                  check (status in ('draft', 'active', 'archived')),
  owner_profile_id uuid references public.profiles(id) on delete set null,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists funnels_slug_uniq on public.funnels (slug);
create index if not exists funnels_status_idx on public.funnels (status);
create index if not exists funnels_persona_idx on public.funnels (persona);
create index if not exists funnels_owner_idx on public.funnels (owner_profile_id);

comment on table public.funnels is
  'Growth OS Engine 2 (ADR-455): a funnel as a first-class object. Names the ordered stages and the goal_event a conversion is measured against; composes existing entry points / campaigns / pages / lead flows / nurture. Server-mediated writes; staff read. See docs/GROWTH-OS-BUILD-PLAN.md.';
comment on column public.funnels.goal_event is
  'The engagement_events.event_type counted as a conversion for this funnel (rollup GE2-2). Free text; defaults to signup.';
comment on column public.funnels.persona is
  'The lib/onboarding/personas.ts PersonaId this funnel targets, or null. Validated in app code.';

-- ── funnel_stages ───────────────────────────────────────────────────────────
-- The ordered stages of one funnel. `kind` names the four canonical stages of the
-- engine (entry -> wedge -> capture -> convert); `position` orders them (0-based).
-- A funnel typically has exactly one stage of each kind, but the model does not
-- force that (a funnel may, for example, fan out to two entry stages), so kind is
-- NOT unique per funnel. `position` IS unique per funnel so ordering is stable.
create table if not exists public.funnel_stages (
  id          uuid primary key default gen_random_uuid(),
  funnel_id   uuid not null references public.funnels(id) on delete cascade,
  kind        text not null
                check (kind in ('entry', 'wedge', 'capture', 'convert')),
  label       text not null,
  -- 0-based order within the funnel. Unique per funnel (see index below).
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists funnel_stages_funnel_idx
  on public.funnel_stages (funnel_id, position);
-- Ordering is stable: at most one stage per (funnel, position).
create unique index if not exists funnel_stages_funnel_position_uniq
  on public.funnel_stages (funnel_id, position);

comment on table public.funnel_stages is
  'Growth OS Engine 2 (ADR-455): the ordered stages of one funnel. kind in (entry, wedge, capture, convert); position orders them (unique per funnel).';

-- ── funnel_stage_links ──────────────────────────────────────────────────────
-- What existing component a stage points at. A TYPED soft reference: `ref_type`
-- names the component family and `ref_id`/`ref_key` carry the pointer. We keep this
-- a soft reference (not a hard FK per family) so a stage can point at any of the
-- existing systems without this migration depending on every one of their tables,
-- and so a component (a lead flow, a page slug) addressed by key, not a uuid, fits
-- the same model. The app layer resolves + validates the pointer.
--   entry_point  -> qr_codes.id (an entry-point row)           [ref_id]
--   campaign     -> entry_campaigns.id                          [ref_id]
--   page         -> pages.slug (a marketing/landing page)       [ref_key]
--   lead_flow    -> a lib/onboarding/lead-flows.ts slug         [ref_key]
--   nurture      -> nurture_sequences.id                        [ref_id]
--   custom       -> an arbitrary URL/path                       [ref_key]
create table if not exists public.funnel_stage_links (
  id          uuid primary key default gen_random_uuid(),
  stage_id    uuid not null references public.funnel_stages(id) on delete cascade,
  ref_type    text not null
                check (ref_type in ('entry_point', 'campaign', 'page', 'lead_flow', 'nurture', 'custom')),
  -- uuid pointer (entry_point/campaign/nurture). Null when the ref is addressed by key.
  ref_id      uuid,
  -- key pointer (page slug, lead-flow slug, custom URL). Null when addressed by id.
  ref_key     text,
  -- Free metadata the app layer may stash (cached label, resolved url, etc).
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  -- A link must carry exactly one of the two pointer shapes.
  constraint funnel_stage_links_one_pointer
    check ((ref_id is not null) <> (ref_key is not null))
);

create index if not exists funnel_stage_links_stage_idx
  on public.funnel_stage_links (stage_id);
create index if not exists funnel_stage_links_ref_idx
  on public.funnel_stage_links (ref_type, ref_id);

comment on table public.funnel_stage_links is
  'Growth OS Engine 2 (ADR-455): a typed SOFT reference from a funnel stage to an existing component (entry_point/campaign/page/lead_flow/nurture/custom). Exactly one of ref_id (uuid) or ref_key (slug/url) is set. Resolved + validated in app code.';

-- ── updated_at triggers ───────────────────────────────────────────────────────
drop trigger if exists funnels_set_updated_at on public.funnels;
create trigger funnels_set_updated_at
  before update on public.funnels
  for each row execute function public.set_updated_at();

drop trigger if exists funnel_stages_set_updated_at on public.funnel_stages;
create trigger funnel_stages_set_updated_at
  before update on public.funnel_stages
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Every table is RLS-enabled. Writes are server-mediated (the service role bypasses
-- RLS; the admin builder re-checks the marketing capability in every action), so
-- there is intentionally NO insert/update/delete policy: a client can never forge a
-- funnel. Staff get a READ policy so the typed (non-service) client can hydrate the
-- builder. get_my_web_role() is the existing SECURITY DEFINER helper (web_role axis,
-- 20260613000050); staff = web_role in (admin, janitor).
alter table public.funnels enable row level security;
alter table public.funnel_stages enable row level security;
alter table public.funnel_stage_links enable row level security;

drop policy if exists "funnels: staff read" on public.funnels;
create policy "funnels: staff read"
  on public.funnels for select
  using (public.get_my_web_role() in ('admin', 'janitor'));

drop policy if exists "funnel_stages: staff read" on public.funnel_stages;
create policy "funnel_stages: staff read"
  on public.funnel_stages for select
  using (public.get_my_web_role() in ('admin', 'janitor'));

drop policy if exists "funnel_stage_links: staff read" on public.funnel_stage_links;
create policy "funnel_stage_links: staff read"
  on public.funnel_stage_links for select
  using (public.get_my_web_role() in ('admin', 'janitor'));

-- ── Funnel analytics rollup RPC (GE2-2) ────────────────────────────────────────
-- One funnel's stage-by-stage rollup: for each stage, the count of distinct actors
-- who reached it, plus the drop-off from the previous stage. Reads the engagement
-- ledger (the append-only source of truth for every measured action):
--   entry/wedge/capture stages -> events whose context->>'funnel_stage' tags this
--     stage id (the funnel surfaces stamp the stage they belong to), counted distinct
--     by actor in the window.
--   convert stage -> the funnel's goal_event, attributed to this funnel via
--     context->>'funnel_id', counted distinct by actor in the window.
-- Returns one json array, ordered by stage position, each element:
--   { stage_id, kind, label, position, actors, drop_pct }
-- where drop_pct is the percent lost from the previous stage (null for the first).
-- SECURITY DEFINER so it reads engagement_events under a fixed search_path; granted
-- to authenticated and gated INSIDE the function to staff only (fail-closed).
create or replace function public.funnel_rollup(p_funnel_id uuid, p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result   jsonb;
  v_goal   text;
  v_since  timestamptz;
begin
  -- Staff only. The typed client may call this; non-staff get nothing (fail-closed).
  if public.get_my_web_role() not in ('admin', 'janitor') then
    raise exception 'funnel_rollup: staff only';
  end if;

  v_since := now() - make_interval(days => greatest(p_days, 1));

  select goal_event into v_goal from public.funnels where id = p_funnel_id;
  if v_goal is null then
    -- Unknown funnel: return an empty array, not an error (the builder renders empty).
    return '[]'::jsonb;
  end if;

  with stages as (
    select id, kind, label, position
    from public.funnel_stages
    where funnel_id = p_funnel_id
    order by position
  ),
  -- Distinct actors who reached each NON-convert stage, tagged by funnel_stage.
  stage_hits as (
    select s.id as stage_id,
           count(distinct e.actor_profile_id) as actors
    from stages s
    left join public.engagement_events e
      on e.context->>'funnel_stage' = s.id::text
     and e.actor_profile_id is not null
     and e.created_at >= v_since
    where s.kind <> 'convert'
    group by s.id
  ),
  -- Distinct actors who fired the goal event attributed to THIS funnel (convert).
  convert_hits as (
    select s.id as stage_id,
           count(distinct e.actor_profile_id) as actors
    from stages s
    left join public.engagement_events e
      on e.event_type = v_goal
     and e.context->>'funnel_id' = p_funnel_id::text
     and e.actor_profile_id is not null
     and e.created_at >= v_since
    where s.kind = 'convert'
    group by s.id
  ),
  counted as (
    select s.id as stage_id, s.kind, s.label, s.position,
           coalesce(sh.actors, ch.actors, 0)::bigint as actors
    from stages s
    left join stage_hits sh on sh.stage_id = s.id
    left join convert_hits ch on ch.stage_id = s.id
  ),
  with_drop as (
    select c.*,
           lag(c.actors) over (order by c.position) as prev_actors
    from counted c
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'stage_id', stage_id,
             'kind', kind,
             'label', label,
             'position', position,
             'actors', actors,
             'drop_pct',
               case
                 when prev_actors is null then null
                 when prev_actors = 0 then null
                 else round(((prev_actors - actors)::numeric / prev_actors) * 100, 1)
               end
           )
           order by position
         ), '[]'::jsonb)
    into result
  from with_drop;

  return result;
end;
$$;

comment on function public.funnel_rollup(uuid, integer) is
  'Growth OS Engine 2 (ADR-455, GE2-2): one funnel''s stage rollup from engagement_events. Per stage: distinct actors reaching it + drop_pct from the prior stage. Non-convert stages match context->>funnel_stage; the convert stage matches the funnel goal_event attributed via context->>funnel_id. SECURITY DEFINER, staff-only (fail-closed). Returns a jsonb array ordered by position.';

revoke all on function public.funnel_rollup(uuid, integer) from public, anon;
grant execute on function public.funnel_rollup(uuid, integer) to authenticated;

-- ── Rollback (hand-review aid) ─────────────────────────────────────────────────
--   drop function if exists public.funnel_rollup(uuid, integer);
--   drop table if exists public.funnel_stage_links;
--   drop table if exists public.funnel_stages;
--   drop table if exists public.funnels;
