-- =============================================================================
-- Practice library Phase 2 "Clean" — review fixes (ADR-446 follow-up).
-- From the pre-merge adversarial review of the server layer:
--   H1  merge_tags(from_id, into_id) — a TRANSACTIONAL tag merge (drop colliding
--       assignments → re-point the rest → delete the source def, all in one plpgsql
--       function = one implicit transaction). Replaces the non-atomic 4-round-trip TS
--       path in lib/practices/clean.ts (which had a mid-sequence-failure + TOCTOU race).
--   M2  merge_practices — add a guard rejecting a merge INTO an archived canonical
--       (would otherwise silently drop the moved adoptions/logs from member reads).
-- Both service_role only, SECURITY DEFINER, search_path pinned. Idempotent (create-or-replace).
-- Apply on a branch / via MCP with verification.
-- =============================================================================

-- M2: re-create merge_practices with the archived-canonical guard added.
create or replace function public.merge_practices(from_id uuid, to_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  from_slug text;
begin
  if from_id = to_id then raise exception 'cannot merge a practice into itself'; end if;
  if not exists (select 1 from practices where id = from_id) then raise exception 'source practice % not found', from_id; end if;
  if not exists (select 1 from practices where id = to_id) then raise exception 'canonical practice % not found', to_id; end if;
  if exists (select 1 from practices where id = from_id and merged_into is not null) then raise exception 'source % is already merged', from_id; end if;
  if exists (select 1 from practices where id = to_id and merged_into is not null) then raise exception 'canonical % is itself merged; merge into the live practice', to_id; end if;
  -- M2: never re-point onto a hidden canonical (the moved rows would vanish from member reads).
  if exists (select 1 from practices where id = to_id and status = 'archived') then raise exception 'canonical % is archived; merge into a live practice', to_id; end if;

  select slug into from_slug from practices where id = from_id;

  delete from member_practices mf using member_practices mt
    where mf.practice_id = from_id and mt.practice_id = to_id and mf.profile_id = mt.profile_id;
  update member_practices set practice_id = to_id where practice_id = from_id;

  delete from practice_logs lf using practice_logs lt
    where lf.practice_id = from_id and lt.practice_id = to_id
      and lf.profile_id = lt.profile_id and lf.logged_for = lt.logged_for;
  update practice_logs set practice_id = to_id where practice_id = from_id;

  delete from practice_tags tf using practice_tags tt
    where tf.practice_id = from_id and tt.practice_id = to_id and tf.tag_id = tt.tag_id;
  update practice_tags set practice_id = to_id where practice_id = from_id;

  update circle_practices set practice_id = to_id where practice_id = from_id;
  update journey_plan_items set practice_id = to_id where practice_id = from_id;
  update practice_sessions set practice_id = to_id where practice_id = from_id;

  update practices set remixed_from = to_id where remixed_from = from_id;
  update practices set root_practice_id = to_id where root_practice_id = from_id;

  if from_slug is not null then
    insert into practice_slug_redirects (old_slug, practice_id) values (from_slug, to_id)
      on conflict (old_slug) do update set practice_id = excluded.practice_id;
  end if;

  update practices set status = 'archived', is_public = false, merged_into = to_id where id = from_id;

  return jsonb_build_object('from', from_id, 'to', to_id, 'old_slug', from_slug);
end;
$$;

-- H1: transactional tag merge. Drop the source assignments that would collide on the
-- unique (practice_id, tag_id), re-point the rest onto the canonical, delete the source def.
create or replace function public.merge_tags(from_id uuid, into_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  repointed int;
  dropped int;
begin
  if from_id = into_id then raise exception 'cannot merge a tag into itself'; end if;
  if not exists (select 1 from practice_tag_defs where id = from_id) then raise exception 'source tag % not found', from_id; end if;
  if not exists (select 1 from practice_tag_defs where id = into_id) then raise exception 'target tag % not found', into_id; end if;

  delete from practice_tags tf using practice_tags tt
    where tf.tag_id = from_id and tt.tag_id = into_id and tf.practice_id = tt.practice_id;
  get diagnostics dropped = row_count;

  with up as (
    update practice_tags set tag_id = into_id where tag_id = from_id returning 1
  )
  select count(*) into repointed from up;

  delete from practice_tag_defs where id = from_id;

  return jsonb_build_object('repointed', repointed, 'dropped', dropped, 'into', into_id);
end;
$$;

revoke all on function public.merge_tags(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_tags(uuid, uuid) to service_role;

comment on function public.merge_tags is
  'Phase-2 tag governance (ADR-446): atomic synonym merge — drop colliding assignments, re-point the rest onto the canonical tag, delete the source def, in one transaction. service_role only.';
