-- ============================================================================
-- PROG-E8 (4b): STORE THE PROMPT-CACHE SPLIT ON ai_usage (owner yes 2026-11-18)
-- ============================================================================
--
-- THE GAP. ai_usage already splits input_tokens from output_tokens, but input_tokens is the
-- WHOLE prompt (uncached + cache reads + cache writes, ADR-1287) and ai_settle_attempt folds
-- the two cache counts into it. So /admin/ai cannot show how much of a feature's prompt was
-- served from the cache or written to it, which is the reading PROG-E8 item 4b asks for.
--
-- THE CHANGE. Additive only.
--   1. Two nullable columns on ai_usage: cache_read_input_tokens and cache_creation_input_tokens
--      (the Anthropic usage field names). input_tokens keeps its meaning (the whole prompt), so
--      every existing reader and cap is unchanged. NULL means "not recorded": every row written
--      before this migration, every zero-cost embedding row, and any writer still on the old
--      settle signature. No backfill: the split for old rows is unknowable, and 0 would be a lie.
--   2. A six-argument overload of ai_settle_attempt carrying the two counts. The four-argument
--      function is left exactly as it is, so a deploy that still calls it keeps settling. The
--      overload has NO defaults, so PostgREST resolves the two by their argument names without
--      ambiguity.
--   3. ai_tokens_today(): per-feature token sums for today (UTC) for the operator page. A new
--      function, not a new column on ai_budget_status_today, because changing a function's
--      result columns needs a drop.
--
-- SECURITY DEFINER, service_role only; anon and authenticated revoked by name (ADR-959).
--
-- Rollback:
--   drop function if exists public.ai_tokens_today();
--   drop function if exists public.ai_settle_attempt(uuid, integer, integer, numeric, integer, integer);
--   alter table public.ai_usage drop column if exists cache_creation_input_tokens,
--     drop column if exists cache_read_input_tokens;

alter table public.ai_usage
  add column if not exists cache_read_input_tokens integer
    constraint ai_usage_cache_read_input_tokens_nonneg check (cache_read_input_tokens >= 0),
  add column if not exists cache_creation_input_tokens integer
    constraint ai_usage_cache_creation_input_tokens_nonneg check (cache_creation_input_tokens >= 0);

comment on column public.ai_usage.cache_read_input_tokens is
  'Prompt tokens served from the prompt cache. Included in input_tokens (the whole prompt). NULL = not recorded (before PROG-E8 4b, or a writer without the split).';
comment on column public.ai_usage.cache_creation_input_tokens is
  'Prompt tokens written to the prompt cache. Included in input_tokens (the whole prompt). NULL = not recorded (before PROG-E8 4b, or a writer without the split).';

create function public.ai_settle_attempt(p_id uuid, p_input_tokens integer, p_output_tokens integer, p_actual numeric,
  p_cache_read_tokens integer, p_cache_creation_tokens integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r public.ai_budget_reservations%rowtype;
begin
  if p_actual is null or p_actual < 0 or p_actual >= 'Infinity'::numeric
    or p_input_tokens is null or p_input_tokens < 0 or p_output_tokens is null or p_output_tokens < 0
    or p_cache_read_tokens < 0 or p_cache_creation_tokens < 0
    or coalesce(p_cache_read_tokens,0)::bigint + coalesce(p_cache_creation_tokens,0) > p_input_tokens then
    raise exception 'Invalid AI usage';
  end if;
  select * into r from public.ai_budget_reservations where id=p_id;
  if not found then raise exception 'Unknown AI reservation'; end if;
  perform pg_catalog.pg_advisory_xact_lock(883, r.budget_day - date '2000-01-01');
  select * into r from public.ai_budget_reservations where id=p_id for update;
  if r.state='settled' then
    return r.actual_usd=p_actual and exists(select 1 from public.ai_usage where reservation_id=p_id and cost_usd=round(p_actual,6)
      and input_tokens=p_input_tokens and output_tokens=p_output_tokens
      and cache_read_input_tokens is not distinct from p_cache_read_tokens
      and cache_creation_input_tokens is not distinct from p_cache_creation_tokens);
  end if;
  insert into public.ai_usage(feature,model,input_tokens,output_tokens,cache_read_input_tokens,cache_creation_input_tokens,
    cost_usd,profile_id,space_id,created_at,reservation_id)
    values(r.feature,r.model,p_input_tokens,p_output_tokens,p_cache_read_tokens,p_cache_creation_tokens,
      p_actual,r.profile_id,r.space_id,r.created_at,p_id);
  update public.ai_budget_reservations set state='settled',actual_usd=p_actual,settled_at=clock_timestamp(),reason=null where id=p_id;
  return true;
end;
$$;
revoke execute on function public.ai_settle_attempt(uuid,integer,integer,numeric,integer,integer) from public,anon,authenticated;
grant execute on function public.ai_settle_attempt(uuid,integer,integer,numeric,integer,integer) to service_role;

-- split_rows / unsplit_rows let the page say how much of the day the cache figures cover.
create function public.ai_tokens_today()
returns table(feature text, prompt_tokens bigint, output_tokens bigint, cache_read_tokens bigint,
  cache_creation_tokens bigint, split_rows bigint, unsplit_rows bigint)
language sql stable security definer set search_path = '' as $$
  select u.feature,
    coalesce(sum(u.input_tokens),0)::bigint,
    coalesce(sum(u.output_tokens),0)::bigint,
    coalesce(sum(u.cache_read_input_tokens),0)::bigint,
    coalesce(sum(u.cache_creation_input_tokens),0)::bigint,
    count(*) filter (where u.cache_read_input_tokens is not null and u.cache_creation_input_tokens is not null),
    count(*) filter (where u.cache_read_input_tokens is null or u.cache_creation_input_tokens is null)
  from public.ai_usage u
  where u.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
  group by u.feature;
$$;
revoke execute on function public.ai_tokens_today() from public,anon,authenticated;
grant execute on function public.ai_tokens_today() to service_role;
