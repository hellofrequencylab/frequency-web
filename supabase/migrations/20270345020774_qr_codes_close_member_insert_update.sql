-- qr_codes: close the open insert and update grants on the session roles (SCAN-774).
--
-- WHAT WAS WRONG. 20260608140000_rls_qr_codes.sql gave the owner-scoped insert and update policies
-- so lib/qr/member-codes.ts can provision a member's personal code through the session client. The
-- policies check only that owner_profile_id and created_by equal the caller; they limit no columns,
-- and the Supabase default grants left INSERT and UPDATE on every column for anon and authenticated.
-- A signed-in member could therefore insert a row through PostgREST with destination_type 'circle'
-- and ANY circle_id, or with space_id of any Space and purpose 'lead', and the /q resolver treated
-- the row as a Host-minted invite (app/q/[slug]/route.ts) or a Space lead door.
--
-- WHAT THIS DOES. Revoke INSERT and UPDATE on the table from both session roles, then grant INSERT
-- back on exactly the columns the one session-client writer still sends (member-codes.ts: the
-- personal connect code). circle_id, event_id, node_id, space_id, partner_id, splash, scan_count,
-- active, valid_from, valid_until, switch_at and alt_target_url are no longer writable from a
-- session. No session-client UPDATE exists in lib/ or app/ (every edit, retarget, deactivate and
-- delete runs on the service-role client behind its own gate), so nothing is granted back for it.
-- SELECT and the three RLS policies are untouched; the insert policy still binds the owner columns
-- to the caller.
--
-- The service role is not named here and keeps every grant. Safe to re-run.

revoke insert, update on table public.qr_codes from anon, authenticated;

grant insert (slug, title, destination_type, target_url, purpose, owner_profile_id, created_by, style)
  on table public.qr_codes to authenticated;
