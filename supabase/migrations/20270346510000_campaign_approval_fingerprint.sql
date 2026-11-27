-- EMAIL-086: approving or scheduling a campaign locks its exact content and audience.
--
-- THE GAP. EMAIL-081 puts a scheduled email back to draft when it is edited, but only on the edit paths that call
-- that reset. Any path that skips it can change an approved email, or who it goes to, and the send would go out
-- anyway.
--
-- THE FIX. On approve (lib/outbound/approvals.ts) or schedule (scheduleCampaign in lib/email-studio/send.ts) the app
-- stores a sha256 of the subject, preview text, block layout (every link lives there), audience (segment and
-- filter), and From and reply settings. sendCampaignNow, which the scheduled-send cron also calls, recomputes it
-- before claiming the row; a difference refuses the send and puts the campaign back in draft
-- (lib/email-studio/approval-fingerprint.ts). A NULL fingerprint (Send now, or scheduled before this) is unlocked.
--
-- Two nullable columns on an existing table: no backfill, no behavior change until the app stamps them.
-- campaigns keeps its existing RLS and grants. Additive and idempotent (safe to re-run).
-- Rollback: alter table public.campaigns drop column if exists approval_fingerprint, drop column if exists approval_fingerprinted_at;

alter table public.campaigns
  add column if not exists approval_fingerprint text check (approval_fingerprint is null or approval_fingerprint ~ '^[0-9a-f]{64}$'),
  add column if not exists approval_fingerprinted_at timestamptz;

comment on column public.campaigns.approval_fingerprint is
  'EMAIL-086: sha256 of the content and audience at approve or schedule. The send refuses when the campaign no longer matches it.';
