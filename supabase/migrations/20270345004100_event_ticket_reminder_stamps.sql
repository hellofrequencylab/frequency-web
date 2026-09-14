-- LIVE-320: reminder stamps on the ticket row, so a GUEST ticket holder can be reminded once.
--
-- The reminder cron (app/api/cron/event-reminders/route.ts) reads event_rsvps only, and its
-- idempotency is the per-row stamp event_rsvps.reminder_{7d,24h,2h}_sent_at (20240209000000 and
-- 20260609230000): the stamp is taken BEFORE the send as a conditional claim, so two overlapping
-- runs cannot send twice. A guest who bought a ticket through the guest door (20270345003400) has
-- no RSVP row and no profile, so the only row that can say "this person was reminded" is the ticket
-- itself. event_tickets carried no such column. This adds the three, named exactly as their
-- event_rsvps twins so the cron's SentColumn type names one column on both tables.
--
-- WHO IS STAMPED. The cron's guest arm reads succeeded tickets with buyer_profile_id null and
-- guest_email not null, claims the stamp, and emails the ticket's address. A MEMBER ticket
-- (buyer_profile_id set) is reminded through their RSVP row as before and is never stamped here;
-- a refunded, failed or pending ticket is never read. A ticket claimed into an account after a
-- stamp keeps the stamp, which is the record that the reminder went to the address on the row.
--
-- WHAT THIS DOES NOT TOUCH. No RLS change and no grant change: the columns sit on a table whose
-- policies already exist, the only reader and writer is the cron on the service role, and nothing
-- a browser role could learn from a timestamp is gated. The three partial indexes mirror
-- idx_event_rsvps_pending_24h / _2h (20240209000000), scoped to exactly the rows the guest arm reads.
--
-- ROLLBACK:
--   drop index if exists public.event_tickets_guest_pending_7d_idx;
--   drop index if exists public.event_tickets_guest_pending_24h_idx;
--   drop index if exists public.event_tickets_guest_pending_2h_idx;
--   alter table public.event_tickets
--     drop column if exists reminder_7d_sent_at,
--     drop column if exists reminder_24h_sent_at,
--     drop column if exists reminder_2h_sent_at;
-- The app half (the guest ticket arm in the reminder cron) must roll back in the SAME deploy: it
-- selects and updates these columns by name and would fail with PGRST204 without them.
--
-- House style: additive and idempotent (add column if not exists, create index if not exists).
-- No em or en dashes.

begin;

alter table public.event_tickets
  add column if not exists reminder_7d_sent_at  timestamptz,
  add column if not exists reminder_24h_sent_at timestamptz,
  add column if not exists reminder_2h_sent_at  timestamptz;

comment on column public.event_tickets.reminder_7d_sent_at is
  'When the ~1-week reminder was claimed for this ticket''s guest_email by the reminder cron (LIVE-320). Set only on guest tickets (buyer_profile_id null); a member ticket holder is reminded through their event_rsvps row. Taken as a conditional claim before the send, so it means "a run owns this reminder", not "it was delivered".';
comment on column public.event_tickets.reminder_24h_sent_at is
  'When the T-24h reminder was claimed for this ticket''s guest_email by the reminder cron (LIVE-320). Guest tickets only; see reminder_7d_sent_at.';
comment on column public.event_tickets.reminder_2h_sent_at is
  'When the T-2h reminder was claimed for this ticket''s guest_email by the reminder cron (LIVE-320). Guest tickets only; see reminder_7d_sent_at.';

-- The cron's "guest tickets that still need this touch" read, one partial index per touch,
-- scoped to the guest arm's own predicate so a member's or a refunded ticket never widens it.
create index if not exists event_tickets_guest_pending_7d_idx
  on public.event_tickets (event_id)
  where reminder_7d_sent_at is null
    and status = 'succeeded'
    and buyer_profile_id is null
    and guest_email is not null;

create index if not exists event_tickets_guest_pending_24h_idx
  on public.event_tickets (event_id)
  where reminder_24h_sent_at is null
    and status = 'succeeded'
    and buyer_profile_id is null
    and guest_email is not null;

create index if not exists event_tickets_guest_pending_2h_idx
  on public.event_tickets (event_id)
  where reminder_2h_sent_at is null
    and status = 'succeeded'
    and buyer_profile_id is null
    and guest_email is not null;

commit;
