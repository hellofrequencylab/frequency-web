-- DROP public.claim_tokens — ADR-907 is RETIRED UNIMPLEMENTED (OWN-037, owner decision 2026-08-24).
--
-- ⚠️ NOT YET APPLIED. Written 2026-08-24 alongside the deletion of lib/claims/tokens.ts and
-- lib/claims/tokens.test.ts. It must be pushed before this file and the ledger agree; until it is,
-- the repo carries one migration the ledger head (20270320000000) does not, which is the exact
-- divergence `pnpm check:migrations` rule 4 fails on when it has database credentials. Apply it or
-- revert this file; do not leave it. Regenerate lib/database.types.ts in the SAME push that applies
-- this — the generated `claim_tokens` block is correct until then, and hand-editing it would make
-- the types disagree with the live database rather than agree with it.
--
-- ── WHY, AND WHY "UNIMPLEMENTED" IS THE HONEST WORD ───────────────────────────────────────────
--
-- 20270130000000 created this table as the ONE claim-token system, with the instruction "use this
-- for EVERY new claim flow". A year on it has NEVER been used: 0 rows in production (measured
-- 2026-08-24), and 0 importers of lib/claims/tokens.ts anywhere outside its own test. Every live
-- claim flow still mints a PLAINTEXT token onto an entity column, exactly as it did before —
-- lib/spaces/claim.ts, lib/listing-seeder/claim.ts, lib/events/event-drafts.ts, read back by
-- app/spaces/claim, app/listings/claim and app/events/claim/[token].
--
-- The exposure ADR-907 was written to close got closed a DIFFERENT way, three migrations earlier:
--
--   20270127000000_revoke_claim_token_from_anon
--   20270128000000_revoke_event_claim_token_from_anon
--   20270129000000_revoke_listing_claim_tokens_from_anon
--
-- Those revoked the table-wide SELECT and re-granted every column except `claim_token`. Verified
-- live as of 2026-08-24 — `has_column_privilege('anon', <table>, 'claim_token', 'SELECT')` is
-- FALSE on all four of spaces, events, listings and market_listings. So the anon-readable half of
-- the premise is gone, and the table that was supposed to replace the shape never acquired a
-- caller to replace it with.
--
-- Keeping it is the drift this repo keeps paying for: a table nothing can reach still appears in
-- generated types, in the RLS allowlist, in the grants ledger, and in every schema read a person
-- does — where it reads as a live system, and where its own migration header instructs the next
-- author to build on it. Dropping it makes the schema state what is true.
--
-- 🔴 WHAT THIS DOES NOT FIX. Retiring ADR-907 does not make the plaintext problem go away; it
-- retires the unused ANSWER to it. Tokens remain plaintext AT REST on the four entity columns, so
-- anyone holding service-role or direct database access reads live claim secrets in the clear.
-- Measured 2026-08-24: 37 unredeemed tokens are live (spaces 9 of 16, events 27 of 29,
-- market_listings 1 of 1, listings 0), none of which expire. That is a DIFFERENT threat model
-- from the anonymous-browser one ADR-907 was written for, and it is still open. See ADR-1108.
--
-- ── SAFE TO DROP ──────────────────────────────────────────────────────────────────────────────
--
-- Measured live 2026-08-24: 0 rows; 0 inbound foreign keys (nothing references it); 0 view or
-- matview dependencies. Its own two outbound FKs (created_by / consumed_by → public.profiles),
-- its indexes (claim_tokens_subject_idx, claim_tokens_one_live_per_subject, and
-- idx_claim_tokens_created_by / idx_claim_tokens_consumed_by from 20270220000000) all drop with
-- the table. RLS is on with no policies and all grants revoked from anon + authenticated
-- (20270130000000), so service_role is the only role that could ever have reached it, and the
-- only service-role code that ever did is deleted in this change.
--
-- No `cascade`. There is nothing to cascade to, and a bare `drop table` is what proves it: if some
-- dependency exists that this reasoning missed, Postgres refuses and tells us its name, instead of
-- quietly removing it.
--
-- ALSO REMOVED IN THIS CHANGE (all three gates parse supabase/migrations/, not the database, so
-- they must move in the same commit as this file or they fail immediately):
--   • scripts/table-grants.txt      — the `claim_tokens` verdict (check:grants enforces a
--                                     bijection: a verdict for a dropped table FAILS).
--   • scripts/rls-deny-all.txt      — the `claim_tokens` entry (check:rls fails on a deny-all
--                                     entry naming a table that no longer exists).
--   • scripts/admin-client-baseline.txt — the `lib/claims/tokens.ts` line (that file is gone).
--
-- ── THE ROW GUARD ─────────────────────────────────────────────────────────────────────────────
--
-- The whole case for this drop is "the table is empty". That was measured against production on
-- 2026-08-24, but a migration is applied LATER than it is written, and this one is deliberately
-- not applied in the same pass. If anything writes a claim between now and apply time, the premise
-- is false and the correct behaviour is to STOP — those rows would be live capability secrets and
-- their audit trail, and a migration that destroys them silently is not acceptable at any row
-- count. So the emptiness is re-asserted here, at apply time, against the real table: a non-zero
-- count raises and aborts the transaction, leaving the table and its rows untouched.
--
-- The guard is a separate statement from the drop, rather than an `execute 'drop table'` inside the
-- block, for two reasons: the drop stays greppable as a plain statement (check:rls and check:grants
-- replay this directory with a `drop table` regex, and a drop hidden inside a string literal is a
-- drop those gates could miss), and a raise inside the same transaction aborts the whole thing, so
-- the ordering still guarantees the drop cannot run after a failed assertion.

begin;

do $$
declare
  n bigint;
begin
  -- Idempotent: already dropped (or never applied here) is success, not an error. The
  -- `drop table if exists` below is then a no-op, so re-running this file is always safe.
  if to_regclass('public.claim_tokens') is null then
    raise notice 'public.claim_tokens does not exist — nothing to assert, nothing to drop.';
    return;
  end if;

  execute 'select count(*) from public.claim_tokens' into n;

  if n > 0 then
    raise exception
      'ABORTING: public.claim_tokens holds % row(s), but this migration exists only because it is empty (0 rows measured 2026-08-24). Those rows are live claim secrets and their audit trail, and this migration will not destroy them. Do NOT drop this table and do NOT delete this guard. Re-open ADR-907 instead: something began using the hashed claim-token system after it was retired, which is the documented trigger for reversing this decision.',
      n;
  end if;

  raise notice 'public.claim_tokens confirmed empty (0 rows) — proceeding with the drop.';
end $$;

drop table if exists public.claim_tokens;

-- ── CORRECT THE TWO COLUMN COMMENTS THAT POINT AT THE DROPPED TABLE ───────────────────────────
--
-- 20270129000000 ended the `listings` and `market_listings` comments with "New claim flows must use
-- the claim_tokens table (ADR-907), not a column here." That sentence is now false, and it is the
-- single most load-bearing sentence in the comment: it is the instruction the next author reads
-- when they add a fifth claimable entity. Left alone it sends them to a table that does not exist.
--
-- The applied migration file is NOT edited — it is history, and the repo⇄ledger bijection (ADR-963)
-- depends on an applied file reproducing what production ran. The comment is corrected forward,
-- here, which is the same reason this is a new migration rather than a patch to 20270129000000.
--
-- Everything else in both comments is preserved VERBATIM: the service_role-only verdict, the
-- silent-no-op warning, and the "a NEW public column needs its own explicit grant" rule are all
-- still true and still the reason the exposure is closed. Only the final sentence changes.
-- `spaces` and `events` do not name claim_tokens, so their comments are left untouched.

comment on column public.listings.claim_token is
  'One-time url-safe claim secret for a seeded (Frequency-owned) housing listing. service_role ONLY: 20270129000000 revoked the table-wide SELECT and re-granted every column except this one, because listings is anon-readable at the ROW level and RLS cannot hide a column. A NEW public column needs its own explicit grant. 🔴 PLAINTEXT AT REST and it never expires: anyone with service-role or direct database access reads a live grant of ownership. ADR-907''s hashed claim_tokens table was retired UNIMPLEMENTED and dropped (ADR-1108, 2026-08-24), so a column is the only mechanism today - do NOT add a fifth one without re-opening ADR-1108. See docs/CLAIM-LINKS.md.';

comment on column public.market_listings.claim_token is
  'One-time url-safe claim secret for a seeded (Frequency-owned) listing. service_role ONLY: 20270129000000 revoked the table-wide SELECT and re-granted every column except this one, because market_listings is anon-readable at the ROW level and RLS cannot hide a column (a column-level revoke against a table-level grant is a silent no-op). A NEW public column needs its own explicit grant. 🔴 PLAINTEXT AT REST and it never expires: anyone with service-role or direct database access reads a live grant of ownership. ADR-907''s hashed claim_tokens table was retired UNIMPLEMENTED and dropped (ADR-1108, 2026-08-24), so a column is the only mechanism today - do NOT add a fifth one without re-opening ADR-1108. See docs/CLAIM-LINKS.md.';

commit;
