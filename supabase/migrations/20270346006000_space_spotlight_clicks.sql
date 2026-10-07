-- LIVE-856 (Space Spotlight, PR 7 of 7): how many times each Link card on a Space's Spotlight is pressed, so
-- the owner sees what their link page does. One row per press, with the Space, the card's target id
-- (`book`, `contact`, `product:<id>`, `journey:<id>`, `event:<id>`, `membership:<id>`) and the time.
--
-- NO VISITOR DATA. No profile, IP, cookie, session or user agent is stored: a row says only that a card was
-- pressed, so it needs no consent gate and holds nothing personal.
--
-- SECURITY POSTURE: service role only. RLS on with no policy (scripts/rls-deny-all.txt) and every default
-- grant revoked from anon and authenticated (scripts/table-grants.txt `internal`). Written by the public
-- POST /api/spotlight/click route and read by the Space console, both through the service-role client.
--
-- Additive: one new table, no change to any existing table, no functions.

begin;

create table if not exists public.space_spotlight_clicks (
  id bigint generated always as identity primary key,
  space_id uuid not null references public.spaces(id) on delete cascade,
  target text not null check (char_length(target) between 1 and 80),
  clicked_at timestamptz not null default now()
);

create index if not exists idx_space_spotlight_clicks_space on public.space_spotlight_clicks (space_id, clicked_at desc);

alter table public.space_spotlight_clicks enable row level security;
revoke all on table public.space_spotlight_clicks from anon, authenticated;

comment on table public.space_spotlight_clicks is
  'LIVE-856: one row per press of a Link card on a Space Spotlight. No visitor data. Service role only.';

commit;
