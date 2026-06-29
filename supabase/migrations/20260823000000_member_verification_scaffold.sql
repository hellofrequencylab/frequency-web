-- Resonance Feed Phase 4 (ADR-418 - docs/RESONANCE-FEED-ARCHITECTURE.md §6). The member-level
-- VERIFICATION baseline + the meetup-safety acknowledgment. The cardinal product idea (owner): people
-- meet at a real circle or public event, and we make staying safe easy. The verification METHOD (how a
-- member actually becomes verified - phone / ID / vouch) is a deliberate product decision deferred to a
-- later phase; this migration RESERVES the columns so the verified badge + the safety surfaces have a
-- home the day a flow ships. Nothing sets verified_at yet, so no badge appears until then.
--
-- House style: additive + idempotent; columns reached untyped until lib/database.types.ts regenerates
-- (ADR-246). No em or en dashes. No data backfill, no behavior change on existing rows.

-- When the member completed verification (null = not verified). The badge reads this.
alter table public.profiles add column if not exists verified_at timestamptz;

-- How they verified (RESERVED: 'phone' | 'id' | 'vouch' | 'email'; null today). The flow that sets
-- these is a future phase; the column exists so the surfaces can show the method when it lands.
alter table public.profiles add column if not exists verification_method text;

-- When the member acknowledged the meet-safely guidance, so we show it once and don't nag. Self
-- only; written by the member's own acknowledgment action.
alter table public.profiles add column if not exists meetup_safety_ack_at timestamptz;

comment on column public.profiles.verified_at is
  'When the member completed verification (null = not verified). RESERVED baseline (ADR-418): the verification flow is a future phase; the verified badge reads this column.';
comment on column public.profiles.verification_method is
  'How the member verified (RESERVED: phone | id | vouch | email; null today). Set by the future verification flow (ADR-418).';
comment on column public.profiles.meetup_safety_ack_at is
  'When the member acknowledged the meet-safely guidance (ADR-418), so it shows once. Self-written.';

-- Rollback: alter table public.profiles
--   drop column if exists verified_at,
--   drop column if exists verification_method,
--   drop column if exists meetup_safety_ack_at;
