-- =============================================================================
-- Expressive invite (EVENTS-REWORK A1 — the Partiful magic: cover + theme).
--
-- Two additive columns so any event (Circle or standalone) can carry an
-- expressive cover image and a theme/effect, backward-compatible:
--   • cover_image_path text  — storage path (in the existing `event-media`
--                              bucket, see 20260613100000) of the cover image.
--                              NULL = no custom cover (current behaviour). Stored
--                              as a path, not a URL, mirroring events.poster_path.
--   • theme            jsonb — theme + effect config the renderer reads
--                              (e.g. {"preset":"dusk","effect":"confetti",
--                              "accent":"violet"}). DAWN tokens only — no hex —
--                              enforced at the app layer (the UI maps preset/accent
--                              to semantic tokens). Default '{}' = the plain theme.
--
-- No behaviour change for existing rows: both default to "no custom presentation".
-- =============================================================================

alter table public.events
  add column if not exists cover_image_path text,
  add column if not exists theme            jsonb not null default '{}'::jsonb;

alter table public.events drop constraint if exists events_theme_object_check;
alter table public.events add constraint events_theme_object_check
  check (jsonb_typeof(theme) = 'object');

comment on column public.events.cover_image_path is
  'Storage path (event-media bucket) of the expressive cover image; NULL = no custom cover. A path, not a URL (mirrors events.poster_path).';
comment on column public.events.theme is
  'Theme/effect config the invite renderer reads ({preset, effect, accent, ...}). DAWN semantic tokens only (no hex); the UI maps presets to tokens. Default {} = plain.';
