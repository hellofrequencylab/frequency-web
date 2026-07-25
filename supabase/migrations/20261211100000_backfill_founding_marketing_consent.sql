-- One-time consent backfill (operator decision, 2026-07-25). The founding cohort — beta testers + friends,
-- ~46 profiles — signed up BEFORE the email opt-in flow existed, so they sit on the marketing default
-- (email_marketing is opt-in / not-granted) and campaigns to them are blocked as `no_consent`. The operator
-- considers every current member opted in. This grants `email_marketing` to every EXISTING profile that has
-- no marketing consent record yet — the `not exists` guard means a real, explicit opt-out is never
-- overridden (verified at write time: 0 existing marketing records). The ledger is append-only and
-- `hasConsent` reads the latest record, so this is the current grant going forward. New sign-ups still flow
-- through the normal opt-in (this touches only rows that exist now).
--
-- `email_lifecycle` already defaults to granted, so it needs no backfill.

insert into public.consent_records (profile_id, scope, granted, source)
select p.id, 'email_marketing', true, 'backfill_founding_members_2026_07'
from public.profiles p
where not exists (
  select 1 from public.consent_records c
  where c.profile_id = p.id and c.scope = 'email_marketing'
);
