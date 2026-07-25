-- ADR-812 inbound digest: a per-conversation watermark for the "roll new replies into one email" cron
-- (lib/comms/outbound-batch.ts flushConversationDigests). NULL = never digested. The cron advances it to
-- the last_inbound_at it just summarized, so a reply that lands after a digest still out-dates the mark
-- and rolls into the next one. Dormant until CONVERSATION_DIGEST_WINDOW_MINUTES > 0.

alter table public.comms_conversations
  add column if not exists last_digested_at timestamptz;

-- The digest cron scans conversations with a fresh inbound reply (last_inbound_at not null, past the
-- quiet window) that out-dates last_digested_at. Index the pair so the scan stays cheap as threads grow.
create index if not exists comms_conversations_digest_idx
  on public.comms_conversations (last_inbound_at)
  where last_inbound_at is not null;

-- The outbound batch cron scans for queued outbound messages to coalesce. A partial index keeps that scan
-- O(queued) instead of a table scan — and near-free on a deployment that never enables batching (0 rows).
create index if not exists comms_messages_queued_outbound_idx
  on public.comms_messages (conversation_id, occurred_at)
  where delivery_status = 'queued' and direction = 'outbound';
