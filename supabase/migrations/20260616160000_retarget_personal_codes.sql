-- Retarget every member's personal "connect" code to the home SPLASH (the beta
-- front door) instead of their profile. The encoded image is UNCHANGED — it encodes
-- the retargetable short link /q/<slug>; only where /q redirects changes. Scanning
-- still routes through the resolver first, which logs the scan and drops the owner's
-- referral cookie, so the owner is credited (and earns invite_accepted zaps) when a
-- scanner signs up for the beta.
--
-- Host-preserving: rewrites only the PATH from /people/<handle> to / while keeping
-- whatever apex host is already stored on each row, so prod and preview rows each
-- keep their own host. Idempotent — rows already pointing at the splash (no
-- /people/ segment) are skipped by the WHERE clause.
--
-- New codes are minted at the splash directly (lib/qr/member-codes.ts +
-- personalCodeTargetUrl), so this one-time backfill only touches codes minted before
-- the repoint.

update public.qr_codes
set target_url = regexp_replace(target_url, '/people/[^?#]*', '/')
where purpose = 'connect'
  and destination_type = 'url'
  and target_url like '%/people/%';
