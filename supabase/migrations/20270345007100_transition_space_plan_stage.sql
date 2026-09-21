-- A Plan is the lifecycle authority for its linked private calendar dates.
-- One transaction prevents a Workflow move from leaving the Plan and entries at different stages.

create or replace function public.transition_space_plan_stage(
  p_space_id uuid,
  p_plan_id uuid,
  p_stage text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer;
  v_plan_stage text;
  v_entry_stage text;
  v_archived_at timestamptz;
begin
  select x.plan_stage, x.entry_stage, x.archived_at
    into v_plan_stage, v_entry_stage, v_archived_at
    from (values
      ('pencil'::text,     'pencil'::text,     'pencil'::text,     null::timestamptz),
      ('plan'::text,       'plan'::text,       'planning'::text,   null::timestamptz),
      ('production'::text, 'production'::text, 'production'::text, null::timestamptz),
      ('cancelled'::text,  'plan'::text,       'cancelled'::text,  now())
    ) as x(stage, plan_stage, entry_stage, archived_at)
   where x.stage = p_stage;

  if v_plan_stage is null then return false; end if;

  update public.space_plans
     set stage = v_plan_stage,
         archived_at = v_archived_at,
         updated_at = now()
   where id = p_plan_id
     and space_id = p_space_id;

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    return false;
  end if;

  update public.space_calendar_entries
     set stage = v_entry_stage,
         updated_at = now()
   where plan_id = p_plan_id
     and space_id = p_space_id
     and kind = 'pencil';

  return true;
end;
$$;

revoke execute on function public.transition_space_plan_stage(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.transition_space_plan_stage(uuid, uuid, text) to authenticated;