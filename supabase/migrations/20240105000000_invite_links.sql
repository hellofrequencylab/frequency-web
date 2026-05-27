-- Invite links for circles
-- Hosts+ can generate shareable tokens that let people join a circle directly.

create table if not exists invite_links (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique,
  circle_id   uuid not null references circles(id) on delete cascade,
  created_by  uuid not null references profiles(id) on delete cascade,
  max_uses    int  not null default 0,          -- 0 = unlimited
  used_count  int  not null default 0,
  expires_at  timestamptz,                       -- null = never
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists invite_links_token_idx     on invite_links(token);
create index if not exists invite_links_circle_id_idx on invite_links(circle_id);

-- RLS: read by anyone (needed for public /join page), write by service role only
alter table invite_links enable row level security;

create policy "Anyone can read active invite links"
  on invite_links for select
  using (true);
