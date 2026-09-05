-- Resend webhook dedupe ledger + a lease on every 'sending' claim (scan two L2-05 + L6-10).
--
-- THE GAPS.
--   1. L2-05. The Resend webhook verified the svix-id but never stored it. recordEmailEvent appended
--      an email_events row on every delivery, and the route answered 503 (a Resend retry) whenever
--      any earlier step failed, including after that row was already appended. Every retry appended
--      the same event again, so opens, clicks, bounces and complaints were over-counted by every
--      reader of email_events, and Vera's circuit breaker tripped on inflated bounce counts. The
--      Stripe webhook already claims stripe_webhook_events(event_id) first; this is the same ledger
--      for Resend.
--   2. L6-10. The scheduled campaign cron and the drip runner each claim a row into 'sending' with a
--      conditional update, which is race-safe, but nothing ever reclaims a 'sending' row: a sender
--      that crashed mid-fan-out left the row 'sending' forever, never sent, never failed, and shown
--      as Live in the operator console. The outbox reclaims a 'processing' job after 5 minutes; these
--      two claims had no lease at all.
--
-- THE FIX.
--   1. email_webhook_events(event_id primary key): the route inserts the svix-id right after the
--      signature check; a unique violation (23505) answers 200 { duplicate: true } and does nothing,
--      any other claim error answers 500 so Resend retries into a working claim. Service-role only:
--      RLS on with no policy, explicit revokes from anon and authenticated (ADR-959, ADR-964).
--   2. sending_started_at on campaigns and space_drip_enrollments: the claim stamps it, and the
--      runners also take a row where status = 'sending' and the stamp is older than 15 minutes (a
--      dead sender), re-stamping the lease. campaigns.send_error records why a campaign moved to
--      'failed' so the operator can see it without the logs. A supporting index on
--      outreach_sends(campaign_id, contact_id) backs the resume read: a re-claimed campaign sends
--      only to recipients with no ledger row yet (lib/spaces/campaigns-send-due.ts).
--
--      Deliberately NOT a unique index on outreach_sends(campaign_id, contact_id): recordSend
--      (lib/spaces/email.ts) is a plain insert that swallows its error, so a unique index could not
--      stop a send (the job is already enqueued) and would silently drop the second ledger row,
--      which under-counts the daily cap that reads this table. The runner filters recipients BEFORE
--      the send instead; the ledger stays an honest count of what went out.
--
-- Additive and idempotent. Existing 'sending' rows keep a NULL sending_started_at and are NOT
-- reclaimed (the lease predicate excludes NULL); an operator moves those by hand, see the note at
-- the bottom.
--
-- Rollback: at the bottom.

begin;

-- ── 1. Resend webhook idempotency ledger ────────────────────────────────────────────────────────

create table if not exists public.email_webhook_events (
  event_id    text primary key,          -- the svix-id header, stable across Resend retries
  type        text,                      -- the Resend event type, for inspection only
  received_at timestamptz not null default now()
);

comment on table public.email_webhook_events is
  'Idempotency ledger for the Resend webhook (scan two L2-05): one row per svix-id, claimed before the event is recorded. Service-role only; app/api/webhooks/resend/route.ts.';

alter table public.email_webhook_events enable row level security;
-- No policies: the webhook writes through the service-role client; clients never read this.
revoke all on table public.email_webhook_events from public, anon, authenticated;
grant select, insert, delete on table public.email_webhook_events to service_role;

-- ── 2. A lease on the 'sending' claim ───────────────────────────────────────────────────────────

alter table public.campaigns add column if not exists sending_started_at timestamptz;
alter table public.campaigns add column if not exists send_error text;

comment on column public.campaigns.sending_started_at is
  'When the current ''sending'' claim was taken (scan two L6-10). The scheduled-send cron re-claims a ''sending'' row whose stamp is older than 15 minutes (a dead sender) and resumes the fan-out from the outreach_sends ledger. NULL on a row claimed before this column existed: such a row is not reclaimed.';
comment on column public.campaigns.send_error is
  'Why the last send attempt moved this campaign to ''failed'' (lib/spaces/campaigns-send-due.ts). Cleared on a fresh claim.';

alter table public.space_drip_enrollments add column if not exists sending_started_at timestamptz;

comment on column public.space_drip_enrollments.sending_started_at is
  'When the current ''sending'' claim was taken (scan two L6-10). The drip runner re-claims a ''sending'' row whose stamp is older than 15 minutes (a dead sender). NULL on a row claimed before this column existed: such a row is not reclaimed.';

-- The stale-lease scans: (status, sending_started_at) over the one status they look at.
create index if not exists campaigns_sending_lease_idx
  on public.campaigns (sending_started_at)
  where status = 'sending';

create index if not exists space_drip_enrollments_sending_lease_idx
  on public.space_drip_enrollments (sending_started_at)
  where status = 'sending';

-- The resume read: which recipients of THIS campaign already have a ledger row.
create index if not exists outreach_sends_campaign_contact_idx
  on public.outreach_sends (campaign_id, contact_id)
  where campaign_id is not null;

commit;

-- Rows already stuck at 'sending' from before this migration carry a NULL lease and stay where they
-- are. To surface them to the operator as failed rather than live:
--   update public.campaigns set status = 'failed', send_error = 'stranded at sending before the lease existed'
--     where status = 'sending' and sending_started_at is null;
--   update public.space_drip_enrollments set status = 'stopped'
--     where status = 'sending' and sending_started_at is null;
--
-- Rollback:
--   drop index if exists public.outreach_sends_campaign_contact_idx;
--   drop index if exists public.space_drip_enrollments_sending_lease_idx;
--   drop index if exists public.campaigns_sending_lease_idx;
--   alter table public.space_drip_enrollments drop column if exists sending_started_at;
--   alter table public.campaigns drop column if exists send_error;
--   alter table public.campaigns drop column if exists sending_started_at;
--   drop table if exists public.email_webhook_events;
-- After the rollback the runners fall back to claiming 'scheduled' / 'enrolled' rows only, but they
-- select the dropped columns, so revert the code in the same change.
