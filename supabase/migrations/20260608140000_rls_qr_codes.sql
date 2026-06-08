-- RLS Phase 2 — Surface 9: QR member codes (ADR-174)
--
-- qr_codes already has RLS enabled (rowsecurity = true) but had zero policies,
-- meaning every access required the service-role client. Adding owner-scoped
-- read + write policies so member-codes.ts and the codes page can use the
-- user-scoped client directly. Scan-count increments and campaign-admin reads
-- remain service-role (qr_scans and the operator entry-point functions are
-- unaffected by this migration).
--
-- Policy notes:
--   - SELECT: owner reads only their own codes (owner_profile_id = caller).
--     Partner/system codes that have no owner_profile_id stay invisible to
--     the user client (they're managed exclusively by the admin client).
--   - INSERT: owner inserts their own codes (both owner_profile_id AND
--     created_by must match the caller — belt + suspenders, mirrors the
--     Phase 1 pattern from ADR-056).
--   - UPDATE: owner edits their own codes (title, style, destination).
--     scan_count increments bypass this via service-role anyway.
--   - No DELETE policy: members can deactivate (active=false) but the admin
--     client handles physical deletes via the Studio QR manager.

CREATE POLICY "qr_codes: read own"
  ON qr_codes
  FOR SELECT
  USING (owner_profile_id = get_my_profile_id());

CREATE POLICY "qr_codes: insert own"
  ON qr_codes
  FOR INSERT
  WITH CHECK (
    owner_profile_id = get_my_profile_id()
    AND created_by   = get_my_profile_id()
  );

CREATE POLICY "qr_codes: update own"
  ON qr_codes
  FOR UPDATE
  USING (owner_profile_id = get_my_profile_id());
