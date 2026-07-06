-- PER-SPACE CONTACT AT-RISK / CHURN SIGNAL (ADR-560, docs/NEXT-GEN-CRM.md "the win-back gap").
--
-- THE GAP: the platform already scores at-risk in three OTHER places — a member's practice-streak
-- `atRisk` (lib/practice-streak.ts), re-activation playbook markers (lib/spaces/ai-usage.ts
-- REACTIVATION_MARKERS), and the member_engagement_scores churn_risk matview (per PROFILE, platform
-- cockpit, 20260801000000_engagement_scores.sql). What has NEVER existed is a churn / at-risk signal
-- on the SPACE CONTACT itself: a Space owner looking at their CRM board cannot see which of THEIR
-- contacts are going cold. This migration adds that signal to the contacts row and nowhere else.
--
-- THE SHAPE (lowest-risk that fits the existing model): three PERSISTED columns on public.contacts,
-- mirroring the existing `engagement_score numeric` projection column already on this table —
--   • risk_score   numeric  — a churn/at-risk score in [0, 100] (0 = healthy, 100 = cold). Default 0.
--   • at_risk      boolean  — the derived flag (risk_score >= the at-risk threshold). Default false.
--   • risk_factors jsonb    — the contributing factors the pure scorer emitted (recency, decay, etc.),
--                             so the cockpit can explain WHY a contact is flagged. Default '[]'.
-- These are a PROJECTION, exactly like engagement_score: the pure rules-based scorer
-- (lib/spaces/contact-risk.ts) is the source of truth; a future writer/cron (or ML model) persists
-- into these columns. The cockpit read (lib/spaces/crm-funnel.ts) can ALSO derive the score live from
-- the raw signals already on the row (last_seen_at / engagement_score / consent_state), so the surface
-- works BEFORE any writer lands — these columns are the durable seam, not a hard dependency.
--
-- No new table + no matview: the contacts row already carries every raw signal the v1 rules need
-- (last_seen_at, engagement_score, consent_state, updated_at), and adding nullable-defaulted columns
-- to an existing table is the lowest-migration-risk shape. A `space_contact_risk` side table or a
-- matview would duplicate the space_id/RLS surface for no v1 benefit; rejected (ADR-560 §3).
--
-- TENANCY / RLS: contacts already has RLS ENABLED with the canonical per-Space policies
-- (20260905000000_crm_rls_convergence.sql: contacts_space_read via is_space_member(space_id) or staff,
-- writes via can_write_space_content(space_id)). NEW COLUMNS INHERIT THOSE ROW POLICIES automatically
-- — RLS gates the ROW, not the column — so a Space owner reads/writes the risk of ONLY their own
-- Space's contacts, and can never see another Space's. This migration re-asserts RLS + the read policy
-- idempotently (defense-in-depth) but adds NO new policy: the row's per-Space gate already covers the
-- new columns. The cross-space contract test (test/contract/tenancy-entity-modules.test.ts) proves the
-- new cockpit read binds space_id so the service-role (RLS-bypassing) path can never leak either.
--
-- House style: additive + idempotent (safe to re-run), applied via the Supabase SQL editor. Reached
-- UNTYPED until lib/database.types.ts is regenerated (ADR-246); the reader casts. No em/en dashes.

begin;

-- ── 1. The at-risk projection columns on the contact row ─────────────────────────────────────────
alter table public.contacts
  add column if not exists risk_score   numeric not null default 0;
alter table public.contacts
  add column if not exists at_risk      boolean not null default false;
alter table public.contacts
  add column if not exists risk_factors jsonb   not null default '[]'::jsonb;

-- Keep risk_score honest at the DB edge: a projection can only ever be a churn score in [0, 100].
-- Additive + guarded so a re-run does not double-add the constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contacts_risk_score_range'
  ) then
    alter table public.contacts
      add constraint contacts_risk_score_range
      check (risk_score >= 0 and risk_score <= 100) not valid;
    -- NOT VALID: the constraint governs future writes immediately without a full-table validation
    -- scan at apply time (the default is 0, already in range, so existing rows satisfy it). A later
    -- `validate constraint` pass can promote it once the writer has been running.
  end if;
end $$;

comment on column public.contacts.risk_score is
  'Per-Space CHURN / AT-RISK score in [0,100] (ADR-560): 0 = healthy, 100 = cold. A PROJECTION like engagement_score — the pure rules-based scorer (lib/spaces/contact-risk.ts) is the source of truth; a writer/cron (or a future ML model) persists here. Space-scoped by the contact row''s RLS (contacts_space_read). Untyped until database.types regenerates (ADR-246).';
comment on column public.contacts.at_risk is
  'Derived at-risk FLAG (ADR-560): true when risk_score crosses the at-risk threshold (lib/spaces/contact-risk.ts AT_RISK_THRESHOLD). The cockpit at-risk count/list filters on this. Space-scoped by the row''s RLS.';
comment on column public.contacts.risk_factors is
  'The contributing factors the scorer emitted (ADR-560): a JSON array of {key,label,weight} so the cockpit can explain WHY a contact is flagged (recency of last contact, engagement decay, opt-out, streak-at-risk). Default []. Space-scoped by the row''s RLS.';

-- ── 2. Index the at-risk slice for the per-Space cockpit read ────────────────────────────────────
-- The cockpit asks "how many / which of THIS Space's contacts are at risk" — a (space_id, risk_score)
-- partial index over the flagged rows serves that count + list without scanning the whole contacts
-- table. space_id leads (every per-Space read filters it first), matching the house index idiom in
-- 20260713010000_crm_space_id_client_notes.sql.
create index if not exists contacts_space_at_risk_idx
  on public.contacts (space_id, risk_score desc)
  where at_risk = true;

-- ── 3. Re-assert per-Space RLS on contacts (idempotent; already converged in 20260905000000) ──────
-- RLS gates the ROW, so the new columns inherit the existing contacts_space_read / _insert / _update /
-- _delete policies with NO new policy needed. Re-asserting the enable + the read policy here documents
-- that the at-risk signal is per-Space isolated and keeps check:rls green (contacts has policies).
alter table public.contacts enable row level security;

drop policy if exists contacts_space_read on public.contacts;
create policy contacts_space_read on public.contacts
  for select using (
    public.is_space_member(space_id)
    or public.get_my_web_role() in ('admin', 'janitor')
  );

commit;
