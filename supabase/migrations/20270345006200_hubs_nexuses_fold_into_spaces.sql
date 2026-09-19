-- LIVE-242 / ADR-1439: Hubs and Nexuses fold into Space.
-- A Hub and a Nexus both read as "a Space that contains other Spaces" (CORE-MODEL ruling 5).
-- Member routes /hubs and /nexuses go away; the geography tables stay because Circles still
-- attach through circles.hub_id. This migration:
--   1. Lets a Space name its parent Space.
--   2. Points each hub/nexus row at the Space that now is that noun.
--   3. Mints a Business Space for every live hub and nexus that does not already have one,
--      using the same slug so /hubs/:slug 308s onto a real Space page.
-- Do not apply from an agent. File-only until the owner ledger catches up.

alter table public.spaces
  add column if not exists parent_id uuid references public.spaces(id) on delete set null;

create index if not exists spaces_parent_id_idx on public.spaces (parent_id);

comment on column public.spaces.parent_id is
  'Containing Space. A Hub or Nexus folds into a child Space of its parent Nexus Space (LIVE-242).';

alter table public.hubs
  add column if not exists space_id uuid references public.spaces(id) on delete set null;

alter table public.nexuses
  add column if not exists space_id uuid references public.spaces(id) on delete set null;

create unique index if not exists hubs_space_id_uidx on public.hubs (space_id) where space_id is not null;
create unique index if not exists nexuses_space_id_uidx on public.nexuses (space_id) where space_id is not null;

-- Mint Spaces for nexuses first so hubs can parent under them.
with root as (
  select entity_id
  from public.spaces
  where type = 'root'
  order by created_at
  limit 1
),
ins as (
  insert into public.spaces (
    slug, name, type, status, entity_id, skin, network_connected, visibility, plan, owner_profile_id
  )
  select
    n.slug,
    n.name,
    'business',
    'active',
    root.entity_id,
    'dawn',
    true,
    'network',
    'free',
    n.mentor_id
  from public.nexuses n
  cross join root
  where n.space_id is null
    and not exists (select 1 from public.spaces s where s.slug = n.slug)
  returning id, slug
)
update public.nexuses n
set space_id = ins.id
from ins
where n.slug = ins.slug
  and n.space_id is null;

-- Existing Space with the same slug (operator already created one) — just link.
update public.nexuses n
set space_id = s.id
from public.spaces s
where n.space_id is null
  and s.slug = n.slug;

with root as (
  select entity_id
  from public.spaces
  where type = 'root'
  order by created_at
  limit 1
),
ins as (
  insert into public.spaces (
    slug, name, type, status, entity_id, skin, network_connected, visibility, plan, owner_profile_id, parent_id
  )
  select
    h.slug,
    h.name,
    'business',
    'active',
    root.entity_id,
    'dawn',
    true,
    'network',
    'free',
    h.guide_id,
    pn.space_id
  from public.hubs h
  cross join root
  left join public.nexuses pn on pn.id = h.nexus_id
  where h.space_id is null
    and not exists (select 1 from public.spaces s where s.slug = h.slug)
  returning id, slug
)
update public.hubs h
set space_id = ins.id
from ins
where h.slug = ins.slug
  and h.space_id is null;

update public.hubs h
set space_id = s.id
from public.spaces s
where h.space_id is null
  and s.slug = h.slug;

-- Parent already-linked hub Spaces under their Nexus Space when both exist.
update public.spaces child
set parent_id = parent.id
from public.hubs h
join public.nexuses n on n.id = h.nexus_id
join public.spaces parent on parent.id = n.space_id
where child.id = h.space_id
  and h.space_id is not null
  and n.space_id is not null
  and child.parent_id is distinct from parent.id;
