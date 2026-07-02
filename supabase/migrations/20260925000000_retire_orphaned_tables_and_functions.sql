-- Meta-scan DB hygiene (owner-approved). Retire orphaned relations + functions.
--
-- Every item was verified before dropping: 0 code references (.from / .rpc), 0 incoming
-- foreign keys, 0 triggers, 0 RLS-policy dependencies, and 0 other-function-body callers
-- (checked via pg_policies + pg_proc.prosrc with word-boundary matches). Tables were empty
-- except menu_config (25 legacy rows, superseded by the menu_system tables — read by no
-- code). Applied to prod via MCP and version-reconciled to this filename.
--
-- NOT dropped here (needs code sequencing first): commerce_variants still has a FK from
-- commerce_order_items.variant_id and a (null-only) code write in lib/billing/checkout.ts;
-- drop the write + column, deploy, THEN drop the table.

drop table if exists public.circle_topics cascade;
drop table if exists public.menu_config cascade;
drop table if exists public.listing_saves cascade;
drop table if exists public.library_renditions cascade;
drop table if exists public.library_usages cascade;
drop table if exists public.conversation_room_migration cascade;

drop function if exists public.are_friends(uuid, uuid);
drop function if exists public.get_my_circle_id();
drop function if exists public.get_my_hub_id();
drop function if exists public.get_my_nexus_id();
drop function if exists public.get_my_outpost_id();
drop function if exists public.housing_rentals_near(numeric, numeric, integer, integer);
