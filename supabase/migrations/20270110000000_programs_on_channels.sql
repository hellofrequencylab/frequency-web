-- =====================================================================
-- Programs live on Channels (ADR-864).
--
-- A Channel broadens from "the topical forum" to a FOCUS AREA: it hosts
-- circles (circles.topical_channel_id, already live), carries a feed, and —
-- when it holds a blueprint — runs as a PROGRAM others can start a CHAPTER of.
--
--   Program  = a topical_channel with template_id set (the franchise blueprint).
--   Chapter  = a circle in that channel (topical_channel_id), typically born
--              from the blueprint via the existing Remix flow.
--   Owner    = owner_space_id: NULL means Frequency-run (staff-operated);
--              set means a Space (Collective business member) runs it.
--
-- No new hierarchy table: discovery reuses circles.topical_channel_id +
-- coordinates; the blueprint reuses circle_templates + remixTemplate. The only
-- schema change is three nullable columns + partial indexes.
-- =====================================================================

alter table public.topical_channels
  add column if not exists owner_space_id uuid references public.spaces(id) on delete set null,
  add column if not exists template_id uuid references public.circle_templates(id) on delete set null;

comment on column public.topical_channels.owner_space_id is
  'The Space that runs this channel as a Program. NULL = platform-curated (Frequency-run).';
comment on column public.topical_channels.template_id is
  'The Chapter blueprint (circle_templates row). Set = this channel is a Program: members can start a Chapter from it.';

-- A Space''s programs are looked up by owner; most channels have none, so partial.
create index if not exists topical_channels_owner_space_idx
  on public.topical_channels (owner_space_id) where owner_space_id is not null;

-- Program blueprints are owned by the Space that authored them. NULL keeps the
-- existing staff-authored Starter Circle catalog exactly as it is; every
-- catalog read now filters owner_space_id IS NULL so a program blueprint never
-- appears in the global Starter Circles rail.
alter table public.circle_templates
  add column if not exists owner_space_id uuid references public.spaces(id) on delete set null;

comment on column public.circle_templates.owner_space_id is
  'The Space that owns this blueprint (a Program''s Chapter template). NULL = staff-authored Starter Circle (the global catalog).';

create index if not exists circle_templates_owner_space_idx
  on public.circle_templates (owner_space_id) where owner_space_id is not null;
