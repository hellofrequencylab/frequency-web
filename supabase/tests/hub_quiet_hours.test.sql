-- pgTAP guard for 20270346500000_hub_quiet_hours (EMAIL-091): the two quiet-hour columns exist on
-- notification_preferences.
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(2);

select has_column('public', 'notification_preferences', 'quiet_hours_start', 'quiet_hours_start exists');
select has_column('public', 'notification_preferences', 'quiet_hours_end', 'quiet_hours_end exists');

select * from finish();
rollback;
