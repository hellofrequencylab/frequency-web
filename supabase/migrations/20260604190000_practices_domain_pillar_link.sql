-- Link practices to the 4 Pillars (the `domains` table). Additive + nullable; the
-- open Journeys library (backlog §Q1) organizes practice-combos by pillar.
alter table public.practices
  add column if not exists domain_id uuid references public.domains(id) on delete set null;
create index if not exists practices_domain_idx on public.practices (domain_id);

-- Backfill the seed practices to sensible pillars (authors can recategorize later).
update public.practices p set domain_id = d.id
from public.domains d
where p.domain_id is null and d.slug = (case
  when p.title in ('Morning movement','Cold exposure','Dawn patrol surf','Daily run','Mobility flow','Cold plunge') then 'body'
  when p.title in ('Daily meditation','Breathwork','Breathwork reset','Sound bath sit','Morning sit','Gratitude journaling','Gratitude journal') then 'spirit'
  when p.title in ('Daily sketch','250 words') then 'expression'
  when p.title in ('Reach out to one person') then 'mind'
end);
