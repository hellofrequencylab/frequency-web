-- QR campaign time windows (backlog #2). A QR campaign is a `season_challenges`
-- row (criteria type=qr_scan, ADR-094); this adds an optional run window so a hunt
-- can be "this weekend only". Nullable → existing/seeded challenges are unaffected
-- (null = always on). The engine (advanceChallenges) only advances a qr_scan
-- challenge while now() is within the window. ADDITIVE. Regenerate types after.

alter table public.season_challenges add column if not exists valid_from  timestamptz;
alter table public.season_challenges add column if not exists valid_until timestamptz;

comment on column public.season_challenges.valid_from is
  'Optional campaign start (QR campaigns, ADR-094). Null = no start bound.';
comment on column public.season_challenges.valid_until is
  'Optional campaign end (QR campaigns, ADR-094). Null = no end bound.';
