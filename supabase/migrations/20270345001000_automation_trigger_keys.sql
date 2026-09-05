-- Automation trigger keys match what the engagement ledger records (scan two L4-01).
--
-- THE GAP. The admin Automations form offered five triggers and the runner
-- (lib/automations.ts runAutomationsForEvent) matches automation_rules.trigger_event by exact
-- string against engagement_events.event_type. A Circle join is recorded as 'circle.joined', never
-- as 'circle_join', so a rule saved on 'circle_join' listed as enabled and never fired.
--
-- THE FIX. The offered list now uses the recorded key 'circle.joined'; this migration moves any
-- stored 'circle_join' rule onto it so an existing rule starts firing instead of being orphaned by
-- the rename. 'event_attend' keeps its key: the same change (ADR-1212) records it from a verified
-- check-in, so a rule on it fires from now on and nothing here touches those rows. (An earlier
-- draft of this file disabled them; that was written before the recorder landed in the same PR.)
--
-- Additive and idempotent: a plain update that touches zero rows on a second run.
--
-- Rollback: update public.automation_rules set trigger_event = 'circle_join'
--   where trigger_event = 'circle.joined';

begin;

update public.automation_rules
  set trigger_event = 'circle.joined'
  where trigger_event = 'circle_join';

commit;
