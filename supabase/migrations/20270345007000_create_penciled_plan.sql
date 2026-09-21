-- Create the lightest valid event Plan and its first penciled date atomically.
-- SECURITY INVOKER is intentional: the existing RLS policies remain the lock.

create or replace function public.create_penciled_plan(
  p_space_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_time_zone text
)
returns table (plan_id uuid, entry_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_title text := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  v_plan_id uuid;
  v_entry_id uuid;
begin
  if v_title = '' or char_length(v_title) > 200 then
    raise exception 'invalid pencil title';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'invalid pencil date';
  end if;
  if btrim(coalesce(p_time_zone, '')) = '' then
    raise exception 'invalid pencil time zone';
  end if;

  insert into public.space_plans (
    space_id, title, stage, target_kind, owner_profile_id, created_by
  )
  values (
    p_space_id, v_title, 'pencil', 'event', auth.uid(), auth.uid()
  )
  returning id into v_plan_id;

  insert into public.space_calendar_entries (
    space_id, kind, title, all_day, starts_at, ends_at, time_zone,
    status, blocks_time, visibility, stage, plan_id, created_by
  )
  values (
    p_space_id, 'pencil', v_title, true, p_starts_at, p_ends_at, p_time_zone,
    'tentative', false, 'team', 'pencil', v_plan_id, auth.uid()
  )
  returning id into v_entry_id;

  return query select v_plan_id, v_entry_id;
end;
$$;

revoke all on function public.create_penciled_plan(uuid, text, timestamptz, timestamptz, text) from public;
revoke all on function public.create_penciled_plan(uuid, text, timestamptz, timestamptz, text) from anon;
revoke all on function public.create_penciled_plan(uuid, text, timestamptz, timestamptz, text) from authenticated;
grant execute on function public.create_penciled_plan(uuid, text, timestamptz, timestamptz, text) to authenticated;
