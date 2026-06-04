-- QR platform, Phase 4: campaign challenges (scavenger hunts) on the EXISTING
-- gamification engine (ADR-094). A QR campaign is a `season_challenges` row with
-- criteria {"type":"qr_scan"} + target N; this join scopes it to a specific set of
-- managed codes, so "scan any N of THESE codes" can be evaluated. Progress,
-- completion, zap/gem rewards, and the /crew/challenges surface are all reused.
--
-- The engine emits a `qr_scan` gamification event (once per code+member) from the
-- /q resolver; advanceChallenges() increments a challenge only when the scanned
-- code is in its set (this table). ADDITIVE. After applying, regenerate types.

create table if not exists public.challenge_qr_codes (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.season_challenges(id) on delete cascade,
  qr_code_id   uuid not null references public.qr_codes(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (challenge_id, qr_code_id)
);
create index if not exists challenge_qr_codes_challenge_idx on public.challenge_qr_codes (challenge_id);
create index if not exists challenge_qr_codes_code_idx on public.challenge_qr_codes (qr_code_id);

alter table public.challenge_qr_codes enable row level security;
-- Service-role only (admin-mediated), like nodes/qr_codes — no client policies.

comment on table public.challenge_qr_codes is
  'Scopes a season_challenges row (criteria type=qr_scan) to the set of qr_codes whose scans count toward it — QR scavenger hunts / campaigns. See ADR-094.';
