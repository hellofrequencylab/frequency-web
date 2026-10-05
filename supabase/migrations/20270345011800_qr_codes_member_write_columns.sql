-- SCAN-774: a member could mint a circle invite by inserting their own qr_codes row.
--
-- The owner-scoped policies from 20260608140000 check only that owner_profile_id and created_by
-- are the caller. They say nothing about WHICH columns a member may set, and the default
-- privileges Supabase ships grant authenticated INSERT and UPDATE on every column. So a signed-in
-- member could insert, through PostgREST, a row with destination_type = 'circle' and any
-- circle_id, then scan it: the /q resolver treated a circle code as the Host's invite and joined
-- the scanner into a paid or invite-only Circle. The same reach let a member stamp space_id and
-- purpose = 'lead' onto a code and feed scans into another Space's CRM.
--
-- The only session-client writer that remains is lib/qr/member-codes.ts (ensureMemberCodes), which
-- upserts the member's personal codes with exactly: slug, title, destination_type, target_url,
-- purpose, owner_profile_id, created_by, style. Every other writer (the admin studio, Space codes,
-- entry points, the codes page) runs on the service role. So the table-level INSERT and UPDATE are
-- revoked from anon and authenticated, and INSERT is granted back on that column list alone;
-- UPDATE is granted back on the cosmetic columns the update-own policy was written for (title,
-- style, target_url, active). circle_id, event_id, node_id, space_id, partner_id, splash,
-- alt_target_url, switch_at, source_tag, campaign_id, template_id and scan_count are no longer
-- writable by a member on any path. SELECT and the three policies are untouched; the policies
-- still bind the rows a member may write to their own.
--
-- The app-layer half (the /q resolver checking that a circle code's minter is the Host, a Space
-- steward or staff before passing invited) is in app/q/[slug]/route.ts and lib/qr/circle-invite.ts.
-- Behavioural proof: supabase/tests/qr_codes_member_write_columns.test.sql. SAFE to re-run.

revoke insert, update on table public.qr_codes from anon, authenticated;

grant insert (slug, title, destination_type, target_url, purpose, owner_profile_id, created_by, style)
  on table public.qr_codes to authenticated;

grant update (title, style, target_url, active)
  on table public.qr_codes to authenticated;
