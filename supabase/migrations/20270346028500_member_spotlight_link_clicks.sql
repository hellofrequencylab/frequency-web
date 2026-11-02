-- LIVE-1954: how many times each link on a member's personal Spotlight is pressed, so the owner sees which
-- links do something. One row per press: the profile, the link's id on their page, and the time.
--
-- NO VISITOR DATA. No profile, IP, cookie, session or user agent of the visitor is stored, so no consent gate
-- applies. Same posture as space_spotlight_clicks (LIVE-856).
--
-- SECURITY POSTURE: service role only. RLS on with no policy and every default grant revoked from anon and
-- authenticated. Written by the public POST /api/spotlight/click beacon, read by the Spotlight editor, both
-- through the service-role client.
--
-- Additive and idempotent: one new table, no change to any existing table.

begin;

create table if not exists public.member_spotlight_link_clicks (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  link_id text not null check (char_length(link_id) between 1 and 40),
  clicked_at timestamptz not null default now()
);

create index if not exists idx_member_spotlight_link_clicks_profile
  on public.member_spotlight_link_clicks (profile_id, clicked_at desc);

alter table public.member_spotlight_link_clicks enable row level security;
revoke all on table public.member_spotlight_link_clicks from anon, authenticated;

comment on table public.member_spotlight_link_clicks is
  'LIVE-1954: one row per press of a link on a personal Spotlight. No visitor data. Service role only.';

commit;
