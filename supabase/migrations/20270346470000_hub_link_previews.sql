-- A link in a team message shows a preview card (LIVE-2530).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- public.link_previews caches what an outside page says about itself (title, description, image,
-- site name), one row per normalized URL, so a link posted in a room or a DM is fetched once and not
-- on every render. The server fills it when a message is SENT (lib/link-preview, through the SSRF-
-- guarded lib/net/pinned-fetch), with the service-role client the send action already holds. A
-- signed-in member may READ a row: it holds only the public metadata of a public page. Nobody but
-- the service role writes, so a member cannot plant a fake card. A row older than 7 days is
-- refetched on the next send; `ok = false` remembers a page that gave nothing, so it is not retried
-- on every message.
--
-- Additive and idempotent. ROLLBACK:
--   drop table if exists public.link_previews;

create table if not exists public.link_previews (
  url          text primary key check (char_length(url) between 8 and 2048),
  ok           boolean not null default false,
  title        text check (title is null or char_length(title) <= 300),
  description  text check (description is null or char_length(description) <= 600),
  image_url    text check (image_url is null or char_length(image_url) <= 2048),
  site_name    text check (site_name is null or char_length(site_name) <= 120),
  fetched_at   timestamptz not null default now()
);

comment on table public.link_previews is
  'Cached preview metadata for outside links in team messages (LIVE-2530). Written by the service role on send through the SSRF-guarded fetcher; read by signed-in members. Kept 7 days, then refetched.';

create index if not exists link_previews_fetched_idx on public.link_previews (fetched_at);

alter table public.link_previews enable row level security;

drop policy if exists link_previews_read on public.link_previews;
create policy link_previews_read on public.link_previews
  for select to authenticated using (true);

revoke all on table public.link_previews from anon;
