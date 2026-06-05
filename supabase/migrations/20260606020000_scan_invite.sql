-- Scan-to-invite: scanned contacts flow into the shared CRM as UNSUBSCRIBED leads,
-- get ONE personal intro email, and credit the steward on join (ADR-099,
-- docs/NETWORK-CRM.md). Additive.
--
-- Legal posture: the intro is a single transactional introduction prompted by a
-- real-world meeting (the steward met them and saved their card). It carries a
-- working one-click unsubscribe, is gated behind an operator switch + a per-scan
-- opt-in, and NEVER auto-subscribes. Marketing only after the lead opts in
-- (contacts.consent_state='subscribed').

alter table public.network_contacts
  add column if not exists invited_at timestamptz;
comment on column public.network_contacts.invited_at is
  'When the one-time scan-intro email was enqueued (null = not invited). Guards re-sends.';

-- Operator master switch for scan-intro emails. Default OFF — nothing sends until
-- an operator flips it (mirrors ai_enabled). See /admin + lib/connections/invite.ts.
insert into public.platform_flags (key, value)
values ('scan_invite_email_enabled', false)
on conflict (key) do nothing;
