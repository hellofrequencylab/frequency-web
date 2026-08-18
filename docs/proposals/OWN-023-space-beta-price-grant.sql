-- 🔴 A PROPOSAL, NOT A MIGRATION. It lives in docs/proposals/ ON PURPOSE.
--
-- A file in supabase/migrations/ is an ASSERTION THAT PRODUCTION HAS RUN IT. That is not a
-- convention, it is enforced: check:migrations rule 4 (ADR-1007) compares this repo against
-- `supabase_migrations.schema_migrations` and fails on a repo file with no ledger row, because such
-- a file replays on every fresh environment while the live database has never seen it. Until the
-- owner applies this, that assertion would be FALSE, so the file may not sit there.
--
-- WHY IT IS NOT APPLIED: this session may not write to the database, and the grant is a COMMERCIAL
-- promise — which Space pays $49 instead of $79 — so the schema goes in when the owner is ready to
-- name the Spaces it is for. The code shipped alongside it is live and correct WITHOUT the column:
-- `readSpaceBetaPriceGrant` reports `not_deployed` on Postgres 42703 rather than swallowing it, the
-- checkout's `spaceHasBetaPriceGrant` fail-safes to FALSE (list price, never under-charge), and the
-- operator panel renders the apply-this-first instruction instead of a toggle that lies.
--
-- ── TO PROMOTE IT, IN THIS ORDER. All three steps, or none. ────────────────────────────────────
--
--   1. MOVE this file to
--      supabase/migrations/20270304000100_space_beta_price_grant.sql
--      The version sorts after the applied ledger head, 20270303000100 (measured in production
--      2026-08-17), and deliberately LEAVES 20270304000000 to the other open proposal in this
--      directory (OWN-006), which already claims it. If either has landed since, take the next free
--      version instead of reusing one — check:migrations rule 1 fails a duplicate version, and a
--      duplicate is silently SKIPPED on a fresh replay rather than erroring.
--   2. APPLY it (mcp apply_migration, or `supabase db push` if the ledger is clean).
--   3. REPAIR THE LEDGER so the row carries version 20270304000100 rather than the wall-clock
--      version apply_migration mints, and delete the tool-minted twin. Full recipe, including the
--      two traps that have bitten before: supabase/migrations/README.md. This is the step everybody
--      forgets, and skipping it is what left thirteen orphan rows in the ledger by 2026-08-10.
--
--   THEN regenerate lib/database.types.ts so `spaces.beta_price_grant` is typed, and drop the
--   untyped cast in lib/billing/space-beta-grant.ts (ADR-246's standing debt, one call site).
--
-- Verified against production (azsqfeonabsbmemvddqd) 2026-08-17. Nothing below has been executed.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- OWN-023 — a PRIVATE, per-Space grant of the closed beta rate. ADR-1061.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- THE ASK (owner, 2026-08-17, hours after closing the beta window in ADR-1060): "I still have a
-- couple people that I've offered the Beta pricing to, and I want to keep that open for them. But I
-- don't want to advertise that Beta pricing as a package on the website. I just want regular
-- pricing."
--
-- WHY A COLUMN AND NOT THE WINDOW. `BETA_PRICING_ENDS_AT` (lib/pricing/beta.ts) is ONE global
-- constant read by the checkout AND by every pricing surface — that shared read is the whole design,
-- because it is what stops the page quoting a rate the checkout has stopped charging (ADR-880).
-- Re-opening it to serve two people would put $49 back on /pricing for everyone, which is the exact
-- thing the owner asked not to happen. A per-Space fact that ONLY the checkout reads is the only
-- shape that satisfies both halves of the sentence.
--
-- WHY NOT `spaces.is_comped`. That column means FREE. This means "charge them, at the older number".
-- Overloading it would make a paying customer read as a comp in every consumer of that flag.
--
-- WHY NOT A LOCK. `space_subscription_items.locked_price_id` is a RECORD of what Stripe charged, not
-- a promise about what it should charge: lib/billing/space-subscriptions.ts writes it from the
-- reconciled subscription. With the window shut, a person promised $49 checks out at $79 and their
-- lock faithfully records $79 — permanently. The grandfathering machinery works perfectly and
-- preserves the wrong number. The grant is what makes the FIRST charge right; the lock then carries
-- it for life. That ordering is why the grant carries NO EXPIRY COLUMN: it is spent by the first
-- successful checkout and never consulted again (lib/pricing/beta.ts `loadoutChargeArm`, arm 1).
--
-- ── THE THREE COLUMNS, AND WHY THREE ───────────────────────────────────────────────────────────
--
--   beta_price_grant       boolean not null default false
--       The decision itself. BOOLEAN, not a rate and not an end date. A rate column would be a
--       second source of truth for money that the Stripe catalog already holds (the founding price
--       ids are minted ACTIVE by the catalog sync, so there is a real price to charge and nothing to
--       invent). An end date would invite an expiry the design explicitly does not want.
--       NOT NULL DEFAULT FALSE so the fail-safe is in the schema, not only in the reader: a row that
--       nobody has thought about charges list.
--
--   beta_price_granted_at  timestamptz
--   beta_price_granted_by  uuid  -> profiles(id) on delete set null
--       WHO promised this, and WHEN. Not decoration. The failure this whole feature exists to close
--       (backlog OWN-022) is an obligation that lived only in the owner's memory: @ishasetlumi paid
--       $490 in cash for a rate no column recorded. A bare boolean records THAT a promise exists and
--       still loses who made it — which is half of the same failure. Nullable with no default so a
--       revoked or never-granted row carries no misleading stamp; the writer clears both on revoke,
--       so the stamps always describe the grant currently in force. `on delete set null` because
--       removing a staff profile must never revoke a customer's promised rate.
--
--   The append-only history of every flip lives in `admin_audit_log` (action `space.beta_price_grant`,
--   written by the janitor-gated action). These two columns exist so the ROW answers "who, when"
--   without a join, which is what an operator actually reads.
--
-- ── SECURITY POSTURE, MEASURED RATHER THAN ASSUMED ─────────────────────────────────────────────
--
-- READ: `spaces` grants SELECT to anon/authenticated at COLUMN level (31 of 44 columns today,
-- stated by 20270228000000). A newly added column is NOT covered by a column-level grant, so
-- beta_price_grant is invisible to both browser roles the moment it exists, with no statement
-- needed. That is the correct default for a private commercial fact, and the verify block below
-- asserts it rather than trusting it.
--
-- WRITE: `spaces` grants UPDATE at TABLE level (relacl `anon=awdDxtm`, `authenticated=awdDxtm`), so
-- the browser roles DO hold the UPDATE privilege on this column the moment it exists. What stops a
-- Space owner granting themselves $49 is ROW LEVEL SECURITY: rowsecurity is ON and `spaces` carries
-- exactly ONE policy, `spaces_read_active`, for SELECT. There is no UPDATE policy, so every browser
-- UPDATE is denied by default-deny, and every write in the app goes through the service-role admin
-- client behind `requireAdmin('janitor')`.
--
-- 🔴 A COLUMN-LEVEL REVOKE WOULD NOT HELP AND IS DELIBERATELY NOT HERE. Postgres will not revoke a
-- column privilege that is held at table level: `revoke update (beta_price_grant) on public.spaces
-- from authenticated` warns and changes nothing. Narrowing it properly means revoking table-level
-- UPDATE and re-granting 44 columns, which is a large, outage-shaped change to make on the side of
-- an unrelated feature. THE CONDITION TO WATCH, stated so it is not rediscovered later: if anyone
-- ever adds an UPDATE policy to `spaces`, this column becomes writable by whoever that policy lets
-- through, and that policy must exclude it (or the table-level grant must be narrowed first).
--
-- ADDITIVE + IDEMPOTENT. `add column if not exists` x3, one partial index, three comments. No
-- existing column, policy, trigger or row is touched, and every row starts at the current behaviour
-- (grant false = charge list = exactly what production does today).
--
-- REVERSIBLE: the down migration is at the bottom, commented, as this directory's files do.

-- ── 1. The grant, and its audit stamps ────────────────────────────────────────────────────────
alter table public.spaces
  add column if not exists beta_price_grant boolean not null default false;

alter table public.spaces
  add column if not exists beta_price_granted_at timestamptz;

alter table public.spaces
  add column if not exists beta_price_granted_by uuid references public.profiles(id) on delete set null;

comment on column public.spaces.beta_price_grant is
  'PRIVATE per-Space grant of the CLOSED beta (founding) rate, ADR-1061. TRUE = the loadout checkout resolves the FOUNDING catalog price key for this Space (Business $19, Collective $49) even though the beta window is shut and every public surface shows list. Read ONLY by lib/billing/space-plan-checkout.ts via lib/billing/space-beta-grant.ts; NO pricing surface reads it, by design (the owner asked for the rate without advertising it). NOT a comp: is_comped means free, this means charge them at the older number. NO EXPIRY: the grant is spent by the first successful checkout, after which space_subscription_items.locked_price_id re-bills that price for life and this column is never consulted again (lib/pricing/beta.ts loadoutChargeArm).';

comment on column public.spaces.beta_price_granted_at is
  'When the beta price grant currently in force was made (ADR-1061). NULL when not granted. Cleared on revoke, so it always describes the live grant rather than a historical one; the append-only history of every flip is admin_audit_log action space.beta_price_grant.';

comment on column public.spaces.beta_price_granted_by is
  'The staff profile that made the beta price grant currently in force (ADR-1061). NULL when not granted, or when the granting profile was deleted (on delete set null: removing an operator must never revoke a customer''s promised rate).';

-- ── 2. A partial index over the granted rows only ─────────────────────────────────────────────
-- "Which Spaces are we holding to the beta rate?" is the question the owner asks of this column, and
-- it is asked of a handful of rows in a table of thousands. Partial (WHERE beta_price_grant) so the
-- index holds only the grants and costs nothing on the 99.9% that carry the default.
create index if not exists spaces_beta_price_grant_idx
  on public.spaces (id)
  where beta_price_grant;

-- ── VERIFY AFTER APPLYING (never from this file — ask the catalog) ────────────────────────────
--
--   -- a. The columns exist, with the fail-safe default.
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'spaces'
--      and column_name like 'beta_price_%'
--    order by 1;
--   -- Expected: beta_price_grant | boolean | NO | false
--   --           beta_price_granted_at | timestamp with time zone | YES | (null)
--   --           beta_price_granted_by | uuid | YES | (null)
--
--   -- b. NO browser role can READ it (the column-level SELECT grant does not extend to it).
--   select has_column_privilege('anon', 'public.spaces', 'beta_price_grant', 'SELECT')          as anon_read,
--          has_column_privilege('authenticated', 'public.spaces', 'beta_price_grant', 'SELECT') as authed_read,
--          has_column_privilege('service_role', 'public.spaces', 'beta_price_grant', 'SELECT')  as service_read;
--   -- Expected: false | false | true.  If either browser value is TRUE, someone has since granted
--   -- SELECT on the whole table and this column went along with it. That is the finding.
--
--   -- c. Writes are still closed at the ROW level (the only thing standing between a Space owner
--   --    and a self-granted $49 — see the security note above).
--   select polname, polcmd from pg_policy where polrelid = 'public.spaces'::regclass order by 1;
--   -- Expected: exactly one row, spaces_read_active / r. ANY policy with polcmd 'w' or '*' means
--   -- this column is writable from the browser and must be excluded from it.
--
--   -- d. Nobody is granted yet (this migration grants nothing; it only makes granting possible).
--   select count(*) from public.spaces where beta_price_grant;
--   -- Expected: 0.
--
-- ── TO GRANT A NAMED SPACE, AFTER APPLYING ────────────────────────────────────────────────────
--
-- Use the operator UI: /admin/spaces/<space id> -> "Beta price grant" -> Grant the beta rate. It is
-- janitor-gated, it stamps who and when, and it writes admin_audit_log. Reach for SQL only if the
-- UI is unavailable:
--
--   update public.spaces
--      set beta_price_grant = true,
--          beta_price_granted_at = now(),
--          beta_price_granted_by = (select id from public.profiles where handle = '<staff handle>')
--    where slug = '<space slug>';
--
-- ── DOWN (reversible) ─────────────────────────────────────────────────────────────────────────
--
--   drop index if exists public.spaces_beta_price_grant_idx;
--   alter table public.spaces drop column if exists beta_price_granted_by;
--   alter table public.spaces drop column if exists beta_price_granted_at;
--   alter table public.spaces drop column if exists beta_price_grant;
--
-- Dropping it is SAFE for the code: every reader fail-safes to "no grant" on 42703, which is the
-- pre-ADR-1061 behaviour (charge list). It is NOT safe for the business — a Space that was granted
-- and has not yet checked out silently goes back to list — so read `select slug from public.spaces
-- where beta_price_grant` first and honour whatever it returns some other way.
