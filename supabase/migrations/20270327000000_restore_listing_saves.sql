-- ⚠️ RECONSTRUCTED FROM LIVE STATE, 2026-08-25. This file was NOT the source of the apply.
--
-- The ledger row `20270327000000 restore_listing_saves` appeared in production between 04:00 and
-- 04:14 UTC on 2026-08-25, applied from OUTSIDE the session that was running the merge queue, and
-- no file for it existed in this directory or on any of the 20 most recently pushed branches. That
-- is `ledgerOnly` drift, and `scripts/maintenance/ledger-parity.mjs` computes
-- `inParity = repoOnly.length === 0 && ledgerOnly.length === 0 && nameMismatches.length === 0`,
-- so ONE orphan row turned `check:migrations` red on every open branch at once.
--
-- The repair direction was chosen from the live catalog, not from the row: `public.listing_saves`
-- genuinely EXISTS, so deleting the ledger row would have been the lie in the other direction — a
-- fresh `db reset` replay would then not create a table production has. The repo file is what was
-- missing, so the repo file is what this adds. Per README.md's rule: never delete a ledger row
-- without first checking for a repo file at that version.
--
-- ── PROVENANCE, so the next reader does not have to re-derive it
--
-- `listing_saves` is not new. It was created by 20260815000100_listings_core_housing.sql (§ the
-- saves table + its `listing_saves_self` policy), given its FK covering index by
-- 20260820000000_fk_covering_indexes.sql, and then DROPPED by
-- 20260925000000_retire_orphaned_tables_and_functions.sql as an orphaned table — no reader, no
-- writer. Something restored it. This file records that restoration; it does not endorse it.
--
-- 🔴 WHAT IS NOT ESTABLISHED HERE: WHY. The apply had no accompanying branch, ADR or backlog row,
-- so the intent behind un-retiring a table that was deliberately retired is unknown to this file.
-- If the restore was deliberate — the housing/listings work is live in #2283 — it wants an ADR and
-- a row saying which reader needs it, and 20260925000000's retirement claim needs amending, since
-- that migration's premise ("orphaned") is now contradicted by production. If the restore was
-- accidental, the correction is a new, higher-versioned migration that drops it again, NEVER an
-- edit to this file: it describes an apply that already happened.
--
-- ── FIDELITY: every line below was read off the live catalog on 2026-08-25, not recalled
--
--   columns     profile_id uuid not null · listing_id uuid not null · created_at timestamptz not
--               null default now()
--   constraints PRIMARY KEY (profile_id, listing_id)
--               FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
--               FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
--   indexes     listing_saves_pkey (unique, the PK) · listing_saves_listing_id_idx (listing_id)
--   rls         enabled · one policy, `listing_saves_self`, FOR ALL,
--               using + with check (profile_id = private.get_my_profile_id())
--   rows        0
--
-- The shape is IDENTICAL to the original 20260815000100 definition plus 20260820000000's index, so
-- the restore was faithful rather than a redesign. Written `if not exists` / idempotent throughout:
-- against production it is a no-op (that is the point — production already has it), and on a fresh
-- replay it builds the table the ledger says exists.

create table if not exists public.listing_saves (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, listing_id)
);

-- The FK covering index 20260820000000 established for this table.
create index if not exists listing_saves_listing_id_idx on public.listing_saves (listing_id);

alter table public.listing_saves enable row level security;

-- A save is private to the member who made it: one policy, all verbs, both directions.
do $$ begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'listing_saves' and policyname = 'listing_saves_self'
  ) then
    create policy listing_saves_self on public.listing_saves
      for all
      using (profile_id = private.get_my_profile_id())
      with check (profile_id = private.get_my_profile_id());
  end if;
end $$;
