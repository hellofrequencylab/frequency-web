-- Entity Spaces Phase 1: the profile bio + tagline text columns on `spaces`.
-- `about` is the entity-about module body; `tagline` is the hero subtitle + directory-card
-- one-liner. Both are member/operator-facing copy (obey CONTENT-VOICE) and the home for the
-- text the per-Space Vera co-host drafts (draftSpaceBio / suggestTagline). Additive + nullable;
-- backfills nothing (existing Spaces simply have no bio yet, and the modules fall back cleanly).
alter table public.spaces
  add column if not exists about text,
  add column if not exists tagline text;

comment on column public.spaces.about is 'Long profile bio rendered by the entity-about module. Member/operator-facing copy; obeys CONTENT-VOICE. Nullable.';
comment on column public.spaces.tagline is 'Short one-line tagline for the profile hero subtitle and the directory card. Member/operator-facing copy. Nullable.';
