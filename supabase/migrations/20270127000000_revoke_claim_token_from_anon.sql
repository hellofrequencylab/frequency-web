-- =====================================================================
-- 🔴 SECURITY: a Business Space claim token was readable by ANY anonymous
-- caller, which is ownership of that business for the taking
-- =====================================================================
-- SEVERITY: privilege escalation, live, trivially exploitable, no auth
-- and no credential required.
--
-- WHAT WAS WRONG. `20261145000000_spaces_claim.sql` added `claim_token`
-- (and `claimed_by`) as PLAIN COLUMNS on `public.spaces`. That table is
-- deliberately anon-readable for active, non-private rows — that is how
-- the public Space directory works. Postgres RLS is ROW-level, not
-- COLUMN-level, so the visibility-aware row policy correctly returned the
-- Space's row and then handed over every column on it, including the
-- secret.
--
-- The anon publishable key ships inside every browser bundle by design, so
-- the exploit needed nothing but that key:
--
--     select slug, claim_token from spaces where claim_token is not null;
--
-- Verified on production before writing this, executing as `role anon`
-- with RLS enforced: it returned every live unclaimed token in one query.
-- `/spaces/claim/<token>` transfers ownership to whoever presents the
-- token; nothing else is checked. Each row was therefore a one-tap
-- takeover of a real local business's page.
--
-- ── WHY THE OBVIOUS FIX DOES NOT WORK ────────────────────────────────
-- 🔴 `revoke select (claim_token) on spaces from anon` is a NO-OP here,
-- and it reports success. A column-level revoke can only remove a
-- column-level grant; it cannot punch a hole in a TABLE-level one. `anon`
-- and `authenticated` both hold table-wide SELECT on `spaces`, so after
-- that revoke the exploit query still returned every token. This was
-- caught only by re-running the exploit as `anon` after applying it —
-- the migration's own success status proved nothing.
--
-- The correct shape is: drop the table-level grant, then re-grant the
-- allowed columns explicitly.
--
-- ⚠️ CONSEQUENCE, DELIBERATE: with no table-level SELECT, a column added
-- to `spaces` later is NOT readable by anon/authenticated until someone
-- grants it. That is fail-CLOSED, and it is the behaviour we want for a
-- table that has now leaked a secret once. A new public column needs one
-- line in its own migration:
--     grant select (new_col) on public.spaces to anon, authenticated;
--
-- ⚠️ AND: with partial column grants, `select *` ERRORS ("permission
-- denied for column"), it does not silently omit. Verified before
-- applying that the app issues NO `select('*')` and no embedded
-- `spaces(*)` against this table; every claim-column read goes through
-- `createAdminClient()` (service_role, unaffected by these grants) in
-- lib/spaces/claim.ts, which is the only module that touches them.
--
-- `claimed_by` is withheld alongside `claim_token`. It is not a secret of
-- the same kind, but it discloses which profile owns a Space to anonymous
-- callers with no reason to know it, and it belongs to the same flow.
--
-- NOT COVERED HERE: every token that existed before this migration must be
-- treated as disclosed. Rotation is deliberately NOT done in a migration —
-- it would invalidate claim links already emailed to real business owners,
-- which is the operator's call. See the PR's follow-up note.
-- =====================================================================

-- 1. Drop the table-wide grant that was overriding every column revoke.
revoke select on public.spaces from anon, authenticated;

-- 2. Re-grant every column EXCEPT claim_token and claimed_by. Listed
--    explicitly rather than generated, so this file is a readable record
--    of exactly what a browser client may see on a Space.
grant select (
  id, slug, name, type, status, entity_id, skin, domain,
  network_connected, enabled_verticals, owner_profile_id,
  created_at, updated_at, brand_name, brand_logo_url, brand_accent,
  generation, visibility, plan, entitlements, about, tagline,
  email_enabled, stripe_customer_id, stripe_subscription_id,
  feature_roles, is_comped, seat_quantity, mode_variant, preferences,
  cover_image_url, claimed_at, last_plan_event_at
) on public.spaces to anon, authenticated;

-- 3. Writes to the claim columns are service_role only. Only the Business
--    Seeder and the claim action touch them, both under the admin client.
revoke insert (claim_token, claimed_by) on public.spaces from anon, authenticated;
revoke update (claim_token, claimed_by) on public.spaces from anon, authenticated;

comment on column public.spaces.claim_token is
  'One-time secret that transfers ownership of an unclaimed Space to whoever presents it at /spaces/claim/<token>. service_role ONLY: 20270127000000 revoked the table-wide SELECT on spaces and re-granted every column except this one and claimed_by, because spaces is anon-readable at the ROW level and RLS cannot hide a column (a column-level revoke against a table-level grant is a silent no-op). Read it only through createAdminClient() (lib/spaces/claim.ts). Never add it to a select list reachable by a browser client, and never re-grant the column. A NEW public column on spaces needs its own explicit grant.';
