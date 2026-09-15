-- Drop the retired hierarchy-v2 `channels` + `channel_memberships` tables (LIVE-334, ADR-NNNN).
--
-- WHAT THESE WERE. `20240102000000_hierarchy_v2.sql` created `channels` (hub/nexus/outpost-scoped
-- "focus groups") and `channel_memberships` (the join/tune row). `20240201000000_hierarchy_v3_
-- topical_channels.sql` replaced the concept a month later with `topical_channels` +
-- `topical_channel_memberships` — global, Pillar-sorted topical forums — and every member-facing
-- and operator-facing Channel surface reads THOSE (`/channels`, `/channels/[id]`,
-- `/admin/channels`). The v2 pair was never migrated and never deleted. L9-01 (2026-09-05) cut the
-- last WRITER: the operator "New Channel" flow called a legacy `createChannel` that inserted into
-- these tables and redirected to `/channels/<uuid>`, which the Channel page turned into a 404.
--
-- MEASURED IN PRODUCTION 2026-09-15, before this file was written:
--   channels                      0 rows
--   channel_memberships           0 rows
--   topical_channels              9 rows (9 active)   <- the live Channels
--   topical_channel_memberships   4 rows
--   inbound FKs                   exactly one: channel_memberships.channel_id -> channels.id
--   views / matviews              none depend on either table
--   functions                     none reference either table (`mkt_interest_demand` reads
--                                 topical_channel_memberships only)
--   triggers                      one: trg_channels_block_suspended on channels (BEFORE INSERT,
--                                 the suspension guard) — dropped with the table
--   policies                      4 on channels, 3 on channel_memberships — dropped with the
--                                 tables, including "channel_memberships: crew+ join own" as
--                                 re-emitted by 20260612060000_retire_crew_role_value.sql
--
-- WHY A DROP AND NOT A RENAME-TO-ARCHIVE. There is nothing to preserve: both tables are empty, and
-- have been for the whole life of the v3 concept. An empty table that still holds `anon` and
-- `authenticated` grants (ALTER DEFAULT PRIVILEGES, ADR-959) is surface area, and a second table
-- called "channels" is the naming hazard docs/GLOSSARY.md had to warn about in prose.
--
-- ORDER. `channel_memberships` first: it carries the only FK into `channels`, so no CASCADE is
-- needed and nothing else can be reached by one. The two enums go last — `channel_scope_type` and
-- `channel_content_type` were used by `channels.scope` / `channels.type` and by NOTHING else in the
-- schema or the tree (measured: `pg_attribute` names only those two columns and the
-- `idx_channels_scope` index row; no app code references either type name).
--
-- IDEMPOTENT: every statement is `if exists`, so a re-run is a no-op.

begin;

drop table if exists public.channel_memberships;
drop table if exists public.channels;

drop type if exists public.channel_content_type;
drop type if exists public.channel_scope_type;

-- Assert the intent actually landed, so a silently-skipped statement is a failed apply rather
-- than a green one. The v3 tables must still be here — this file must never be read as retiring
-- the live Channel concept.
do $$
begin
  if to_regclass('public.channels') is not null then
    raise exception 'public.channels still exists after the drop';
  end if;
  if to_regclass('public.channel_memberships') is not null then
    raise exception 'public.channel_memberships still exists after the drop';
  end if;
  if to_regclass('public.topical_channels') is null then
    raise exception 'public.topical_channels is missing — the LIVE Channel table must survive this';
  end if;
  if to_regclass('public.topical_channel_memberships') is null then
    raise exception 'public.topical_channel_memberships is missing — it must survive this';
  end if;
end $$;

commit;
