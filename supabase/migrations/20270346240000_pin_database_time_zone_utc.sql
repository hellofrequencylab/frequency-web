-- HYG-250: pin the database time zone to UTC, so it is a written setting and not an inherited default.
--
-- Read on production 2026-11-20 (Frequency Community): current_setting('TimeZone') = 'UTC', and
-- pg_db_role_setting holds no TimeZone for the database or any role. UTC today comes from the server's
-- default, which a platform change or a project restore could move without anything in this repo
-- noticing. Every `now()::date`, `current_date` and `date_trunc('day', now())` in a function, policy or
-- cron reads that zone, so a silent move would shift day boundaries for every one of them.
--
-- UTC on purpose, not Pacific: the code already converts to a person's or a Space's own zone where a
-- local day matters (profile zone, Space zone, lib/time), and the email gauge and Resend day both count
-- the UTC day. Pinning UTC changes no result today; it only makes the current behaviour the written one.
--
-- Additive and idempotent: ALTER DATABASE ... SET replaces the same value on a re-run. It applies to new
-- sessions; pooled connections pick it up as they recycle, and they already run in UTC. The database is
-- named by current_database() so a local or branch database gets the same pin.

do $$
begin
  execute format('alter database %I set timezone to %L', current_database(), 'UTC');
end
$$;
