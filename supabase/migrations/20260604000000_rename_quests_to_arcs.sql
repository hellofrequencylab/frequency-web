-- The Quest naming (ADR-079): the multi-step feature "quests" becomes "Arcs".
-- Rename the tables; constraints, RLS policies, FKs and pkey/unique indexes follow
-- automatically. Rename the named secondary indexes for consistency, recreate the
-- analytics RPC against the new names, and leave security_invoker compatibility
-- views (quest_*) for one release so any not-yet-deployed reader (e.g. the
-- always-loaded stats dock) keeps working across the rename.
--
-- Applied via MCP. Follow-up migration drops the compat views once the app no
-- longer references quest_* (see docs/THE-QUEST.md).

alter table public.quest_chains   rename to arc_chains;
alter table public.quest_steps    rename to arc_steps;
alter table public.quest_progress rename to arc_progress;

alter index idx_quest_steps_chain      rename to idx_arc_steps_chain;
alter index idx_quest_progress_profile rename to idx_arc_progress_profile;
alter index idx_quest_progress_chain   rename to idx_arc_progress_chain;

create or replace function public.quest_outcomes()
returns table (chain_id uuid, name text, started bigint, completed bigint, avg_stall_step numeric)
language sql stable as $$
  select q.id, q.name,
         count(p.id)::bigint, count(p.completed_at)::bigint,
         round(avg(p.current_step) filter (where p.completed_at is null), 1)
  from public.arc_chains q
  join public.arc_progress p on p.chain_id = q.id
  group by q.id, q.name
  order by count(p.id) desc;
$$;

create view public.quest_chains   with (security_invoker = on) as select * from public.arc_chains;
create view public.quest_steps    with (security_invoker = on) as select * from public.arc_steps;
create view public.quest_progress with (security_invoker = on) as select * from public.arc_progress;

grant select, insert, update, delete on public.quest_chains   to anon, authenticated, service_role;
grant select, insert, update, delete on public.quest_steps    to anon, authenticated, service_role;
grant select, insert, update, delete on public.quest_progress to anon, authenticated, service_role;
