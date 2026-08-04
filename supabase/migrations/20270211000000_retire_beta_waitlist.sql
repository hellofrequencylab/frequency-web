-- RETIRE THE BETA WAITLIST
--
-- The Beta is OPEN (it runs to beta_ends_at = 2026-09-01). The queue mechanic that sat in
-- front of it is gone from the code in this same change: the double-opt-in capture, the
-- confirm route, the admin triage table, the admit-in-waves engine, and the invite gate on
-- account creation. This migration removes the database objects that only those surfaces
-- touched, so the schema stops describing a product that no longer exists.
--
-- WHAT THIS DROPS
--   1. platform_flags.beta_invite_only  — the master gate on NEW-account creation. It has been
--      FALSE in production for its whole life, and its two enforcement points (app/sign-in/
--      actions.ts and app/auth/callback/route.ts) were removed in this change. Nothing reads it.
--   2. public.beta_admission_waves      — the batch-admission spine (propose a wave, approve it,
--      send invites). Zero rows in production. Its ApprovableType was removed from
--      lib/beta/approvals.ts, so the approval queue now carries campaigns only.
--
-- WHAT THIS DELIBERATELY KEEPS
--   • contacts rows with source='beta_waitlist' (4 in production, all already invited and
--     subscribed). They are real people who gave real consent, and consent_state is what governs
--     mailing them. Deleting them would destroy the consent record, not honour it. They simply
--     stop being a queue and are ordinary contacts now.
--   • platform_settings.beta_ends_at    — still drives BetaCountdownBanner.
--   • platform_flags.beta_host_prompts / beta_referral_contest — unrelated surfaces.
--   • beta_phases, beta_tasks, beta_audit_log, beta_referrals, beta_host_prompts — the Beta
--     Command Center's launch-ops spine, which is not the waitlist.
--   • campaigns.approval_status / approved_by / approved_at / scheduled_for / test_sent_at /
--     phase_id — added by the beta migration but used by ALL campaigns, beta or not. Dropping
--     them would break every campaign send.

begin;

-- 1. The invite gate flag. Audited via platform_flag_events; the delete leaves that history intact.
delete from public.platform_flags where key = 'beta_invite_only';

-- 2. The admission-wave spine. campaigns.phase_id keeps its own FK to beta_phases; only the wave
--    table's FK goes with the table.
drop table if exists public.beta_admission_waves;

commit;
