-- RETIRE THE GROWTH OS ENGINE 3 INTAKES (/apply and /waitlist)
--
-- Both surfaces are gone from the code in this same change: the two member-facing routes,
-- their server actions, the shared lib/applications module, and the operator review queue
-- at /admin/growth/applications. This migration removes the tables only those surfaces
-- touched, so the schema stops describing a product that no longer exists.
--
-- NOT the Beta waitlist. Two things named "waitlist" lived in this repo and ADR-933 was
-- careful to delete only the first one:
--   • the BETA waitlist  — the queue in front of Beta signup. Retired in
--     20270211000000_retire_beta_waitlist.sql.
--   • the SEEKER waitlist — public.waitlist_entries (ADR-456), people waiting for
--     Frequency to open in their CITY. Deliberately spared by ADR-933, and the subject
--     of THIS migration.
-- They share no table, no module and no route. Only the word.
--
-- WHY THESE GO NOW, and it is not merely "no inbound links":
--
--   1. NOBODY EVER USED THEM. Zero rows in public.waitlist_entries, zero in
--      public.applications, zero engagement_events with event_type = 'waitlist.joined'.
--      There is no member to strand and no data to migrate.
--
--   2. NO ANONYMOUS VISITOR COULD REACH THEM. Both routes live under app/(main), whose
--      layout redirects a signed-out visitor to '/'. A crawler is always signed out, so
--      neither page was ever indexable, and neither is in the sitemap. The usual reason
--      to leave a 308 behind — inbound SEO equity, or a link someone shared — cannot
--      apply here. Anyone holding such a link has been landing on the homepage all along.
--
--   3. THEY PROMISED SOMETHING NO CODE COULD DELIVER. waitlist_entries.status carries
--      'invited' and 'converted', and NOTHING anywhere ever updated a row off 'waiting' —
--      no invite engine, no email, no admin action. The page said "We will reach out the
--      moment your area opens". That is the empty frame ADR-933 set out to remove, and
--      its own durable rule applies: when a queue is removed, the thing in front of it
--      has to become an open door, not an empty frame.
--
-- WHAT THIS DELIBERATELY KEEPS
--   • contacts rows with source='beta_waitlist' (4 in production). Untouched by these
--     routes, which only ever wrote waitlist_entries + engagement_events. They are real
--     consent records and consent_state governs mailing them.
--   • engagement_events rows of any type. The ledger is append-only history; the fact
--     that a signal is no longer produced is not a reason to erase that it once was.
--   • Everything else under /admin/growth (referrals, campaigns, Beta Command).

begin;

-- Child first: applications carries the FK to the review queue's decisions.
drop table if exists public.applications;

drop table if exists public.waitlist_entries;

commit;
