-- ============================================================================
-- STUDIO DRAFT: the author's unfinished Spark answers, staged server-side
-- (ADR-1001 in docs/DECISIONS.md, ADR-991 phase 2).
--
-- Spark autosave (ADR-991) keeps what an author types in `localStorage`, which makes typing
-- instant and survives a crash or a refresh with zero latency. What it cannot do is follow the
-- AUTHOR. Someone who starts a Journey on their laptop at lunch and opens the same Spark on
-- their phone that evening is offered nothing, because the draft was stranded in one browser.
--
-- ONE table, service-role only:
--   studio_draft - one row per (profile_id, scope): the answers that author has typed into that
--   Spark, the step they were on, and when it was last written.
--
-- WHY THIS DOES NOT BREAK DEFERRED CREATION. Journey, Practice and Circle all forbid a row
-- existing before the author commits a reviewed title. That rule is about the ENTITY's own
-- table: no half-baked Journey in the library, in the author's list, or in search. It says
-- nothing about a STAGING table, and this codebase already stages wizard state server-side three
-- times before any entity exists: `business_intake`, `event_intake` (20270222000000), and
-- `studio_steer` (20270223000000). This is the fourth, and the reason it is safe is structural:
-- there is NO entity id here and no foreign key to one. Nothing in this table can be listed,
-- searched, or mistaken for a Journey, because it is not one. It is text the author has not
-- committed yet.
--
-- KEYED (profile_id, scope), and both halves are load-bearing:
--
--   • PROFILE_ID, because that is the whole point of the feature. The draft belongs to the
--     AUTHOR, not to a machine, so the key that carries it across devices is the author. It is
--     also the entire access control: a read filtered to the session's own profile id can only
--     ever return what that same person wrote, exactly as `studio_steer` does.
--
--   • SCOPE, because there is no entity id yet and there never will be one before the commit.
--     The scope is the Spark's own route-derived key (`draftScope`, e.g. `journeys-new.new-
--     journey`) - free text, entity-BLIND by construction. The Studio kit never learns that
--     "New Journey" is a Journey; it only knows this Spark is a different Spark from that one.
--     A new wizard therefore inherits cross-device drafts with no migration and no type change.
--
-- The column is `answers`, not `values`: VALUES is a reserved word in Postgres.
--
-- ACCESS MODEL (mirrors business_intake / event_intake / studio_steer): SERVICE-ROLE ONLY. RLS
-- is ENABLED with NO client policies, so the ONLY access path is the gated server code
-- (lib/studio/draft-store.ts via the admin client, reached through lib/studio/draft-actions.ts,
-- which resolves the profile id from the SESSION and never from the client). The default grants
-- are revoked too (ADR-964): a grant held back only by RLS is one policy mistake away from being
-- live. The deliberate service-role-only posture is recorded in scripts/rls-deny-all.txt, and
-- the `internal` verdict in scripts/table-grants.txt.
--
-- WHY SERVICE-ROLE ONLY RATHER THAN A MEMBER-READ POLICY. This is unfinished writing, which is
-- more sensitive than most finished writing. Holding it behind one audited server file is a
-- smaller surface than a policy plus the browser grants a policy would need, and it costs the
-- member nothing: the read they actually want (see my drafts, erase my drafts) is served by that
-- same file, owner-scoped, and rendered on /drafts.
--
-- RETENTION. Seven days, the same window as the local copy, enforced two ways: the nightly
-- retention cron deletes rows past the window (lib/consent/retention.ts, purgeExpiredStudioDrafts),
-- and every read filters on the window as well, so a draft is never OFFERED past seven days even
-- if a sweep is late. `studio_draft_updated_idx` exists for that sweep.
--
-- ERASURE. Two paths, matching the `ai_member_context` posture (docs/AI-VERA.md section 5:
-- member-readable, one-click erasable):
--   1. The member sees and erases their own staged drafts on /drafts, the ONE surface that lists
--      everything they have started and not finished (proposals and wizard drafts alike).
--   2. Account deletion removes them with no extra code: `profile_id` cascades from
--      public.profiles, which is itself cascaded from the auth user that lib/account.ts deletes.
-- The rows are also included in the member data export (lib/privacy/export.ts).
--
-- House style (matches event_intake / studio_steer): PURELY ADDITIVE + idempotent. It creates one
-- new table, one index, and its RLS. It ALTERs and DROPs nothing, so applying it cannot disturb
-- anything already running. lib/database.types.ts is regenerated separately and the store reaches
-- this table through the untyped admin handle until then (ADR-246). SAFE to re-run. No em or en
-- dashes in any copy here.
--
-- ROLLBACK (manual, if ever needed):
--   drop table if exists public.studio_draft;
-- ============================================================================

create table if not exists public.studio_draft (
  -- Whose draft this is. The FK is what makes account deletion erase it for free, and the id is
  -- always session-derived on the way in, never client-supplied.
  profile_id  uuid not null references public.profiles(id) on delete cascade,

  -- The Spark's own key (components/studio/spark/draft/draft-store.ts, `draftScope`). Free text
  -- so a newly composed Spark needs no migration; bounded in code.
  scope       text not null,

  -- The stored shape's version (DRAFT_VERSION). A row at any other version is ignored on read
  -- rather than migrated, which is the same rule the local copy follows.
  version     int not null default 1,

  -- Where to go back to, and what to call it in a list. The `scope` above is a slug and cannot be
  -- reversed into a path (both "/journeys/new" and "journeys-new" slug to the same thing), so the
  -- one surface that shows a member their unfinished work (/drafts) needs these two said plainly.
  -- Both come from the shell, not from a wizard: `route` is the pathname, `label` is the eyebrow
  -- ("New Journey"). The kit still never INTERPRETS either one, so it stays entity-blind.
  route       text,
  label       text,

  -- The step the author was on. Recorded so the resume offer can say something true about where
  -- they were; the wizard still owns its own step machine and nobody is jumped forward.
  step        int not null default 1,

  -- The answers, as { fieldKey: value }. Only DRAFTABLE fields ever reach here: passwords,
  -- payment autocomplete, file inputs and anything marked data-spark-draft="off" are refused at
  -- collection AND refused again on the way in (lib/studio/draft-store.ts). Size-capped in code
  -- at 20k per value / 100k per draft, the same caps the local copy uses.
  answers     jsonb not null default '{}'::jsonb,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  primary key (profile_id, scope)
);

-- The retention sweep's only read pattern: everything written before the cutoff, whoever owns it.
-- The primary key already covers profile_id, so no separate FK covering index is needed.
create index if not exists studio_draft_updated_idx
  on public.studio_draft (updated_at);

-- FAIL-CLOSED: RLS enabled, NO policies. Only the gated server code (service-role admin client,
-- lib/studio/draft-store.ts) may touch this table. Direct client access (anon or authed) is
-- denied on every row.
alter table public.studio_draft enable row level security;

-- Close the default grants too (ADR-964). RLS-on-no-policy already denies anon and authenticated
-- (neither bypasses RLS), so this changes no result today; it removes the grant that a future
-- stray policy would otherwise switch on. service_role is not revoked from, so every real caller
-- is untouched.
revoke all on table public.studio_draft from anon, authenticated;

comment on table public.studio_draft is
  'Staged Spark wizard answers, so an unfinished draft follows the AUTHOR across devices instead of being stranded in one browser (ADR-991 phase 2). One row per (profile_id, scope): scope is the Spark route key, entity-blind, because no entity exists yet and deferred creation forbids one. Local-first: localStorage stays the fast path and this is the sync layer, reconciled newest-wins with an explicit prompt when the server copy is newer. Kept seven days, matching the local TTL, swept by the retention cron and filtered on read. Service-role only, fail-closed: RLS ENABLED with NO policies, the only access path is lib/studio/draft-store.ts via the admin client. Member-readable and one-click erasable on /drafts, the single list of unfinished things; cascades away with the profile on account deletion.';
