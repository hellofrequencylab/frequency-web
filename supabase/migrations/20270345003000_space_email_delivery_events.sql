-- space_email_events: WIDEN `kind` TO THE DELIVERY AXIS (LIVE-236).
--
-- THE DEFECT. `space_email_events` was created (20261189000000) as the ENGAGEMENT log: open, click,
-- reply. Its header said "the delivery ledger, outreach_sends, already records SENT / DELIVERED /
-- BOUNCED / COMPLAINED / SUPPRESSED" and that was true of the SCHEMA and false of the CODE: the
-- Resend webhook only ever called handleSpaceSendWebhook for `bounced` and `complained`, so a Space
-- send's status went to `queued`, then `sent`, and STOPPED. Nothing anywhere set it to `delivered`.
--
-- What an operator saw: getSpaceEmailStats counts outreach_sends by status, so the Marketing panel
-- read "Delivered 0" no matter how many emails landed, forever. Sending without delivery feedback is
-- worse than not sending, because it teaches an operator that the tool does not work.
--
-- THE FIX has two halves and this is the schema one: the per-Space event log now carries the delivery
-- events too, so an operator has a per-send record of what the provider actually did rather than only
-- a status column that one code path forgot to write. The code half is
-- lib/spaces/email-tracking.ts (the writer) plus lib/spaces/email.ts (the status flip, now including
-- `delivered`) and app/api/webhooks/resend/route.ts (the seam that calls them).
--
-- PURELY ADDITIVE. The three original kinds keep their exact meaning and every existing row stays
-- valid; countEngagement still counts only `open` and `click`, so no rate moves because of this
-- migration. Widening a CHECK constraint cannot invalidate a stored row here, because every stored
-- row already satisfies the narrower set.
--
-- IDEMPOTENT: the constraint is dropped by name (IF EXISTS) and re-added, so a re-run lands on the
-- same state whether the widened constraint is present or not. SAFE to re-run. No em dashes.

alter table public.space_email_events
  drop constraint if exists space_email_events_kind_check;

alter table public.space_email_events
  add constraint space_email_events_kind_check
  check (kind in ('open', 'click', 'reply', 'delivered', 'bounced', 'complained'));

comment on column public.space_email_events.kind is
  'ENGAGEMENT: open (tracking pixel loaded) | click (a tracked link followed) | reply (an inbound email matched back to a send). DELIVERY (LIVE-236, from the Resend webhook): delivered | bounced | complained. Engagement rates count only open and click, and count DISTINCT send_ids, so the self-hosted pixel and a provider open event on the same send count once.';
