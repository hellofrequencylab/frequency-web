-- =============================================================================
-- ADR-231 (part 1 of 2): the 'system' post type.
--
-- System lines are the system voice's feed announcements (Vera's "X joined the
-- community" join notices) — rendered by the client as ONE quiet centered line
-- (components/feed/post-card.tsx SystemLine), never a full post card.
--
-- This file is single-purpose on purpose: a new enum value cannot be USED in
-- the same transaction that adds it (PostgreSQL rule), so every write that
-- references 'system' lives in the companion migration 20260616110000.
-- =============================================================================

ALTER TYPE post_type ADD VALUE IF NOT EXISTS 'system';
