-- Engagement & Marketing Engine · Phase C (ADR-070). Program/game outcome analytics:
-- completion + stall points per challenge / quest, joined to their definitions for
-- names. "What's working / what isn't." Read by the admin client. Applied via MCP.

-- Per season-challenge: how many started vs completed.
create or replace function public.challenge_outcomes()
returns table (challenge_id uuid, name text, difficulty text, started bigint, completed bigint)
language sql stable as $$
  select c.id, c.name, c.difficulty,
         count(p.id)::bigint, count(p.completed_at)::bigint
  from public.season_challenges c
  join public.challenge_progress p on p.challenge_id = c.id
  group by c.id, c.name, c.difficulty
  order by count(p.id) desc;
$$;

-- Per quest chain: started vs completed + the average step the unfinished are stuck on.
create or replace function public.quest_outcomes()
returns table (chain_id uuid, name text, started bigint, completed bigint, avg_stall_step numeric)
language sql stable as $$
  select q.id, q.name,
         count(p.id)::bigint, count(p.completed_at)::bigint,
         round(avg(p.current_step) filter (where p.completed_at is null), 1)
  from public.quest_chains q
  join public.quest_progress p on p.chain_id = q.id
  group by q.id, q.name
  order by count(p.id) desc;
$$;
