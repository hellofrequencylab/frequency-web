-- Drop the redundant space_subscription_items_item_idx index (meta-scan #16 cleanup).
--
-- WHY IT IS REDUNDANT. 20260916000000_pricing_addons_seats.sql created the table with a
-- `unique (space_id, item_key)` table constraint, which Postgres backs with a UNIQUE btree index on
-- exactly (space_id, item_key). It then ALSO created a plain index
--   space_subscription_items_item_idx on (space_id, item_key)
-- over the SAME columns in the SAME order. The unique constraint's index fully covers every read the
-- plain index could serve (equality + range + ordering on (space_id, item_key), plus the space_id-only
-- prefix), so the plain index is pure duplicate write + storage overhead. The leading-column index
-- space_subscription_items_space_idx (space_id) is a different, narrower index and is kept.
--
-- SAFE + NON-DESTRUCTIVE. Dropping a redundant secondary index removes no data and cannot change query
-- RESULTS; the unique index (and thus the uniqueness guarantee) stays. `if exists` keeps it idempotent
-- and a no-op on any environment where the index was never created. Applied to prod via MCP
-- apply_migration only (ADR-495); never `supabase db push`. No em or en dashes (CONTENT-VOICE).

drop index if exists public.space_subscription_items_item_idx;
