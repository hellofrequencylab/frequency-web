-- A presentation bag for a Channel, so its header can be tuned the way an Event's already can.
--
-- WHY. `PageHero` (components/templates/page-hero.tsx) already accepts `coverFocus` and a height,
-- and `lib/layout/cover-height.ts` is a SHARED Short/Standard/Tall ladder that events and Business
-- Space covers both resolve through. The render side has been ready the whole time. The Channel
-- page simply had nowhere to STORE the two values, so every Channel cover renders as a plain
-- center crop at a fixed height. That is visible today: the Meld Community Cowork cover is a wide
-- wordmark whose lower line is cropped away, and no operator control exists to move it.
--
-- Events solved this WITHOUT a new column per setting, by keeping a small `theme` jsonb bag and
-- storing `coverFocus` + `heroHeight` inside it (lib/events/cover-focus.ts, lib/events/hero-height.ts).
-- This gives Channels the same seam rather than inventing a second convention: one bag, the same two
-- keys, the same read/write helpers shape, so a reader who knows the Event side already knows this.
--
-- DEFAULTS ARE DROPPED ON WRITE (the events rule): a centered focus and the 'standard' height are
-- never persisted, so a Channel nobody has tuned keeps an empty `{}` and renders exactly as it does
-- today. Backward compatible by construction: an unset value means centered, which is the current
-- behaviour, so nothing regresses for the Channels nobody touches.
--
-- NOT NULL DEFAULT '{}' rather than nullable: the helpers already treat a non-object as empty, but a
-- guaranteed object means a jsonb merge never has to special-case NULL, and it matches events.theme.
--
-- No RLS change. `theme` is presentation, read by the page render and written only by the staff-gated
-- channel actions; no policy branches on it, so it cannot make a Channel more or less visible.

alter table public.topical_channels
  add column if not exists theme jsonb not null default '{}'::jsonb;

comment on column public.topical_channels.theme is
  $c$Presentation bag for the Channel header, mirroring events.theme. Keys: coverFocus (a CSS object-position for the cropped hero) and heroHeight (the shared Short/Standard/Tall ladder). Both are dropped when they equal the default, so an untouched Channel stores {} and renders as a centered standard-height crop. Written only through the staff-gated channel admin actions; no RLS policy reads it.$c$;
