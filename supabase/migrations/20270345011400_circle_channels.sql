-- A CIRCLE CARRIES ONE TO THREE CHANNELS (LIVE-666, ADR-1679).
--
-- The owner ruled on 2026-09-29 ("Up to 3 Channels", recorded by HYG-138 / ADR-1624) and on
-- 2026-09-30 ("Phase it"). Until now a Circle declared exactly one Channel, the single nullable
-- FK `circles.topical_channel_id`. This is the join that lets it carry up to three.
--
-- THE CAP IS STRUCTURAL, NOT A TRIGGER. Each row takes a `position` of 1, 2 or 3, and a Circle may
-- hold each position once (`unique (circle_id, position)`), so a fourth row has nowhere to go and
-- the insert fails. The primary key keeps one Channel from being carried twice by one Circle.
--
-- POSITION 1 IS THE PRIMARY, AND THE PRIMARY STAYS ON `circles.topical_channel_id`. The write door
-- (setCircleChannels in lib/channels/programs.ts) keeps the column equal to position 1. Every reader
-- that asks for "the Channel" (the feed RLS arm on cluster posts, scoped_feed_for_viewer, the
-- circle_privacy feed functions, public_circle_by_slug, the message rooms) keeps reading the column.
-- Widening the feed and RLS arms to "any of the Circle's Channels" is its own row, LIVE-730, parked
-- until after launch. Discovery and the Channel pages match on any of the three today, in app code.
--
-- ON A CHANNEL DELETE the row here CASCADES while `circles.topical_channel_id` is SET NULL, exactly
-- as the column already behaved (20270116000000). The delete door promotes the Circle's next Channel
-- to primary in app code.
--
-- WHO WRITES: nobody through RLS. Every Circle-to-Channel write already goes through the service
-- role (lib/channels/programs.ts, authz at the caller, ADR-274), so there is a public read and no
-- insert, update or delete policy for any signed-in role.
--
-- APPLY RIGHT BEFORE THE PUSH that ships its readers (the orchestrator's serial window). The readers
-- embed and filter this table, so the code must not reach production before it does.
--
-- ROLLBACK:
--   drop table if exists public.circle_channels;

create table if not exists public.circle_channels (
  circle_id          uuid not null references public.circles(id) on delete cascade,
  topical_channel_id uuid not null references public.topical_channels(id) on delete cascade,
  position           smallint not null check (position between 1 and 3),
  created_at         timestamptz not null default now(),
  primary key (circle_id, topical_channel_id),
  unique (circle_id, position)
);

comment on table public.circle_channels is
  'The one to three Channels a Circle practices in (LIVE-666, ADR-1679). position 1 is the primary and mirrors circles.topical_channel_id; the cap of three is the position check plus unique (circle_id, position). Written only by the service role.';
comment on column public.circle_channels.position is
  '1, 2 or 3. 1 is the primary Channel and equals circles.topical_channel_id.';

-- The primary key leads on circle_id and the unique leads on circle_id, so the circle FK is covered.
-- The Channel FK needs its own index: every Channel page asks "which Circles carry this Channel".
create index if not exists ix_circle_channels_topical_channel_id on public.circle_channels (topical_channel_id);

-- Every Circle that declares a Channel today carries it as its primary.
insert into public.circle_channels (circle_id, topical_channel_id, position)
select id, topical_channel_id, 1 from public.circles where topical_channel_id is not null
on conflict do nothing;

alter table public.circle_channels enable row level security;

drop policy if exists "circle_channels: public read" on public.circle_channels;
create policy "circle_channels: public read" on public.circle_channels for select using (true);

-- No insert, update or delete policy: see the header.

grant select on public.circle_channels to anon, authenticated;
grant select, insert, update, delete on public.circle_channels to service_role;
