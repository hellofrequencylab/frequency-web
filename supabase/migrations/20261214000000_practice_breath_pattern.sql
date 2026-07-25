-- Creator-authored breath pattern (PRACTICE-TIMER-CONTINUITY P4, owner go-ahead 2026-07-25). A Be
-- Still practice whose flavour is Breathe can now SHIP its pattern (a Box-breathing practice opens on
-- Box), instead of always falling back to the member's personal pattern pref. Nullable/additive:
-- NULL = today's behavior (the member's saved pattern, then the default). The slug is validated in
-- app code against BREATH_PATTERNS (lib/on-air.ts, patternBySlug fail-safe) rather than a CHECK, so
-- adding a new pattern never needs a migration. Bell / ambient / interval stay MEMBER comfort prefs
-- (deliberate: a creator preset should define the practice, not override the member's sound comfort).

alter table public.practices
  add column if not exists breath_pattern text;

comment on column public.practices.breath_pattern is
  'Creator-authored breath pattern slug for a Breathe practice (BREATH_PATTERNS in lib/on-air.ts; e.g. box, cohere). NULL = the member''s own pattern pref. Only meaningful when timer_kind=mindless; cleared when the kind switches away.';
