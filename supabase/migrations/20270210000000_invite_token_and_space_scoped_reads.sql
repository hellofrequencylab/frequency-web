-- Close one live credential leak and two latent siblings of the page_settings shape.
-- Found by the 2026-08-04 meta-scan security pass.
--
-- ── 1. invite_links: every invite TOKEN was readable by anyone ────────────────────────────
--
-- `Anyone can read active invite links` was `USING (true)` to ALL roles, and `anon` holds
-- SELECT on the table, so RLS was the only wall and it was open. The anon key ships in the
-- browser bundle, so anyone could GET /rest/v1/invite_links?select=token,circle_id and
-- receive every invite token on the platform, then walk /join/<token> into any private
-- Circle they were never invited to. Despite its name the policy did not even filter
-- `is_active`, so revoked and expired tokens came back too.
--
-- The token IS the security of the invite system: randomBytes(12).toString('base64url'),
-- 96 bits, unguessable by brute force and world-readable by policy.
--
-- The 2024 migration that added it justified it as "needed for public /join page". That
-- justification is obsolete and appears never to have been true: app/join/[token]/page.tsx
-- reads through createAdminClient(), which bypasses RLS. Verified every access path in the
-- codebase -- app/join/[token]/page.tsx, circles/actions.ts, admin/actions.ts,
-- lib/achievements.ts -- and all four use the admin client. Nothing reads this table
-- through the anon or authenticated client.
--
-- Live exposure at time of writing: 0 rows. This is a policy defect on a credential table,
-- not a live breach -- but the next invite a host created would have been world-readable.
--
-- Dropping the only policy leaves the table RLS-on-no-policy (fail-closed), matching the 77
-- other service-role-only tables. scripts/rls-deny-all.txt is updated in the same commit.
drop policy if exists "Anyone can read active invite links" on public.invite_links;

comment on table public.invite_links is
  'Circle invite tokens. RLS-on-no-policy: fail-closed, service-role only. Every reader and writer goes through createAdminClient(), including the public /join/[token] page. Do NOT add an anon-readable policy -- the token is the entire security of the invite (ADR-927 follow-up, 2026-08-04).';

-- ── 2 + 3. menus / app_overrides: the page_settings shape, not yet bitten ─────────────────
--
-- Both are space-scoped (nullable space_id) and both read `USING (true)`. Today every row
-- is platform-global -- all 4 menus rows have space_id IS NULL (the global header/footer/
-- left/profile nav), app_overrides is empty -- so nothing leaks yet. The schema permits
-- per-Space rows, and the first one written would let a member of Space A read Space B's
-- menu shape including min_access / staff_domain / staff_level / ghost_message, or which
-- apps that Space has enabled and each one's min_role.
--
-- `space_id is null` keeps the global rows readable, which is what every current row is.
-- Writes on both tables are already service-role-only (each had exactly one policy), so
-- this is read-side only and no write path changes.
alter policy "menus readable by everyone" on public.menus
  using (space_id is null or private.can_view_space_content(space_id));

alter policy app_overrides_read_all on public.app_overrides
  using (space_id is null or private.can_view_space_content(space_id));
