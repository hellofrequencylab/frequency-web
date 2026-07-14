-- CRM Phase 1 — Complete the contact card (docs/CRM-MASTER-BUILD-PLAN.md §Phase 1 · ADR-372 lineage).
--
-- Widens the ONE interaction timeline (`contact_interactions`) vocabulary so every in-house touch can
-- land on the card:
--   • channel gains `in_app` — an in-house direct message / room message, written by the messaging
--     adapter (app/(main)/messages/actions.ts) so DMs finally reach the timeline.
--   • source  gains `import` — a touch reconstructed from a CSV / data import (used by the import
--     pipeline in a later phase; reserved here so its writer compiles against the same CHECK).
--
-- Kept in lock-step with lib/crm/interactions.ts (CHANNELS / SOURCES). ADDITIVE + idempotent (safe to
-- re-run): it only ADDS values to two CHECK constraints, so every historical row stays valid and no
-- data moves. No new table: per-contact engagement stats are computed on READ (lib/crm/engagement-
-- stats.ts) off this immutable log + email_events, so there is nothing to persist or refresh here.
--
-- No RLS / policy change: contact_interactions keeps its owner-scoped read policy and service-role
-- writes (see 20260728010000_crm_contact_interactions.sql). Regenerate types after applying:
--   npx supabase gen types typescript --linked > lib/database.types.ts
-- (until then the seam reaches the table untyped, ADR-246).

-- ── channel: add 'in_app' ─────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.contact_interactions'::regclass
      and conname = 'contact_interactions_channel_check'
  ) then
    alter table public.contact_interactions drop constraint contact_interactions_channel_check;
  end if;
end $$;

alter table public.contact_interactions
  add constraint contact_interactions_channel_check
  check (channel in ('email','sms','call','in_person','event','note','system','in_app'));

-- ── source: add 'import' ──────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.contact_interactions'::regclass
      and conname = 'contact_interactions_source_check'
  ) then
    alter table public.contact_interactions drop constraint contact_interactions_source_check;
  end if;
end $$;

alter table public.contact_interactions
  add constraint contact_interactions_source_check
  check (source in ('manual','engagement','resend','twilio','crm_activity','ai','playbook','system','import'));

comment on column public.contact_interactions.channel is
  'The channel of the touch: email | sms | call | in_person | event | note | system | in_app (in-house DM/room message, Phase 1). Kept in lock-step with lib/crm/interactions.ts CHANNELS.';

-- Rollback (not recommended; only narrows the vocabulary, which would reject already-written rows):
--   alter table public.contact_interactions drop constraint contact_interactions_channel_check;
--   alter table public.contact_interactions add constraint contact_interactions_channel_check
--     check (channel in ('email','sms','call','in_person','event','note','system'));
--   alter table public.contact_interactions drop constraint contact_interactions_source_check;
--   alter table public.contact_interactions add constraint contact_interactions_source_check
--     check (source in ('manual','engagement','resend','twilio','crm_activity','ai','playbook','system'));
