-- Re-index legacy uploads into their owner's Loom.
--
-- library_assets.created_by drives the Loom "My uploads" scope (lib/loom/picker-actions.ts), but only
-- picker uploads set it historically. Attribute EXISTING space-scoped assets to that space's OWNER —
-- the only per-person signal available on old rows — so an operator's prior uploads surface in their
-- Loom. Forward-fix: the interactive upload paths now stamp created_by at write time.
--
-- LOSSY BY DESIGN (disclosed): a teammate EDITOR's historical upload lands under the space OWNER, not
-- the actual uploader; and root/owner-less legacy rows have no attribution and stay null. The shared
-- master library (spaces.type = 'root') is excluded so it is never dumped into one person's Loom.
-- Idempotent: only touches rows still null.

update public.library_assets la
set created_by = s.owner_profile_id
from public.spaces s
where la.space_id = s.id
  and la.created_by is null
  and s.owner_profile_id is not null
  and s.type <> 'root';
