-- Channels = the 4 Domains (Mind / Body / Spirit / Expression): the new top
-- taxonomy layer. The existing topical_channels become the Topic/Interest layer and
-- sort underneath via domain_id. circle_topics adds multi-topic tagging (additive;
-- circles.topical_channel_id stays as the "primary" topic). All additive + public-read;
-- writes go through the admin (service_role) client, matching topical_channels.
-- Applied via MCP. See docs/CONTENT-ARCHITECTURE.md + ADR-080.

create table if not exists public.domains (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  description   text,
  accent        text,
  cover_image   text,
  display_order int  not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

insert into public.domains (slug, name, description, display_order) values
  ('mind',       'Mind',       'Curiosity, growth, relating, and purpose.', 1),
  ('body',       'Body',       'Movement, health, and the physical.',       2),
  ('spirit',     'Spirit',     'Stillness, meaning, and the inner life.',   3),
  ('expression', 'Expression', 'Creativity, craft, and making.',            4)
on conflict (slug) do nothing;

alter table public.topical_channels
  add column if not exists domain_id uuid references public.domains(id) on delete set null;

-- Backfill the 7 seeded interests onto the 4 domains (editable later in admin).
update public.topical_channels tc
set domain_id = d.id
from public.domains d
join (values
  ('spirituality','spirit'),
  ('movement','body'),
  ('holistic-health','body'),
  ('human-relating','mind'),
  ('activism','mind'),
  ('business-support','mind'),
  ('creative','expression')
) as m(category, dom) on m.dom = d.slug
where tc.category = m.category and tc.domain_id is null;

create index if not exists idx_topical_channels_domain on public.topical_channels(domain_id);

-- Multi-topic tagging for circles (primary topic still lives on circles.topical_channel_id).
create table if not exists public.circle_topics (
  circle_id          uuid not null references public.circles(id) on delete cascade,
  topical_channel_id uuid not null references public.topical_channels(id) on delete cascade,
  created_at         timestamptz not null default now(),
  primary key (circle_id, topical_channel_id)
);

insert into public.circle_topics (circle_id, topical_channel_id)
select id, topical_channel_id from public.circles where topical_channel_id is not null
on conflict do nothing;

alter table public.domains       enable row level security;
alter table public.circle_topics enable row level security;

create policy "domains: public read"       on public.domains       for select using (true);
create policy "circle_topics: public read" on public.circle_topics for select using (true);

grant select on public.domains, public.circle_topics to anon, authenticated;
grant select, insert, update, delete on public.domains, public.circle_topics to service_role;
