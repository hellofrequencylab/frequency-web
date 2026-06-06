-- =============================================================================
-- Quests get a Pillar + join-gating support (ADR-140)
--
-- Two gaps from GAMIFICATION-AUDIT.md:
--   • quest_chains (the gamified seasonal Journeys) were pillar-themed by name
--     only — no real domain link. Add domain_id → domains so they browse/group by
--     Pillar (Mind/Body/Spirit/Expression), matching ECONOMY-AND-JOURNEYS §5.
--   • Join-gating lives in app code (advanceQuests now only advances chains a
--     member has STARTED). No schema change needed for that beyond the existing
--     quest_progress row — a row now means "joined". This migration just back-
--     fills the Pillar tags on the four seasonal Journeys.
-- =============================================================================

alter table public.quest_chains
  add column if not exists domain_id uuid references public.domains(id) on delete set null;

create index if not exists idx_quest_chains_domain on public.quest_chains (domain_id);

-- Tag the four seasonal Pillar Journeys onto their Pillar.
update public.quest_chains qc
set domain_id = d.id
from public.domains d
where qc.slug in ('mind-open-circle','body-show-up-strong','spirit-steady-practice','expression-make-and-share')
  and d.slug = split_part(qc.slug, '-', 1);
