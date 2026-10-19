-- SCAN-827: website drafts, review comments and the Executive Overview leave the anon-readable Space row.
--
-- THE DEFECT. 20270127000000 revoked table-wide SELECT on spaces and re-granted columns, including
-- preferences, to anon and authenticated. spaces_read_active still lets anon read every active
-- non-private Space. LIVE-EDITOR-STATE (#3342) stored the unpublished draft, scheduled snapshot,
-- version history and review comments (with author names) at preferences.websiteEditor, and
-- LIVE-862/864 stored the managers-only Executive Overview at preferences.programOverview.
-- GET /rest/v1/spaces?select=slug,preferences with the publishable anon key returned all of it.
-- withoutWebsiteDrafts / withoutLeadershipPreferences only strip the server-rendered projection.
--
-- THE FIX. A service-role-only row per Space holds the private editor state and the overview.
-- spaces.preferences may keep only the comment-free published snapshot plus revision, which the
-- public site already reads. save_website_editor and publish_due_websites write both. Browser
-- roles are revoked on the new table (RLS on, no policies).
--
-- AUTHORIZATION. Table and helper are service_role only. The two website RPCs stay invoker and
-- granted only to service_role, as 20270346007400 set them. Grants name the role (ADR-959).
--
-- Additive: new table, data move, create-or-replace of the two existing RPCs.
--
-- Rollback: restore preferences.websiteEditor and programOverview from space_private_state,
--           then drop table space_private_state and restore the 20270346007400 function bodies.

begin;

create table public.space_private_state (
  space_id uuid primary key references public.spaces(id) on delete cascade,
  website_editor jsonb,
  program_overview text,
  updated_at timestamptz not null default now(),
  constraint space_private_state_overview_len
    check (program_overview is null or char_length(program_overview) <= 60000)
);

comment on table public.space_private_state is
  'SCAN-827: website editor drafts, review comments, version history, scheduled publishes, and the Executive Overview. service_role ONLY. spaces.preferences is anon-readable and must not carry these keys.';

comment on column public.space_private_state.website_editor is
  'Full website editor state (draft, comments, published, scheduled, versions). The public Space row keeps only v, revision and a comment-free published snapshot.';

comment on column public.space_private_state.program_overview is
  'Executive Overview Markdown, private to the Space''s managers (LIVE-862).';

alter table public.space_private_state enable row level security;
revoke all on table public.space_private_state from public, anon, authenticated;
grant select, insert, update, delete on table public.space_private_state to service_role;

-- Comment-free published snapshot + revision, which a public Space row may carry.
create or replace function public.website_editor_public_stub(p_state jsonb)
returns jsonb
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_state is null or jsonb_typeof(p_state) is distinct from 'object' then null
    else jsonb_strip_nulls(jsonb_build_object(
      'v', p_state->'v',
      'revision', p_state->'revision',
      'published', case
        when p_state->'published' is null or jsonb_typeof(p_state->'published') is distinct from 'object' then p_state->'published'
        when jsonb_typeof(p_state->'published'->'pages') is distinct from 'array' then p_state->'published'
        else jsonb_set(
          p_state->'published',
          '{pages}',
          coalesce((
            select jsonb_agg(jsonb_set(coalesce(page, '{}'::jsonb), '{comments}', '[]'::jsonb) order by ord)
            from jsonb_array_elements(p_state->'published'->'pages') with ordinality as t(page, ord)
          ), '[]'::jsonb)
        )
      end
    ))
  end;
$$;

comment on function public.website_editor_public_stub(jsonb) is
  'SCAN-827: the comment-free published snapshot plus revision that spaces.preferences may carry. Not an RPC for browsers.';

revoke all on function public.website_editor_public_stub(jsonb) from public, anon, authenticated;
revoke execute on function public.website_editor_public_stub(jsonb) from public, anon, authenticated;
grant execute on function public.website_editor_public_stub(jsonb) to service_role;

insert into public.space_private_state (space_id, website_editor, program_overview)
select
  s.id,
  s.preferences -> 'websiteEditor',
  nullif(s.preferences ->> 'programOverview', '')
from public.spaces s
where (s.preferences ? 'websiteEditor' or s.preferences ? 'programOverview')
  and not exists (
    select 1 from public.space_private_state t where t.space_id = s.id
  );

update public.spaces s
   set preferences =
     (coalesce(s.preferences, '{}'::jsonb) - 'programOverview' - 'websiteEditor')
     || case
          when s.preferences ? 'websiteEditor'
            then jsonb_strip_nulls(jsonb_build_object(
              'websiteEditor', public.website_editor_public_stub(s.preferences -> 'websiteEditor')
            ))
          else '{}'::jsonb
        end
 where s.preferences ? 'websiteEditor' or s.preferences ? 'programOverview';

create or replace function public.save_website_editor(
  p_space_id uuid, p_expected_revision integer, p_state jsonb, p_publish boolean default false
) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare changed integer;
declare public_editor jsonb;
begin
  if p_expected_revision is null or p_expected_revision < 0 or jsonb_typeof(p_state) is distinct from 'object'
     or p_state->>'v' is distinct from '1' or jsonb_typeof(p_state->'revision') is distinct from 'number'
     or jsonb_typeof(p_state->'draft') is distinct from 'object' or jsonb_typeof(p_state->'versions') is distinct from 'array'
     or (p_state->>'revision')::integer <> p_expected_revision + 1
     or octet_length(p_state::text) > 2000000 then
    raise exception 'Invalid website state';
  end if;
  public_editor := public.website_editor_public_stub(p_state);
  if p_expected_revision = 0 then
    insert into public.space_private_state as t (space_id, website_editor, updated_at)
    values (p_space_id, p_state, now())
    on conflict (space_id) do update
       set website_editor = excluded.website_editor,
           updated_at = now()
     where coalesce((t.website_editor->>'revision')::integer, 0) = 0;
  else
    update public.space_private_state t
       set website_editor = p_state,
           updated_at = now()
     where t.space_id = p_space_id
       and coalesce((t.website_editor->>'revision')::integer, 0) = p_expected_revision;
  end if;
  get diagnostics changed = row_count;
  if changed <> 1 then
    return false;
  end if;
  update public.spaces
     set preferences = jsonb_set(coalesce(preferences, '{}'::jsonb), '{websiteEditor}', coalesce(public_editor, '{}'::jsonb), true)
       || case when p_publish then '{"websitePublished":true}'::jsonb else '{}'::jsonb end
   where id = p_space_id;
  return true;
end;
$$;

comment on function public.save_website_editor(uuid, integer, jsonb, boolean) is
  'Atomic website-editor save. Writes the full state to space_private_state and a comment-free published stub onto spaces.preferences (SCAN-827). service_role only.';

revoke all on function public.save_website_editor(uuid, integer, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.save_website_editor(uuid, integer, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.save_website_editor(uuid, integer, jsonb, boolean) to service_role;

create or replace function public.publish_due_websites(p_now timestamptz default now())
returns table(slug text)
language plpgsql security invoker set search_path = '' as $$
begin
  return query
  with due as (
    select t.space_id, s.slug, t.website_editor as editor
    from public.space_private_state t
    join public.spaces s on s.id = t.space_id
    where t.website_editor #>> '{scheduled,at}' is not null
      and (t.website_editor #>> '{scheduled,at}')::timestamptz <= p_now
    order by t.website_editor #>> '{scheduled,at}'
    limit 100 for update of t skip locked
  ), activated as (
    update public.space_private_state t set
      website_editor = due.editor || jsonb_build_object(
        'revision', (due.editor->>'revision')::integer + 1,
        'published', due.editor #> '{scheduled,snapshot}',
        'scheduled', null,
        'versions', jsonb_build_array(jsonb_build_object(
          'id', ((due.editor->>'revision')::integer + 1)::text,
          'createdAt', p_now, 'author', due.editor #>> '{scheduled,author}',
          'snapshot', due.editor #> '{scheduled,snapshot}'
        )) || coalesce((select jsonb_agg(v.value) from jsonb_array_elements(due.editor->'versions') with ordinality v(value, n) where v.n <= 7), '[]'::jsonb)
      ),
      updated_at = p_now
    from due where t.space_id = due.space_id
    returning t.space_id, due.slug, t.website_editor
  ), public_stub as (
    update public.spaces s
       set preferences = jsonb_set(
         coalesce(s.preferences, '{}'::jsonb),
         '{websiteEditor}',
         coalesce(public.website_editor_public_stub(activated.website_editor), '{}'::jsonb),
         true
       ) || '{"websitePublished":true}'::jsonb
    from activated where s.id = activated.space_id
    returning s.slug
  )
  select public_stub.slug from public_stub;
end;
$$;

comment on function public.publish_due_websites(timestamptz) is
  'Activates a captured scheduled website snapshot from space_private_state and writes a comment-free public stub (SCAN-827). service_role only.';

revoke all on function public.publish_due_websites(timestamptz) from public, anon, authenticated;
revoke execute on function public.publish_due_websites(timestamptz) from public, anon, authenticated;
grant execute on function public.publish_due_websites(timestamptz) to service_role;

commit;
