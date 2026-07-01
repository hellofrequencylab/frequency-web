-- Space Updates interaction anchor: the 'space_update' post_type value (Puck content blocks,
-- Phase 2, ADR-476/472). A brand Update authored on a Space landing REUSES the existing member
-- reactions + comments system rather than growing a parallel one: each space_updates row links to a
-- public.posts row (space_updates.post_id, added in the companion table migration), and members
-- react through public.post_reactions(post_id) and comment through public.posts(parent_id) exactly
-- as they do on a feed post. That anchor post carries post_type = 'space_update' so it is
-- distinguishable from a circle feed post and never surfaces in the community feed.
--
-- SINGLE-PURPOSE ON PURPOSE (mirrors 20260616100000_post_type_system_value.sql): a new enum value
-- cannot be USED in the same transaction that adds it (PostgreSQL rule), so this file ONLY adds the
-- value; the table + link that reference it live in the companion migration 20260918000200.
--
-- No em or en dashes in any comment or string (CONTENT-VOICE).
--
-- WARNING: NOT APPLIED in this PR. Ships as a FILE for owner hand-review + the db-tests fresh-apply
-- path. Do not run this against prod from the PR.

alter type post_type add value if not exists 'space_update';

-- == Rollback (hand-review aid) ===================================================================
-- PostgreSQL cannot DROP a single enum value in place. If a reversal is ever needed, it is done by
-- recreating the post_type enum without 'space_update' and re-pointing the dependent columns, which
-- is only safe once no row uses the value. Because this file only ADDS the value (idempotent, no
-- write), leaving it in place is inert and harmless: nothing reads it unless the companion table +
-- app path are present.
