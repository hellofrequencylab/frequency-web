-- A presentation bag for a Circle, so its header can be tuned the way an Event's and a Channel's
-- already can.
--
-- WHY. `PageHero` (components/templates/page-hero.tsx) already accepts `coverFocus` and a height,
-- and `lib/layout/cover-height.ts` is a SHARED Short/Standard/Tall ladder that events, Business
-- Space covers, and (since 20270118000000) Channels all resolve through. The render side has been
-- ready the whole time. The Circle page simply had nowhere to STORE the two values, so every
-- Circle cover (`circles.image_url`) renders as a plain center crop at whatever height the header
-- element config picks — a host has no control when the crop cuts the part of the photo that
-- matters.
--
-- Events solved this WITHOUT a new column per setting, by keeping a small `theme` jsonb bag and
-- storing `coverFocus` + `heroHeight` inside it (lib/events/cover-focus.ts, lib/events/hero-height.ts),
-- and Channels adopted the same bag (ADR-886, lib/channels/hero.ts). This gives Circles the same
-- seam rather than inventing a third convention: one bag, the same two keys, the same read/write
-- helpers shape (lib/circles/hero.ts), so a reader who knows either sibling already knows this.
--
-- A CENTERED FOCUS IS DROPPED ON WRITE, but an explicitly chosen 'standard' HEIGHT IS STORED (the
-- Channel rule, not the Event rule): the Circle page resolves its hero through the header ELEMENT
-- config (resolveHeaderElement, ADR-793), which competes for the height decision, so a dropped
-- 'standard' key would silently hand the choice back to the element. A Circle nobody has tuned
-- still keeps an empty `{}` and renders exactly as it does today — backward compatible by
-- construction.
--
-- NOT NULL DEFAULT '{}' rather than nullable: the helpers already treat a non-object as empty, but a
-- guaranteed object means a jsonb merge never has to special-case NULL, and it matches events.theme
-- and topical_channels.theme.
--
-- No RLS change. `theme` is presentation, read by the page render and written only through the
-- circle admin actions gated on circle.editSettings (the circle authority — hosts, not staff;
-- circles have hosts, unlike platform-curated Channels); no policy branches on it, so it cannot
-- make a Circle more or less visible.

alter table public.circles
  add column if not exists theme jsonb not null default '{}'::jsonb;

comment on column public.circles.theme is
  $c$Presentation bag for the Circle header, mirroring events.theme and topical_channels.theme. Keys: coverFocus (a CSS object-position for the cropped hero) and heroHeight (the shared Short/Standard/Tall ladder). A centered focus is dropped on write; an explicitly chosen 'standard' height is STORED because the header element config (ADR-793) competes for the height decision. Written only through the circle.editSettings-gated circle admin actions; no RLS policy reads it.$c$;
