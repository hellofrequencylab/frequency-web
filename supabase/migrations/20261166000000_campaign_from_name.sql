-- Email Studio - per-campaign sender DISPLAY NAME. Additive + idempotent, safe to re-run. The sending
-- ADDRESS/domain is unchanged (the verified noreply@send.frequencylocal.com); ONLY the friendly From display
-- name is operator-settable, so DKIM / deliverability are untouched. campaigns already has RLS enabled with
-- NO client policies, so this column is reachable only through the gated Studio server actions behind
-- requireStaff() (mirrors the rest of the table). lib/database.types.ts is regenerated separately, so the
-- save (saveEmailCampaign) + send (lib/email-studio/send.ts) seam reaches this column with untyped casts and
-- a fail-safe read until then (ADR-246). No em or en dashes.
alter table public.campaigns add column if not exists from_name text;

comment on column public.campaigns.from_name is
  'Optional per-campaign friendly From DISPLAY name for Email Studio sends. The envelope address stays the verified sending domain (noreply@send.frequencylocal.com); only the display name changes. Null falls back to the platform default (EMAIL_FROM). Sanitized before use (lib/email-studio/send.sanitizeFromName strips header-breaking chars); read fail-safe so the app works before this migration is applied.';

-- ROLLBACK:
-- alter table public.campaigns drop column if exists from_name;
