-- 🔴 A PROPOSAL, NOT A MIGRATION. It lives in docs/proposals/ ON PURPOSE.
--
-- A file in supabase/migrations/ is an ASSERTION THAT PRODUCTION HAS RUN IT. That is not a
-- convention, it is enforced: check:migrations rule 4 (ADR-1007) compares this repo against
-- `supabase_migrations.schema_migrations` and fails on a repo file with no ledger row, because such
-- a file replays on every fresh environment while the live database has never seen it. Until the
-- owner applies this, that assertion would be FALSE, so the file may not sit there.
--
-- 🔴 THIS ALREADY HAPPENED, ON THIS EXACT FILE. It was committed into supabase/migrations/ as
-- 20270304000000 in 663762b and CI's `checks` job went red: the applied ledger head was
-- 20270303000100 and this version had no row. The local run had printed a LOUD SKIP — check:migrations
-- degrades to a skip when it has no credentials, and CI arms it with SUPABASE_ACCESS_TOKEN +
-- SUPABASE_PROJECT_REF — and the skip was read as a pass. "I could not look" is not "I looked and
-- found nothing", which is the failure this repo keeps re-learning. A local green on
-- check:migrations proves the TREE is well-formed and NOTHING about what production has applied.
--
-- WHY IT IS NOT APPLIED: revoking EXECUTE in production is a security change with an outage mode —
-- a revoke on a function the public site actually calls takes the page down — and the
-- classification below is the owner's call, not an agent's. OWN-006 stays open until they make it.
--
-- ── TO PROMOTE IT, IN THIS ORDER. All three steps, or none. ────────────────────────────────────
--
--   1. MOVE this file to
--      supabase/migrations/20270304000000_revoke_browser_execute_on_service_only_rpcs.sql
--      Keep the version: 20270304000000 sorts after the head it was written against,
--      20270303000100. If another migration has landed since, take the next free version instead of
--      reusing this one — check:migrations rule 1 fails a duplicate version, and a duplicate is
--      silently SKIPPED on a fresh replay rather than erroring.
--   2. APPLY it (mcp apply_migration, or `supabase db push` if the ledger is clean).
--   3. REPAIR THE LEDGER so the row carries version 20270304000000 rather than the wall-clock
--      version apply_migration mints, and delete the tool-minted twin. Full recipe, including the
--      two traps that have bitten before: supabase/migrations/README.md. This is the step everybody
--      forgets, and skipping it is what left thirteen orphan rows in the ledger by 2026-08-10.
--
--   THEN update scripts/function-grants.txt in the SAME change. The thirteen functions below move
--   from `public` to `internal` (Group A) or `authenticated` (Group B), and check:function-grants
--   will demand exactly that the moment the revokes are in the tree. Until then the ledger records
--   them as `public`, because that is what they are.
--
-- Verified against production 2026-08-17. Nothing below has been executed.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- OWN-006 — take the browser roles off thirteen SECURITY DEFINER RPCs that no browser calls.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- WHAT IS OPEN. Asked of the production catalog (azsqfeonabsbmemvddqd, 2026-08-17), not of the
-- migrations, because the migrations read correct — that is the whole ADR-959 trap. Every SECURITY
-- DEFINER function in `public` where has_function_privilege(<role>, oid, 'EXECUTE') is true:
--
--     29 for `anon`  ·  49 for `authenticated`
--
-- The Supabase advisors report the same two numbers, independently, which is the only reason the
-- count is quoted at all. Every one of those functions carries the SAME acl shape:
--
--     =X/postgres | postgres=X/postgres | anon=X/postgres | authenticated=X/postgres | service_role=X/postgres
--      ^^^^^^^^^^                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
--      Postgres' default grant to PUBLIC   Supabase's ALTER DEFAULT PRIVILEGES, as EXPLICIT
--                                          per-role grants
--
-- Two independent grants. Revoking either one alone leaves the other satisfying
-- has_function_privilege(), so a migration that revokes only from `public` — or only from the
-- roles — succeeds and locks nothing. Both halves go in ONE statement below. That is not style: it
-- is the only shape that is correct on its own under a fresh `db reset` replay, and
-- supabase/migrations/fail-open-guards.test.ts enforces it.
--
-- ── WHAT THIS FILE DOES **NOT** TOUCH, AND WHY. ────────────────────────────────────────────────
--
-- 🔴 NOT ALL 29 ARE WRONG. Fourteen of them are the public site's front door. `/discover`, the
-- marketing splash, the sitemap, `generateStaticParams`, guest RSVP and the signup funnel all run
-- as `anon` — either through lib/supabase/public.ts (a cookieless anon client, by design) or
-- through lib/supabase/server.ts on a page a signed-out visitor can reach. A revoke on any of them
-- is an outage on the homepage. Each was traced to its call site and its client BEFORE any verdict
-- was written; nothing here is revoked on a guess.
--
--   KEPT ANON — reached by a signed-out visitor, verified at the call site:
--     public_events              lib/discover.ts:158            createPublicClient()  [anon key]
--     public_event_by_slug       lib/discover.ts:166            createPublicClient()
--     public_circles             lib/discover.ts:175            createPublicClient()
--     public_circle_by_id        lib/discover.ts:183            createPublicClient()
--     public_posts               lib/discover.ts:205            createPublicClient()
--     public_member_count        lib/discover.ts:280            createPublicClient()
--     public_active_circle_count lib/discover.ts:281            createPublicClient()
--     public_organizer_events    app/discover/events/organizer/[handle]/page.tsx:73   createPublicClient()
--     public_organizer_handles   app/sitemap.ts:64              createPublicClient()  (+ generateStaticParams)
--     public_featured_posts      app/page.tsx:744-745 -> lib/page-editor/live-data.ts:67
--                                                              createClient() on `/`, which is the
--                                                              signed-out splash. THE SESSION
--                                                              CLIENT IS THE ANON CLIENT WHEN
--                                                              NOBODY IS SIGNED IN — this is the
--                                                              one that would have been missed by
--                                                              reading `createAdminClient` at the
--                                                              other call site and stopping.
--     handle_is_available        app/api/check-handle/route.ts:29   createClient(), signup flow
--     capture_guest_rsvp         app/(main)/events/guest-rsvp-actions.ts:86   createClient(),
--                                                              deliberately anon: 20270303000100
--                                                              revokes then re-grants it on purpose
--     capture_signup_lead        app/onboarding/beta/lead-actions.ts:107      createClient()
--     update_signup_lead         app/onboarding/beta/lead-actions.ts:150      createClient()
--
--   OUT OF SCOPE — not ours to revoke:
--     st_estimatedextent (3 overloads)   owned by extension `postgis`, granted by `supabase_admin`.
--                                        A migration running as `postgres` cannot revoke them and
--                                        should not try; they carry no application data.
--
-- ── WHAT IS REVOKED, AND THE CALLER EVIDENCE FOR EACH. ─────────────────────────────────────────
--
-- GROUP A — service_role only. Every caller in the tree uses createAdminClient(), which
-- authenticates as `service_role` and does not consult these grants at all. The browser grants were
-- pure attack surface: nothing in the app loses a capability.
--
--   public_calendar_feed        app/events/calendar.ics/route.ts:67,74   createAdminClient()
--                               lib/events/store.ts:408                  createAdminClient()
--   space_public_calendar_feed  app/spaces/[slug]/calendar.ics/route.ts:85,100  createAdminClient()
--   event_calendar_feed         app/events/calendar/[token]/route.ts:65-66      createAdminClient()
--                               🔴 The token IS the secret here. It is a per-member 64-hex feed
--                               key, and the route 404s on a malformed one. An anon EXECUTE grant
--                               turned that into an unauthenticated oracle: guess a token, get a
--                               member's whole event calendar, with no rate limit between you and
--                               the RPC.
--   match_help_chunks           lib/ai/help-rag.ts:59-60                 createAdminClient()
--   nodes_geo                   app/(main)/admin/qr/page.tsx:35,83       createAdminClient()
--                               Returns the lat/lng of every check-in node. The public locator map
--                               is deliberately city-centroid only (lib/discover.ts §PRIVACY,
--                               20240211000000) — this RPC hands out the real coordinates.
--   node_within_range           lib/engagement/verify.ts:43,88           createAdminClient()
--                               The proximity half of capture verification. Callable by anon, it is
--                               a free geofence oracle: binary-search a node's exact location by
--                               probing coordinates.
--   after_crew_completion_verified   trigger function, no call site.
--                               Included because it is the ONE gap between this repo and its own
--                               database. Production has it closed; no migration in this directory
--                               closes it. 20261231000000 swept trigger functions with a
--                               catalog-driven `do $$` loop, which named nothing — so a fresh
--                               `db reset` replay re-opens it, and `pnpm check:function-grants`
--                               reports it as the single function whose prod state the repo cannot
--                               reproduce. Same class as 20270224000100, same fix: name it.
--
-- GROUP B — signed-in only. `authenticated` KEEPS its grant; only `anon` loses one. Each of these
-- is SECURITY DEFINER keyed on auth.uid(), called through lib/supabase/server.ts on a page inside
-- the authed shell. For an anonymous caller auth.uid() is null, so they already return nothing —
-- and every call site already collapses an error to the same empty value, so the revoke is not
-- observable in the UI:
--
--   my_orbit               lib/connections/resonance.ts:31    `if (error || !Array.isArray(data)) return []`
--   near_misses            lib/connections/resonance.ts:63    same
--   relationship_timeline  lib/connections/timeline.ts:18     same
--   welcome_targets        lib/connections/welcomes.ts:30     same
--   your_impact            lib/connections/metrics.ts:20      `return null`
--   ensure_calendar_token  components/events/calendar-subscribe.tsx:14   `return null`
--
--   ⚠️ ensure_calendar_token is a WRITE (get-or-create of a per-member feed token). Granting anon
--   EXECUTE on a definer function that inserts is the shape that produced ADR-961's welcome mat;
--   it survives here only because auth.uid() is null makes the row lookup empty.
--
-- REVERSIBLE, per function: `grant execute on function public.<name>(<args>) to anon, authenticated;`
-- ADDITIVE + IDEMPOTENT: no body, table, policy or trigger is touched, and re-revoking a privilege
-- that is already gone is a no-op, so a replay costs nothing.
--
-- NOT changed here, deliberately: no function BODY is rewritten. An internal `auth.role()` guard
-- would be good defence in depth, but it means reproducing bodies this file does not read, and
-- 20270221000100 records a first attempt at exactly that failing on a return type. The grant is the
-- wall; tightening the bodies is a separate, sighted change.

-- ── GROUP A: service_role only ────────────────────────────────────────────────────────────────
revoke execute on function public.public_calendar_feed() from public, anon, authenticated;
revoke execute on function public.space_public_calendar_feed(uuid) from public, anon, authenticated;
revoke execute on function public.event_calendar_feed(text) from public, anon, authenticated;
revoke execute on function public.match_help_chunks(vector, integer, double precision) from public, anon, authenticated;
revoke execute on function public.nodes_geo() from public, anon, authenticated;
revoke execute on function public.node_within_range(uuid, double precision, double precision) from public, anon, authenticated;
revoke execute on function public.after_crew_completion_verified() from public, anon, authenticated;

-- Re-grant deliberately and narrowly, so the file states the intended end state rather than
-- relying on service_role's existing grant surviving the revoke above.
grant execute on function public.public_calendar_feed() to service_role;
grant execute on function public.space_public_calendar_feed(uuid) to service_role;
grant execute on function public.event_calendar_feed(text) to service_role;
grant execute on function public.match_help_chunks(vector, integer, double precision) to service_role;
grant execute on function public.nodes_geo() to service_role;
grant execute on function public.node_within_range(uuid, double precision, double precision) to service_role;
grant execute on function public.after_crew_completion_verified() to service_role;

-- ── GROUP B: signed-in only — anon loses EXECUTE, authenticated keeps it ──────────────────────
--
-- `from public, anon` removes BOTH paths for anon: Postgres' PUBLIC grant and Supabase's explicit
-- anon grant. `authenticated` keeps its own explicit per-role grant, and the re-grant below states
-- that so the file is correct standalone under a replay. Same shape as 20270221000200's treatment
-- of search_handles_public.
revoke execute on function public.my_orbit(integer) from public, anon;
revoke execute on function public.near_misses(integer) from public, anon;
revoke execute on function public.relationship_timeline(uuid, integer) from public, anon;
revoke execute on function public.welcome_targets(integer, integer) from public, anon;
revoke execute on function public.your_impact() from public, anon;
revoke execute on function public.ensure_calendar_token() from public, anon;

grant execute on function public.my_orbit(integer) to authenticated, service_role;
grant execute on function public.near_misses(integer) to authenticated, service_role;
grant execute on function public.relationship_timeline(uuid, integer) to authenticated, service_role;
grant execute on function public.welcome_targets(integer, integer) to authenticated, service_role;
grant execute on function public.your_impact() to authenticated, service_role;
grant execute on function public.ensure_calendar_token() to authenticated, service_role;

-- ── VERIFY AFTER APPLYING (never from this file — ask the catalog) ────────────────────────────
--
--   select p.proname,
--          has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname in (
--     'public_calendar_feed','space_public_calendar_feed','event_calendar_feed','match_help_chunks',
--     'nodes_geo','node_within_range','after_crew_completion_verified','my_orbit','near_misses',
--     'relationship_timeline','welcome_targets','your_impact','ensure_calendar_token')
--   order by 1;
--
-- Expected: GROUP A all false/false, GROUP B all false/true.
--
-- The schema-wide counts should fall  anon 29 -> 17  and  authenticated 49 -> 43. Twelve of the
-- thirteen functions below move the anon number (after_crew_completion_verified is already closed
-- in prod and is here for replay reproducibility), and six move the authenticated one. The residual
-- 17 is the fourteen deliberate anon entry points listed above plus the three `st_estimatedextent`
-- overloads that belong to PostGIS. If a number does not move, the revoke did not remove what you
-- think it removed — that is the finding, not a rounding error.
