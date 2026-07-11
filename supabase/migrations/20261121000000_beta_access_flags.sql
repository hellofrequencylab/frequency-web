-- BETA ACCESS FLAGS — the data rows behind the beta-access foundation.
--
-- WRITE ONLY: this file is committed for the record but NOT applied by this change. Apply it via the
-- team's migration process (docs/WORKFLOW.md), never by hand. Every default here PRESERVES today's
-- behavior so nothing changes until an operator flips a flag.
--
-- `beta_invite_only` (platform_flags, boolean): the invite gate master switch. DEFAULT FALSE = today's
-- OPEN signup (anyone can create an account). When an operator flips it TRUE, the passwordless signup
-- path (app/sign-in/actions.ts + app/auth/callback/route.ts) only lets an ADMITTED beta contact
-- (contacts.source='beta_waitlist' with meta.beta_status='invited') or an already-existing member/staff
-- create an account; a non-admitted new email bounces to /beta. Existing members are NEVER blocked.
-- Read fail-safe FALSE (a DB hiccup keeps signup open) via lib/platform-flags.ts betaInviteOnly().
INSERT INTO platform_flags (key, value)
VALUES ('beta_invite_only', false)
ON CONFLICT (key) DO NOTHING;

-- `beta_ends_at` (the metered clock → Sept 1): a TIMESTAMP, not a boolean, so it lives in the TEXT
-- store platform_settings (platform_flags.value is boolean-only), read via lib/platform-flags.ts
-- betaEndsAt(). DEFAULT UNSET (no row) = no countdown banner. An operator sets it to an ISO timestamp
-- (e.g. '2026-09-01T00:00:00Z') to light the "Summer of Frequency ends Sept 1" banner. Left unset here
-- on purpose so nothing renders until an operator opts in. To set it:
--   INSERT INTO platform_settings (key, value) VALUES ('beta_ends_at', '2026-09-01T00:00:00Z')
--     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
