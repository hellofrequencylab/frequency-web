-- =============================================================================
-- Standalone public events (ADR-254) — the second foundational gap.
--
-- WHY: events are Circle-scoped by design today (`scope_type` is effectively
-- 'circle'/'region', `scope_id` NOT NULL points at the host Circle/Region). The
-- catalog needs events that do NOT live inside a Circle. ADR-254 keeps Circle
-- events and adds standalone public events as first-class, with their own
-- visibility RLS.
--
-- DESIGN (additive + backward-compatible — nothing about existing circle events
-- changes):
--   • Introduce scope_type = 'standalone'. A standalone event still satisfies the
--     NOT NULL scope_id (the column is not relaxed — too risky to touch a NOT NULL
--     on a live table) by self-referencing its own host: writers set
--     scope_id = host_id for standalone events. The visibility branches that
--     matter for standalone (public/unlisted/private) never read scope_id, so the
--     self-reference is inert for access control and just satisfies the column.
--   • READ RLS: the existing "events: visibility-aware read" (20260612000000)
--     already returns the right answer for standalone events — public/unlisted are
--     readable by anyone, private is host-only, and the circle_only branch simply
--     never matches a standalone row (its scope_type isn't 'circle'/'region').
--     We REPLACE that policy here only to (a) re-assert it verbatim plus an
--     explicit standalone guard comment, and (b) wrap get_my_*() in scalar
--     subselects per wrap_rls_auth_calls_in_select (initplan perf). No new access
--     is granted to anything currently protected.
--   • keep can_read_event() in lock-step with the policy (same disjuncts) so the
--     child tables (posts/media/cohosts/questions/dispatches) inherit the rule.
--   • DRAFTS stay owner/staff-only exactly as today: a draft event is `status =
--     'draft'` and `visibility = 'private'` (host-only) until published; this
--     migration changes nothing about that — private = host-only is preserved.
--
-- INSERT/UPDATE/DELETE policies are untouched: "events: host+ insert" already lets
-- a host create an event with their own host_id regardless of scope, so standalone
-- creation needs no new write policy. Moderation of standalone public events
-- (ADR-254 raises the bar) is a later surface; flagged as an open question.
-- =============================================================================

-- ── 1. allow the 'standalone' scope_type ─────────────────────────────────────
-- There is no CHECK on events.scope_type today (it's free text: 'circle' /
-- 'region' / 'group' historically). We add a permissive constraint that documents
-- and admits the standalone value WITHOUT narrowing the historical set, so no
-- existing row can violate it.
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%scope_type%'
  loop
    execute format('alter table public.events drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.events
  add constraint events_scope_type_check
  check (scope_type in ('circle', 'region', 'cluster', 'group', 'standalone'));

comment on column public.events.scope_type is
  'circle | region | cluster | group (Circle-scoped, the original model) | standalone (ADR-254: a public event with no Circle; scope_id self-references host_id and is inert for access control).';

-- ── 2. re-assert the visibility-aware READ policy (standalone-safe) ──────────
-- Verbatim disjuncts from 20260612000000, with get_my_*() wrapped in scalar
-- subselects (initplan) and an explicit note that standalone rows resolve through
-- the public/unlisted/private branches only.
drop policy if exists "events: crew+ read in scope"     on public.events;
drop policy if exists "events: visibility-aware read"    on public.events;

create policy "events: visibility-aware read"
  on public.events for select
  using (
    -- public / unlisted: anyone (circle OR standalone). App decides what to LIST;
    -- RLS decides what is READABLE. Unlisted stays out of listings at the app layer.
    visibility = 'public'
    or visibility = 'unlisted'
    -- The host always sees their own event (incl. private drafts).
    or host_id = ( select get_my_profile_id() )
    or (
      -- circle_only: unchanged — crew+ within the event's Circle/Region scope.
      -- A standalone event never has scope_type 'circle'/'region', so this branch
      -- can never widen access to a standalone row.
      visibility = 'circle_only'
      and ( select get_my_role() ) >= 'crew'::community_role
      and (
        (scope_type = 'circle' and scope_id = any (( select get_my_circle_ids() )))
        or (scope_type = 'region' and scope_id = ( select get_my_region_id() ))
      )
    )
    -- private (incl. drafts): host-only, already covered by host_id above. No other
    -- branch matches, so a private/standalone event is host-only — no leak.
  );

comment on policy "events: visibility-aware read" on public.events is
  'ADR-254: public/unlisted readable by anyone (circle OR standalone; listing exclusion for unlisted is app-level); circle_only stays scope-membership (crew+, circle/region only); private + drafts are host-only; hosts always see their own events.';

-- ── 3. keep can_read_event() in lock-step ────────────────────────────────────
-- Same disjuncts as the policy so every child table (posts, media, cohosts,
-- questions, dispatches) that uses can_read_event() agrees with the events SELECT
-- rule for standalone events too. SECURITY DEFINER + pinned search_path unchanged.
create or replace function public.can_read_event(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (
        e.visibility = 'public'
        or e.visibility = 'unlisted'
        or e.host_id = get_my_profile_id()
        or (
          e.visibility = 'circle_only'
          and get_my_role() >= 'crew'::community_role
          and (
            (e.scope_type = 'circle' and e.scope_id = any (get_my_circle_ids()))
            or (e.scope_type = 'region' and e.scope_id = get_my_region_id())
          )
        )
      )
  );
$$;
