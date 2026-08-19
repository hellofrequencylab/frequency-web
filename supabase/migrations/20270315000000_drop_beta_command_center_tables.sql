-- DROP THE BETA COMMAND CENTER'S TWO TABLES
--
-- ⚠️ NOT YET APPLIED. Written 2026-08-19 alongside the deletion of the /admin/beta console and
-- the whole beta email arc; it must be pushed before this file and the ledger agree. Until it is
-- applied the repo carries one migration the ledger head does not, which is exactly the
-- divergence `pnpm check:migrations` (rule 4) fails on when it has database credentials. Apply
-- it or revert this file; do not leave it.
--
-- WHY. The beta launch is over (owner decision, 2026-08-19). The console that ran it is deleted:
-- app/(main)/admin/beta/, components/admin/beta/, and lib/beta/{phases,tasks,stats,email,
-- email-templates,launch-emails}.ts, plus the Email Studio's beta Campaign tab. These two tables
-- had NO reader outside those files, so the schema is now describing a product surface that does
-- not exist. That is the whole reason to drop them: a table nothing can reach still shows up in
-- generated types, in the RLS allowlist, and in every schema read a person does, where it reads
-- as a live feature.
--
--   1. public.beta_phases — the P0..P4 launch plan (stage, goal, status, position). Read and
--      written only by lib/beta/phases.ts (deleted) and the seeder in lib/beta/email-templates.ts
--      (deleted).
--   2. public.beta_tasks  — the per-phase task board, each row carrying an acceptance
--      ("done when..."). Read and written only by lib/beta/tasks.ts (deleted). Its phase_id FK
--      cascades from beta_phases, so it must go first or go together.
--
-- 🔴 WHAT THIS DELIBERATELY KEEPS. Three beta_* tables survive this drop, and each for its own
-- reason. Do not fold them into a later cleanup without re-reading these:
--   • public.beta_audit_log   — the APPROVAL TRAIL, and the spine that writes it is LIVE. The
--     spine moved to lib/outbound/{approvals,audit,guard,db}.ts in this same change; it keeps the
--     old table name because the table holds real rows written under it (see lib/outbound/audit.ts
--     for the full reasoning). Dropping it would destroy the answer to "who armed what, when".
--   • public.beta_host_prompts — an unrelated LIVE feed-growth feature, gated by
--     platform_flags.beta_host_prompts. It shares a name prefix and nothing else.
--   • public.beta_referrals    — the referral / Circle-starter contest, still wired into live
--     paths (lib/beta/referral-contest.ts, reached from the Circles invite flow and lib/qr).
--
-- ALSO KEPT: campaigns.phase_id. It is nullable, every campaign has one (mostly null), and rows
-- that carry a non-null value still route through assertApproved at send time. Dropping the
-- COLUMN would change send behaviour; dropping the TABLE only removes its foreign key. The
-- `cascade` below is what takes campaigns_phase_id_fkey with it, leaving the column and its data
-- intact. Same call the waitlist retirement made for beta_admission_waves (20270211000000).
--
-- ALSO REMOVE WHEN THIS IS APPLIED, in the same push:
--   • scripts/rls-deny-all.txt   — the `beta_phases` and `beta_tasks` lines. That file mirrors the
--     LIVE database (check:rls reads both), so it must not shrink before the tables do.
--   • scripts/table-grants.txt   — the `beta_phases` and `beta_tasks` rows, same reasoning
--     (check:grants).
--   • lib/database.types.ts      — regenerate after applying.
--
-- SAFE TO DROP. Both tables are RLS-on-no-policy (service-role only, 20261117000000) with all
-- grants revoked from anon + authenticated (20270218000000), so nothing outside service_role can
-- reach them today, and the only service-role code that ever did is deleted. They hold seeded
-- launch-plan copy, not member data.

begin;

-- beta_tasks first: its phase_id FK references beta_phases on delete cascade, so dropping it
-- explicitly keeps the order legible rather than relying on the cascade below to reach it.
drop table if exists public.beta_tasks;

-- `cascade` drops campaigns_phase_id_fkey (the constraint, NOT the column or its values). No
-- other object depends on this table.
drop table if exists public.beta_phases cascade;

commit;
