-- Automation trigger keys match what the engagement ledger records (scan two L4-01).
--
-- THE GAP. The admin Automations form offered five triggers and the runner
-- (lib/automations.ts runAutomationsForEvent) matches automation_rules.trigger_event by exact
-- string against engagement_events.event_type. A Circle join is recorded as 'circle.joined', never
-- as 'circle_join', so a rule saved on 'circle_join' listed as enabled and never fired. 'event_attend'
-- has no recorder at all today, so a rule on it can never fire either.
--
-- THE FIX. The offered list now uses the recorded key 'circle.joined'; this migration moves any
-- stored 'circle_join' rule onto it so an existing rule starts firing instead of being orphaned by
-- the rename. Rules on 'event_attend' are disabled (not deleted) so the table stops showing them as
-- enabled; they can be re-enabled by hand once a recorder ships and the key is offered again.
--
-- Additive and idempotent: both statements are plain updates that touch zero rows on a second run.
--
-- Rollback: update public.automation_rules set trigger_event = 'circle_join'
--   where trigger_event = 'circle.joined'; the event_attend rows must be re-enabled by hand, since
--   this migration does not record which ones it disabled.

begin;

update public.automation_rules
  set trigger_event = 'circle.joined'
  where trigger_event = 'circle_join';

update public.automation_rules
  set enabled = false
  where trigger_event = 'event_attend' and enabled = true;

commit;
