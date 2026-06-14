-- =============================================================================
-- Event Dispatches (ADR-255 / EVENTS-REWORK A2) — host updates as Dispatches.
--
-- DECISION (ADR-255): a host update is NOT a new broadcaster. The base action is
-- "post an update to the event page"; optional toggles send it as a Dispatch
-- (rides the existing `dispatches` rail, renders in the feed with an event badge)
-- and/or text the group (SMS, gated behind A2P 10DLC — ADR-256, unbuilt here).
-- So this migration adds ONE thin link table + channel flags; it reuses
-- `dispatches` + `notification_queue` for fan-out. No parallel broadcast system.
--
-- event_dispatches links an event to:
--   • body         — the update text shown on the event page (always present;
--                    "post to page" is the base action and never optional).
--   • dispatch_id  — the `dispatches` row created when to_dispatch is on (else
--                    NULL: a page-only update still gets a row here so the event
--                    page can list it, but no Dispatch exists).
--   • to_page / to_dispatch / to_sms — which channels the host chose.
--
-- Channel semantics:
--   • to_page     — always true (the base action). Stored for completeness.
--   • to_dispatch — also publish as a `dispatches` row + enqueue in-app/push/email
--                   fan-out via notification_queue (the data layer does this).
--   • to_sms      — recorded only; SMS send is gated/unbuilt (ADR-256). The data
--                   layer no-ops it.
--
-- RLS: host/cohost compose (insert/update/delete); readable by anyone who can
-- read the event (can_read_event), so the event page can show the update timeline.
-- =============================================================================

-- ── widen dispatches.dispatch_type to admit the 'event' badge ────────────────
-- ADR-255: an Event Dispatch renders in the feed as a Dispatch with an event
-- badge. The dispatch_type CHECK (20240108000000) only allowed
-- ('post','poll','challenge','article'); add 'event' additively. Drop-by-lookup
-- so the auto-named constraint is found regardless of env (same pattern as
-- 20260604200000_dispatch_global_tier).
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.dispatches'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%dispatch_type%'
  loop
    execute format('alter table public.dispatches drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.dispatches
  add constraint dispatches_dispatch_type_check
  check (dispatch_type in ('post', 'poll', 'challenge', 'article', 'event'));

create table if not exists public.event_dispatches (
  id           uuid        primary key default gen_random_uuid(),
  event_id     uuid        not null references public.events(id)      on delete cascade,
  author_id    uuid        not null references public.profiles(id)    on delete cascade,
  -- The Dispatch this update was published as, when to_dispatch is on. NULL for a
  -- page-only update. ON DELETE SET NULL so soft-deleting the Dispatch leaves the
  -- page update intact.
  dispatch_id  uuid        references public.dispatches(id)           on delete set null,
  title        text,
  body         text        not null,
  -- Channel flags the host selected. to_page is the always-on base action.
  to_page      boolean     not null default true,
  to_dispatch  boolean     not null default false,
  to_sms       boolean     not null default false,
  created_at   timestamptz not null default now(),
  constraint event_dispatches_body_not_empty check (length(trim(body)) > 0)
);

create index if not exists event_dispatches_event_idx
  on public.event_dispatches (event_id, created_at desc);
create index if not exists event_dispatches_author_idx
  on public.event_dispatches (author_id);
create index if not exists event_dispatches_dispatch_idx
  on public.event_dispatches (dispatch_id)
  where dispatch_id is not null;

alter table public.event_dispatches enable row level security;

-- SELECT: anyone who can read the parent event (the update timeline on the page).
-- INSERT/UPDATE/DELETE: the event host or a cohost only, composing as themselves.
drop policy if exists "event_dispatches: read if can see event" on public.event_dispatches;
drop policy if exists "event_dispatches: host or cohost insert"  on public.event_dispatches;
drop policy if exists "event_dispatches: host or cohost update"  on public.event_dispatches;
drop policy if exists "event_dispatches: host or cohost delete"  on public.event_dispatches;

create policy "event_dispatches: read if can see event"
  on public.event_dispatches for select
  using (can_read_event(event_id));

create policy "event_dispatches: host or cohost insert"
  on public.event_dispatches for insert
  with check (
    author_id = get_my_profile_id()
    and (
      event_id in (select id from public.events where host_id = get_my_profile_id())
      or is_event_cohost(event_id, get_my_profile_id())
    )
  );

create policy "event_dispatches: host or cohost update"
  on public.event_dispatches for update
  using (
    event_id in (select id from public.events where host_id = get_my_profile_id())
    or is_event_cohost(event_id, get_my_profile_id())
  )
  with check (
    event_id in (select id from public.events where host_id = get_my_profile_id())
    or is_event_cohost(event_id, get_my_profile_id())
  );

create policy "event_dispatches: host or cohost delete"
  on public.event_dispatches for delete
  using (
    event_id in (select id from public.events where host_id = get_my_profile_id())
    or is_event_cohost(event_id, get_my_profile_id())
  );

comment on table public.event_dispatches is
  'ADR-255: a host event update. Always posts to the event page (to_page); optionally rides the dispatches rail (to_dispatch → dispatch_id set + notification_queue fan-out) and/or SMS (to_sms, gated/unbuilt — ADR-256). Reuses dispatches + notification_queue, not a new broadcaster. Readable by anyone who can read the event; composed by host/cohost.';
