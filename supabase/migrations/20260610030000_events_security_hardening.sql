-- =============================================================================
-- Events security hardening (audit follow-up, docs/EVENTS-AUDIT.md)
--
-- Closes three findings from the security audit of the Events build:
--   M1 — paid-tier `sold` was a non-atomic read-modify-write (lost updates /
--        oversell). Replace with an atomic SQL adjuster.
--   M2/M3 — RSVP capacity was only enforced in the server action; a client could
--        write `status='going'` directly (RLS only checks ownership, not the
--        value), bypassing capacity. Enforce capacity in the DB.
--   L2 — two FK columns used by cascade deletes were unindexed.
-- All additive; no behavior change for the happy path the app already drives.
-- =============================================================================

-- ── M1: atomic ticket-inventory adjuster ─────────────────────────────────────
-- One statement (`sold = sold + delta`) so concurrent webhooks can't lose an
-- increment. Clamped at 0. SECURITY DEFINER + pinned search_path per convention;
-- callers are already service-role (webhook / reconcile), so no new grant surface.
create or replace function public.adjust_ticket_sold(p_tier_id uuid, p_delta int)
returns void
language sql
security definer
set search_path = public
as $$
  update public.event_ticket_types
     set sold = greatest(0, sold + p_delta)
   where id = p_tier_id;
$$;

-- ── M2/M3: enforce event capacity in the DB, not just the server action ───────
-- On any transition INTO 'going', if the event is at capacity, coerce the row to
-- 'waitlist'. Coercion (not RAISE) keeps the app flow intact — the server action
-- already routes to waitlist when full; this catches direct client writes too.
-- promoteFromWaitlist only promotes when a seat is free, so it is unaffected.
create or replace function public.enforce_event_rsvp_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap         int;
  going_count int;
begin
  if NEW.status = 'going'
     and (TG_OP = 'INSERT' or OLD.status is distinct from 'going') then
    select capacity into cap from public.events where id = NEW.event_id;
    if cap is not null then
      select count(*) into going_count
        from public.event_rsvps
       where event_id = NEW.event_id
         and status = 'going'
         and id <> NEW.id;
      if going_count >= cap then
        NEW.status := 'waitlist';
      end if;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_enforce_event_rsvp_capacity on public.event_rsvps;
create trigger trg_enforce_event_rsvp_capacity
  before insert or update on public.event_rsvps
  for each row execute function public.enforce_event_rsvp_capacity();

-- ── L2: index FKs used by cascade deletes ────────────────────────────────────
create index if not exists event_blurb_cache_event_idx
  on public.event_blurb_cache (event_id);
create index if not exists circle_field_transactions_profile_idx
  on public.circle_field_transactions (profile_id);
