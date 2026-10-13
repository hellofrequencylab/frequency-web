-- EMAIL-022: the Space inbox address finishes setting up on its own. The owner presses Set up my
-- address once; the space-inbox-verify cron (app/api/cron/space-inbox-verify, every 15 minutes) then
-- carries every pending row to verified without anyone pressing Check again. The cron needs to know
-- whether the last provisioning wrote the DNS records into the apex zone, so it can re-provision (the
-- 2026-10-12 pilot's rows were saved pending with no records written) instead of only re-checking.
-- dns_written_at is that fact: set when the zone write returned ok, null when it failed or never ran.
-- Service-role only, like every other column on the row (RLS and grants are unchanged).
alter table public.space_inbox_addresses add column dns_written_at timestamptz;
comment on column public.space_inbox_addresses.dns_written_at is
 'EMAIL-022: when the MX/SPF/DKIM records were last written into the zone (upsertZoneDnsRecords ok). Null until written, and cleared when a write fails; the space-inbox-verify cron re-provisions a pending row whose value is null and re-checks one whose value is set.';
