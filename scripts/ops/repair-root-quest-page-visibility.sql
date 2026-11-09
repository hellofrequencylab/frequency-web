-- PROPOSAL ONLY. Do not run before this exact file is reviewed, committed on main and authorized.
-- Restore the existing everyone-plays contract for authenticated members at root /crew only.
-- Native visibility_role=NULL means any signed-in member; it does not make /crew public.
-- Fresh metadata before execution must still match the observed compare-and-set token below.
-- A second execution, a changed row, missing/duplicate root or any unexpected side effect REFUSES.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
do $repair$
declare
  target_space uuid;
  root_count integer;
  target_count integer;
  before_row jsonb;
  after_row jsonb;
  affected integer;
  expected_updated_at constant timestamptz := '2026-06-22 15:21:37.887+00';
begin
  select count(*) into root_count from public.spaces where type = 'root';
  if root_count <> 1 then
    raise exception 'QUEST-PAGE-VISIBILITY: expected one root Space, found %; refusing', root_count;
  end if;
  select id into strict target_space from public.spaces where type = 'root';

  select count(*) into target_count from public.page_settings
    where space_id = target_space and route = '/crew';
  if target_count <> 1 then
    raise exception 'QUEST-PAGE-VISIBILITY: expected one root /crew row, found %; refusing', target_count;
  end if;

  select to_jsonb(p) into strict before_row
    from public.page_settings p
    where p.space_id = target_space and p.route = '/crew'
    for update;
  if before_row is null
    or before_row->>'status' is distinct from 'published'
    or before_row->>'visibility_role' is distinct from 'crew'
    or (before_row->>'updated_at')::timestamptz is distinct from expected_updated_at then
    raise exception 'QUEST-PAGE-VISIBILITY: reviewed root /crew preconditions changed; refusing';
  end if;

  update public.page_settings
    set visibility_role = null, updated_at = now()
    where space_id = target_space and route = '/crew'
      and status = 'published' and visibility_role = 'crew'
      and updated_at = expected_updated_at;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'QUEST-PAGE-VISIBILITY: changed % rows, expected one; rolling back', affected;
  end if;

  select to_jsonb(p) into after_row from public.page_settings p
    where p.space_id = target_space and p.route = '/crew';
  if after_row->>'status' is distinct from 'published'
    or after_row->>'visibility_role' is not null
    or (after_row - 'visibility_role' - 'updated_at') is distinct from
       (before_row - 'visibility_role' - 'updated_at') then
    raise exception 'QUEST-PAGE-VISIBILITY: unexpected postcondition; rolling back';
  end if;
end
$repair$;
commit;
