-- =====================================================================
-- Starter Circles, part 0 of 3: the 'draft' lifecycle state.
-- =====================================================================
-- Adopting a Starter Circle ("Make it yours") hands the new Host a PRIVATE
-- DRAFT they own and edit before it goes live. We model that draft as a new
-- value on the existing `group_status` enum rather than a parallel boolean,
-- because every discovery read already filters `status IN ('forming','active')`
-- (or `status <> 'archived'`), so a 'draft' circle is hidden from the library
-- with ZERO changes to those queries. Only the circles SELECT policy needs a
-- targeted tightening (part 1) so a draft is visible to its owner + oversight,
-- not to every authenticated member.
--
-- ISOLATED IN ITS OWN MIGRATION ON PURPOSE: Postgres forbids USING a freshly
-- added enum value in the same transaction that adds it, and forbids ADD VALUE
-- inside a function/DO block. Keeping the ADD VALUE alone (no use, bare
-- statement) lets it commit cleanly; part 1 then references 'draft' in a new
-- transaction where it is committed and safe to use. Idempotent.
-- =====================================================================

ALTER TYPE group_status ADD VALUE IF NOT EXISTS 'draft';
