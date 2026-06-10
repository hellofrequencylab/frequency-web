-- =============================================================================
-- Fix member-code provisioning: make qr_codes (owner_profile_id, purpose)
-- a FULL unique index instead of a partial one.
--
-- The previous index was partial (WHERE owner_profile_id IS NOT NULL AND
-- purpose IS NOT NULL). PostgreSQL's ON CONFLICT (owner_profile_id, purpose)
-- column inference cannot match a partial unique index, so the upsert in
-- lib/qr/member-codes.ts (ensureMemberCodes) failed on EVERY provisioning
-- attempt — and the error was swallowed, so the "Invite friends" dialog
-- surfaced only "Could not generate your invite link."
--
-- A full unique index enforces the same constraint: btree treats NULLs as
-- distinct, so the many owner-less page/campaign codes (owner_profile_id IS
-- NULL) remain legal, while each member still gets at most one code per
-- purpose. And being non-partial, it IS inferable by ON CONFLICT.
--
-- Applied to prod 2026-06-10 (this file is the repo record), together with a
-- one-time backfill that provisioned the `connect` code for all existing
-- members. Going forward, codes are auto-provisioned at onboarding completion
-- and lazily on the invite/codes surfaces.
-- =============================================================================

drop index if exists qr_codes_owner_purpose_uniq;
create unique index qr_codes_owner_purpose_uniq on public.qr_codes (owner_profile_id, purpose);
