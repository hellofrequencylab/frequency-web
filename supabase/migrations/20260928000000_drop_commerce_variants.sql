-- Phase A2: retire the orphaned commerce_variants table + its unused FK column.
-- Applied to prod + version-reconciled.
--
-- commerce_variants was never populated (0 rows); commerce_order_items.variant_id was always
-- null and its write was removed in Phase A1 (#1411, deployed) so prod no longer writes it.
-- Dropping the column removes the FK constraint; then the table drops with no remaining
-- references. Verified before drop: 0 variant rows, 0 order-items with a variant.

alter table public.commerce_order_items drop column if exists variant_id;
drop table if exists public.commerce_variants cascade;
