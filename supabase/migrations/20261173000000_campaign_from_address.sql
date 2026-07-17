-- Email Studio - per-campaign sender ADDRESS (envelope identity). Additive + idempotent, safe to re-run.
-- Where from_name only swaps the friendly display name over the verified default address, from_address lets a
-- broadcast send from a DIFFERENT verified sending identity (e.g. Daniel Tyack <daniel@danieltyack.com>) while
-- transactional mail stays on the platform noreply. The chosen domain MUST be verified in Resend (DKIM/SPF) or
-- the send fails authentication - that verification is an ops step; the app can only format-check the address
-- (lib/email-studio/send.sanitizeFromAddress strips header-breaking chars and requires a well-formed addr-spec).
-- campaigns already has RLS enabled with NO client policies, so this column is reachable only through the gated
-- Studio server actions behind requireStaff(). lib/database.types.ts is regenerated separately, so the save +
-- send seam reaches this column with untyped casts and a fail-safe read until then (ADR-246). No em or en dashes.
alter table public.campaigns add column if not exists from_address text;

comment on column public.campaigns.from_address is
  'Optional per-campaign envelope From ADDRESS for Email Studio broadcasts (e.g. daniel@danieltyack.com). Its domain MUST be verified in Resend or the send fails auth. Combined with from_name to build "Name <address>". Null falls back to EMAIL_BROADCAST_FROM, then the platform default EMAIL_FROM (noreply). Sanitized before use (sanitizeFromAddress); read fail-safe so the app works before this migration is applied.';

-- ROLLBACK:
-- alter table public.campaigns drop column if exists from_address;
