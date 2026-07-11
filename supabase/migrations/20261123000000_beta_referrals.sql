-- ============================================================================
-- BETA REFERRAL + CIRCLE-STARTER CONTEST (Beta phase P3 "Replication").
-- The tracking table behind the member-facing referral hub + the leaderboard:
-- one row per ACTIVATED referral (a person a member brought in who then took a
-- real first action). Circle-starter milestones are tracked on the existing
-- reward_grants ledger (rule_key beta_contest.circle_start:<id>), so the ONLY new
-- table here is beta_referrals.
-- ============================================================================
--
-- GOVERNING RULES (owner directive):
--   1. ONLY ACTIVATED invites count. A row is written when the invited member hits
--      a real activation signal (joined a Circle / adopted or logged a Practice /
--      RSVP'd) - never at signup - so dead / self / farmed signups never score.
--      This mirrors lib/qr/referral.releaseReferralReward's ACTIVATION_EVENTS gate.
--   2. DEDUPE PER INVITEE. invitee_profile_id is UNIQUE, so a person can be counted
--      for exactly one referrer, exactly once. That is the anti-gaming lock.
--   3. INERT UNTIL LIVE. The whole contest is gated behind
--      platform_flags.beta_referral_contest (default FALSE). Prizes are recorded
--      only at graduation (lib/beta/referral-contest.awardReferralWinners); no paid
--      membership time is granted before billing goes live.
--
-- ACCESS MODEL: SERVICE-ROLE ONLY (mirrors the beta_* spine + business_intake /
-- campaigns). RLS ENABLED with NO client policies, so the ONLY access path is the
-- gated server code (lib/beta/referral-contest.ts, the service-role admin client)
-- behind app-layer authz (the hub reads via the admin client; the leaderboard is
-- aggregated server-side). RLS-on-no-policy denies all direct anon/authed access
-- (fail-closed) and is recorded in scripts/rls-deny-all.txt.
--
-- House style (matches 20261117000000_beta_command_center.sql): additive +
-- idempotent, SAFE to re-run. Applied to production separately (do NOT apply from a
-- worktree); lib/database.types.ts is regenerated separately and the seam reaches
-- this table with untyped casts until then (ADR-246). No em or en dashes in copy.
-- ============================================================================

-- ── beta_referrals: one row per ACTIVATED referral. Written by
--    recordReferralActivation() once the invited member takes a real first action.
--    invitee_profile_id is UNIQUE (dedupe + one referrer per invitee). ──
create table if not exists public.beta_referrals (
  id                   uuid primary key default gen_random_uuid(),
  referrer_profile_id  uuid not null references public.profiles(id) on delete cascade,
  invitee_profile_id   uuid not null references public.profiles(id) on delete cascade,

  -- When the invitee activated (the moment this row is written). A row only ever
  -- exists for an activated referral, so this is non-null by construction.
  activated_at         timestamptz not null default now(),

  -- Where the activation credit came from (the activation signal that fired, e.g.
  -- 'circle.joined' / 'practice.adopted' / 'practice.verified'), for the audit trail.
  source               text not null default '',

  created_at           timestamptz not null default now()
);

-- One referrer per invitee, counted exactly once (the anti-gaming dedupe lock).
create unique index if not exists beta_referrals_invitee_uidx
  on public.beta_referrals (invitee_profile_id);

-- Leaderboard + member-hub reads group by referrer.
create index if not exists beta_referrals_referrer_idx
  on public.beta_referrals (referrer_profile_id, activated_at desc);

-- A referrer can never be their own invitee (belt-and-suspenders; the code already
-- refuses a self-referral before it writes).
alter table public.beta_referrals
  drop constraint if exists beta_referrals_no_self;
alter table public.beta_referrals
  add constraint beta_referrals_no_self
  check (referrer_profile_id <> invitee_profile_id);

-- ── FAIL-CLOSED RLS: enabled, NO policies. Service-role (admin client) only. ──
alter table public.beta_referrals enable row level security;

comment on table public.beta_referrals is
  'Beta referral + Circle-starter contest (phase P3): one row per ACTIVATED referral (written only when the invited member takes a real first action; never at signup). invitee_profile_id is UNIQUE (dedupe / one referrer per invitee). Service-role only (RLS enabled, no policies); read/written via lib/beta/referral-contest.ts behind the platform_flags.beta_referral_contest gate.';

-- ── The contest master switch. Default FALSE: the whole contest ships INERT and
--    an operator flips this on at /admin when phase P3 begins. Idempotent. ──
insert into public.platform_flags (key, value)
values ('beta_referral_contest', false)
on conflict (key) do nothing;
