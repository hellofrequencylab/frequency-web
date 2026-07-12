-- Email Studio analytics — EXACT per-campaign attribution (fixes the misleading
-- "Delivered" count). Before this, per-campaign metrics guessed a campaign's events by a
-- segment + 30-day-window heuristic, which credited every unrelated transactional email to
-- any segment member back to the campaign (a 4-recipient send read as "25 Delivered").
--
-- The fix: the send loop tags each recipient email with the campaign id (Resend header
-- X-Campaign-Id + a `campaign_id` tag), the Resend webhook reads that id back off the event
-- payload, and writes it here. getCampaignMetrics then counts ONLY rows carrying this id.
--
-- Additive + idempotent. Nullable, so every historical row (untagged) stays valid and the
-- analytics layer falls back to the campaign's recorded recipient_count for those. Service-
-- role only (same as the rest of email_events); no RLS/policy change. Regenerate types after
-- applying.

alter table public.email_events
  add column if not exists campaign_id uuid;

create index if not exists email_events_campaign_id_idx
  on public.email_events (campaign_id)
  where campaign_id is not null;

comment on column public.email_events.campaign_id is
  'The Email Studio campaign this event belongs to, tagged at send (Resend X-Campaign-Id header / campaign_id tag) and read back by the webhook. NULL for transactional mail and for campaigns sent before exact attribution shipped. See lib/email-studio/analytics.ts.';
