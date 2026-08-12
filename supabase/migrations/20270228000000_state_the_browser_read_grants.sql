-- State the browser read grants the two-axis Circle model has always depended on (ADR-1019).
--
-- ── WHAT THIS FIXES, AND HOW IT WAS FOUND ────────────────────────────────────────────────────
--
-- `supabase/tests/circle_privacy.test.sql` (ADR-1015) is the first test in this repo's history to
-- read `public.circles` as `anon` on a FRESHLY-BUILT database. It died on its seventh assertion:
--
--     ERROR: permission denied for table circles
--     HINT:  Grant the required privileges to the current role with: GRANT SELECT ON public.circles TO anon;
--
-- The same query against PRODUCTION, as `anon`, returns rows. Both statements are true, and the
-- gap between them is the finding: **production holds a grant that no file in this repository
-- grants.** `circles` was created by `20240102000000_hierarchy_v2.sql` back when Supabase's
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public` stamped anon/authenticated onto every new table, so
-- the live grant is a side effect of the environment at creation time, not a decision anybody
-- wrote down. A fresh rebuild — local dev, a preview branch, a disaster-recovery restore — does
-- not reproduce it. Verified 2026-08-12: `grep -rn "grant .* on .*circles"` across every migration
-- returns EXECUTE grants on four functions and nothing else.
--
-- ⚠️ The MECHANISM by which the fresh apply ends up without the grant is NOT established here, and
-- this comment will not pretend otherwise. What is established, and is enough to act on:
--   · production grants anon + authenticated table-level SELECT on all four tables below
--   · no migration in this repo grants any of them
--   · a fresh apply demonstrably lacks it for `circles` (the CI run above is the proof)
-- Anyone who later identifies the mechanism should record it in ADR-1019 rather than delete this.
--
-- ── WHY A GRANT, RATHER THAN A CHANGE TO THE TEST ────────────────────────────────────────────
--
-- Because the direct read is REAL, SHIPPED behaviour, not an artefact of the test. The permissive
-- read policy on `circles` is `TO PUBLIC` and its base branch (`status <> archived AND status <>
-- draft`) is role-independent, so a signed-out visitor is meant to reach the table and be filtered
-- by RLS. That is the design the two RESTRICTIVE policies were written against
-- (`circles_access_restrictive`, `circles_space_visible`). Rewriting the assertion to go through
-- `public_circles()` would have made the suite green while leaving the rebuild broken, and would
-- have deleted the only coverage of the direct path a real browser takes.
--
-- ── WHY THIS IS BEHAVIOUR-PRESERVING ON PRODUCTION ───────────────────────────────────────────
--
-- Every grant below is one production already holds, so applying this changes nothing live; it
-- only makes the rebuild faithful. Note what it deliberately does NOT restate: production also
-- carries ambient INSERT/UPDATE/DELETE for anon on these tables, from the same default-privileges
-- accident. Those are held back by RLS alone, which is precisely the posture ADR-959 and
-- `20270218000000_close_default_grants_on_internal_tables.sql` exist to retire. Restating them
-- here would launder an accident into an intention. SELECT only.
--
-- RLS is the lock; the grant is only the door. All four tables have RLS enabled with policies, so
-- a grant without a matching policy still returns zero rows — which is exactly what the roster
-- assertions in the test prove: anon may ASK `memberships` and gets nothing back.

grant select on table public.circles      to anon, authenticated;
grant select on table public.memberships  to anon, authenticated;
grant select on table public.profiles     to anon, authenticated;
grant select on table public.entities     to anon, authenticated;

-- `spaces` is deliberately absent. It is the one table in this set that does NOT hold a plain
-- table-level grant in production: `20270217000000_spaces_revoke_stripe_columns_from_anon.sql`
-- revoked two columns from anon, and Postgres converts a table-level grant into per-column grants
-- the moment you do that. Re-granting `select on table public.spaces` here would silently hand
-- `stripe_customer_id` and `stripe_subscription_id` back to every signed-out visitor. Leave it.
