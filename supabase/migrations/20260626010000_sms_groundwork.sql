-- =============================================================================
-- SMS groundwork (EVENTS-REWORK §5 / ADR-256) — schema only, NOTHING sends.
--
-- "Text the group" (ADR-255) is SMS, which is a hard legal gate: A2P 10DLC
-- registration (mandatory since Feb 2025), express written consent, opt-out
-- honoured within 10 business days, quiet hours 8am-9pm local, statutory damages
-- of $500-1500 per message. So this migration lays the *groundwork* only. It is
-- additive, backward-compatible, defaults OFF, and ships with NO send path. The
-- `sendSms()` guard (lib/comms/sms.ts) refuses every send until the gate clears.
--
-- This migration is NOT applied. Apply on a Supabase branch + regen types when
-- the legal track (EIN -> A2P 10DLC -> Twilio Messaging Service) is ready.
--
-- Two pieces:
--   1. sms_consent          — an append-only consent ledger for the phone-number
--                             verification + opt-in/opt-out lifecycle (mirrors
--                             consent_records, but SMS consent is phone-scoped and
--                             needs verification state the generic ledger lacks).
--   2. notification_preferences.sms_* — the per-member SMS channel toggle +
--                             quiet-hours window, defaults OFF.
-- =============================================================================

-- ── 1. sms_consent — append-only SMS consent + verification ledger ───────────
-- Append-only, like consent_records (ADR-069): the CURRENT state for a member is
-- the latest row. Distinct table (not a generic consent_records scope) because
-- SMS consent is bound to a specific phone NUMBER and carries a verification
-- lifecycle (a code is sent, the member confirms ownership) plus the exact
-- express-written-consent text the member agreed to — evidence we must retain to
-- defend against statutory damages. Captures consent provenance (ip / user agent /
-- the verbatim disclosure) so the opt-in is legally defensible.
create table if not exists public.sms_consent (
  id            uuid        primary key default gen_random_uuid(),
  profile_id    uuid        not null references public.profiles(id) on delete cascade,
  -- E.164 phone number this consent record is about (e.g. +15555550123).
  phone         text        not null,
  -- The consent lifecycle state this row records (append-only — latest wins):
  --   pending_verification — code sent, awaiting the member's confirmation
  --   opted_in             — member confirmed the number AND gave express consent
  --   opted_out            — member texted STOP / toggled SMS off (must honour <=10 biz days)
  --   verification_failed  — the verification code expired / too many attempts
  status        text        not null
                check (status in ('pending_verification', 'opted_in', 'opted_out', 'verification_failed')),
  -- The verbatim express-written-consent disclosure the member agreed to, retained
  -- as evidence (TCPA / A2P 10DLC). NULL for opt-out / failure rows.
  consent_text  text,
  -- Consent provenance for an auditable opt-in (where the consent came from).
  source        text        not null default 'member',
  ip_address    inet,
  user_agent    text,
  -- Free-form operator note (e.g. "carrier-initiated STOP").
  note          text,
  created_at    timestamptz not null default now()
);

-- Latest-row-per-(member, phone) lookups + opt-out audits by number.
create index if not exists sms_consent_lookup_idx
  on public.sms_consent (profile_id, phone, created_at desc);
create index if not exists sms_consent_phone_idx
  on public.sms_consent (phone, created_at desc);

alter table public.sms_consent enable row level security;

-- Member may READ their own ledger (so the settings UI can show their SMS status),
-- but may NOT write it directly: writes go through a verified server flow on the
-- service role (a member must not be able to forge an `opted_in` row — the consent
-- must be the product of a real verification round-trip). History is immutable
-- (no update/delete policy); the ledger is erased with the account (cascade).
drop policy if exists sms_consent_select_own on public.sms_consent;
create policy sms_consent_select_own on public.sms_consent
  for select using (
    profile_id in (select id from public.profiles where auth_user_id = auth.uid())
  );

comment on table public.sms_consent is
  'Append-only SMS consent + phone-verification ledger (EVENTS-REWORK §5, ADR-256). Latest row per (profile_id, phone) wins. Member reads own (RLS); writes are service-role only (verified opt-in flow); immutable history; erased with account. Retains express-written-consent evidence for A2P 10DLC / TCPA. NO send path until lib/comms/sms.ts gate clears.';

-- ── 2. notification_preferences SMS channel + quiet hours (defaults OFF) ──────
-- Backward-compatible: every column is additive and defaults OFF, so existing
-- rows and the lazy-create default path keep their exact current behaviour and
-- nothing ever sends until a member explicitly enables SMS AND the legal gate is
-- live. quiet hours default to the legal window (8am-9pm) so even if a member
-- enables SMS, off-hours sends are still refused by the guard.
alter table public.notification_preferences
  add column if not exists sms_enabled         boolean not null default false,
  -- Per-category SMS opt-in, mirroring the email/inapp/push channel grid. Defaults
  -- OFF; `sms_enabled` is the master switch the guard reads first.
  add column if not exists sms_dispatches      boolean not null default false,
  add column if not exists sms_events          boolean not null default false,
  -- Quiet-hours window (local time), evaluated against profiles.home_timezone by
  -- the guard. 8am-9pm is the compliant default; stored so a member could narrow
  -- (never widen past the legal bound — the guard clamps regardless).
  add column if not exists sms_quiet_start_hour smallint not null default 8
                           check (sms_quiet_start_hour between 0 and 23),
  add column if not exists sms_quiet_end_hour   smallint not null default 21
                           check (sms_quiet_end_hour between 0 and 23);

comment on column public.notification_preferences.sms_enabled is
  'Master SMS channel switch (EVENTS-REWORK §5, ADR-256). Defaults false. The sendSms() guard refuses unless this is true AND sms_consent=opted_in AND inside quiet hours AND the brand/campaign env flags are set.';

-- =============================================================================
-- VERIFICATION (after apply):
--  A. insert sms_consent with status='opted_in', consent_text set -> allowed.
--  B. insert sms_consent with status='bogus' -> rejected (check constraint).
--  C. member SELECT on another member's sms_consent row -> 0 rows (RLS).
--  D. member INSERT into sms_consent under auth role -> rejected (no insert policy).
--  E. existing notification_preferences rows -> sms_* columns present, all OFF.
--  F. sms_quiet_start_hour=25 -> rejected (range check).
-- =============================================================================
