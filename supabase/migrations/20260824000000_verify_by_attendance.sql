-- Verification flow: "showed up" (ADR-420 - docs/RESONANCE-FEED-ARCHITECTURE.md §6). The chosen
-- baseline: a member is VERIFIED once they have physically checked in at a real event. It is the
-- truest real-person signal for an in-person community, costs nothing, and reinforces the core loop
-- (go to a circle/event). The runtime sets verified_at on each fresh check-in (checkInEvent ->
-- lib/verification/attendance.ts); this migration BACKFILLS anyone who already attended.
--
-- The signal: an engagement_events row with context.kind = 'event_checkin' (recorded by checkInEvent).
-- We stamp the EARLIEST such check-in as the verification moment, method 'attendance'. Idempotent +
-- non-destructive: only fills profiles whose verified_at is still null, so it never overwrites a
-- stronger method added later. No em or en dashes. Columns reached untyped until types regen (ADR-246).

update public.profiles p
set verified_at = sub.first_checkin,
    verification_method = 'attendance'
from (
  select actor_profile_id,
         min(coalesce(verified_at, created_at)) as first_checkin
  from public.engagement_events
  where context->>'kind' = 'event_checkin'
    and actor_profile_id is not null
  group by actor_profile_id
) sub
where p.id = sub.actor_profile_id
  and p.verified_at is null;

-- No rollback for a data backfill (clearing verified_at would un-verify real attendees). To fully
-- retract: update public.profiles set verified_at = null, verification_method = null
--   where verification_method = 'attendance';
