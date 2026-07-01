-- Space Cover image (Puck content blocks, Phase 2, ADR-476/472 follow-on). Adds ONE additive
-- column to public.spaces so the new Cover block has a place to store the operator's uploaded
-- banner image. The Cover block ALSO carries its image in the Puck document (like every other
-- media block), so this column is a convenience anchor for surfaces that want the banner OUTSIDE
-- the Puck doc (og image, share cards, the manage console preview) without parsing the document.
--
-- WHY IT IS SAFE. This is FREE content framing, not an entitlement: a banner image changes nothing
-- any Space can DO, and no gate reads it. The column is additive with a NULL default, so every
-- existing row keeps reading and behaving identically with no backfill.
--
-- HOUSE STYLE (mirrors 20260917000000_space_modes.sql): additive + idempotent (add column if not
-- exists). RLS UNCHANGED: the existing public.spaces policies already gate the ROW (every column),
-- so cover_image_url inherits the same owner/admin-write, public-active-read posture with NO new
-- policy. Writes flow through the gated Space-content server actions (canEditProfile), the same
-- posture as spaces.preferences. No em or en dashes in any comment or string (CONTENT-VOICE).
-- Reached untyped from app code until lib/database.types.ts regenerates (ADR-246):
--   npx supabase gen types typescript --linked > lib/database.types.ts
-- (Do NOT hand-edit lib/database.types.ts.)
--
-- WARNING: NOT APPLIED in this PR. Ships as a FILE for owner hand-review + the db-tests fresh-apply
-- path. Do not run this against prod from the PR. Rollback notes at the foot of the file.

-- == Prerequisites already present (referenced, never recreated): public.spaces (with type,
--    entitlements, owner_profile_id, preferences). RLS on public.spaces is already enabled with the
--    owner/admin write + public-active read policies. No helper functions are added.

alter table public.spaces
  add column if not exists cover_image_url text;

comment on column public.spaces.cover_image_url is
  'Puck content blocks Phase 2 (ADR-476/472): the operator-uploaded landing banner image for the Cover block. Nullable; null means no stored cover (the block falls back to a neutral placeholder). Convenience anchor for surfaces that need the banner outside the Puck document (og image, share cards). Read untyped until lib/database.types.ts regenerates.';

-- == RLS: UNCHANGED ===============================================================================
-- No policy is added or altered. public.spaces already has row level security enabled with the
-- owner/admin write + public-active read policies, and those policies gate the ROW (every column),
-- so cover_image_url inherits the same protection automatically. Writes flow through the service-role
-- admin client behind the gated Space-content server actions (double-gated on canEditProfile
-- server-side), exactly like spaces.preferences. There is no client write policy specific to this
-- column.

-- == Rollback (hand-review aid) ===================================================================
-- Additive + behavior-preserving (no gate reads this column; NULL reproduces today's behavior). To
-- reverse:
--   1. alter table public.spaces drop column if exists cover_image_url;
-- No policy, index, trigger, or data backfill was added, so nothing else needs reverting.
