-- Cover the three attribution foreign keys the advisor flagged (meta-scan 2026-08-20).
--
-- All three are "who did it" columns added with recent features, each a FK to profiles
-- with no covering index:
--
--   event_rsvps.guest_claimed_by       (20270303000000 guest RSVP seats)
--   spaces.beta_price_granted_by       (20270304000100 beta price grant)
--   store_redemptions.fulfilled_by     (20270312000000 cosmetic fulfillment)
--
-- Why it matters at this size: not read speed (rows are tens, not millions) but the
-- profiles DELETE path - every uncovered FK forces a sequential scan of the referencing
-- table inside the delete's constraint check, and profiles deletes happen on every
-- account deletion. Partial indexes (where the column is set) keep them near-empty:
-- attribution columns are null on almost every row.
--
-- Idempotent: if not exists on all three.

create index if not exists event_rsvps_guest_claimed_by_idx
  on public.event_rsvps (guest_claimed_by) where guest_claimed_by is not null;

create index if not exists spaces_beta_price_granted_by_idx
  on public.spaces (beta_price_granted_by) where beta_price_granted_by is not null;

create index if not exists store_redemptions_fulfilled_by_idx
  on public.store_redemptions (fulfilled_by) where fulfilled_by is not null;
