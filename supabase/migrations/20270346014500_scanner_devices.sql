-- NFC counter check-in: a Space's own scanner reads a member's card and checks them in (LIVE-1125).
-- See docs/BUILD-BACKLOG.json for status and docs/LOYALTY.md "Counter scanners" for the program and
-- the device contract; this file explains the schema, it does not track the work.
--
-- Today a check-in is the member's phone opening the Space's signed door code (/n/<id>?s=…). A
-- counter scanner (an ESP32 with a PN532 reader) turns that around: the Space's device reads the
-- member's card and POSTs /api/v1/devices/scan, and the server runs the SAME capture pipeline the
-- phone does (lib/engagement/capture.ts: verify, ledger, stamps, Zaps, hunts, CRM timeline). This
-- migration adds the two rows that make that safe and nothing else:
--   • scanner_devices: a device registered by the Space owner. It authenticates with
--     `X-Frequency-Device: <id>.<secret>`; only a SHA-256 of the secret is stored, the secret is
--     shown to the owner once. A revoked device (active = false) is refused on its next request.
--   • member_cards: an opaque card token tied to one member, minted by a device for its own Space
--     (space_id) or, later, by Frequency for every Space (space_id null). Only a SHA-256 of the
--     token is stored. uid_hash is an HMAC of the card chip's UID, bound on the first scan, so a
--     token copied onto another chip is refused.
--
-- Service role only on both tables (lib/devices does the tenancy, like the loyalty tables). No money
-- moves. No existing table changes.
--
-- Additive and idempotent. ROLLBACK:
--   drop table if exists public.member_cards;
--   drop table if exists public.scanner_devices;

begin;

create table if not exists public.scanner_devices (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 60),
  secret_hash text not null check (char_length(secret_hash) = 64),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_seen_at timestamptz
);
create index if not exists scanner_devices_space_idx on public.scanner_devices(space_id, created_at);
create index if not exists scanner_devices_created_by_idx on public.scanner_devices(created_by) where created_by is not null;
alter table public.scanner_devices enable row level security;
revoke all on table public.scanner_devices from public, anon, authenticated;
grant all on public.scanner_devices to service_role;
comment on table public.scanner_devices is 'LIVE-1125 counter scanners: a device a Space owner registered to check members in by NFC card. secret_hash is sha256(hex) of the one-time secret. Service role only; lib/devices gates every read and write.';

create table if not exists public.member_cards (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  space_id uuid references public.spaces(id) on delete cascade,
  token_hash text not null check (char_length(token_hash) = 64),
  uid_hash text check (uid_hash is null or char_length(uid_hash) = 64),
  active boolean not null default true,
  issued_by uuid references public.scanner_devices(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);
create unique index if not exists member_cards_token_idx on public.member_cards(token_hash);
create index if not exists member_cards_space_idx on public.member_cards(space_id, created_at) where space_id is not null;
create index if not exists member_cards_profile_idx on public.member_cards(profile_id);
create index if not exists member_cards_issued_by_idx on public.member_cards(issued_by) where issued_by is not null;
alter table public.member_cards enable row level security;
revoke all on table public.member_cards from public, anon, authenticated;
grant all on public.member_cards to service_role;
comment on table public.member_cards is 'LIVE-1125 counter scanners: a member''s NFC card. token_hash is sha256(hex) of the opaque token on the card; uid_hash is an HMAC of the chip UID bound on first scan. space_id null means every Space. Service role only.';

commit;
