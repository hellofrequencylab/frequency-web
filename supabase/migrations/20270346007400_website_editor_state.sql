-- Atomic, website-only save. App authorizes the host-bound admin pass + current
-- membership. Only service_role may call this; invoker preserves that boundary.
create or replace function public.save_website_editor(
  p_space_id uuid, p_expected_revision integer, p_state jsonb, p_publish boolean default false
) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare changed integer;
begin
  if p_expected_revision is null or p_expected_revision < 0 or jsonb_typeof(p_state) is distinct from 'object'
     or p_state->>'v' is distinct from '1' or jsonb_typeof(p_state->'revision') is distinct from 'number'
     or jsonb_typeof(p_state->'draft') is distinct from 'object' or jsonb_typeof(p_state->'versions') is distinct from 'array'
     or (p_state->>'revision')::integer <> p_expected_revision + 1
     or octet_length(p_state::text) > 2000000 then
    raise exception 'Invalid website state';
  end if;
  update public.spaces
     set preferences = jsonb_set(coalesce(preferences, '{}'::jsonb), '{websiteEditor}', p_state, true)
       || case when p_publish then '{"websitePublished":true}'::jsonb else '{}'::jsonb end
   where id = p_space_id
     and coalesce((preferences #>> '{websiteEditor,revision}')::integer, 0) = p_expected_revision;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
revoke all on function public.save_website_editor(uuid, integer, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.save_website_editor(uuid, integer, jsonb, boolean) to service_role;

-- The existing five-minute publish-scheduled cron activates a captured snapshot,
-- never whatever draft happens to exist when the timer fires. Row locking prevents
-- duplicate activation, and increments revision so open editors cannot overwrite it.
create or replace function public.publish_due_websites(p_now timestamptz default now())
returns table(slug text)
language plpgsql security invoker set search_path = '' as $$
begin
  return query
  with due as (
    select s.id, s.slug, s.preferences->'websiteEditor' as editor
    from public.spaces s
    where s.preferences #>> '{websiteEditor,scheduled,at}' is not null
      and (s.preferences #>> '{websiteEditor,scheduled,at}')::timestamptz <= p_now
    order by s.preferences #>> '{websiteEditor,scheduled,at}'
    limit 100 for update skip locked
  ), activated as (
    update public.spaces s set preferences = jsonb_set(s.preferences, '{websiteEditor}',
      due.editor || jsonb_build_object(
        'revision', (due.editor->>'revision')::integer + 1,
        'published', due.editor #> '{scheduled,snapshot}',
        'scheduled', null,
        'versions', jsonb_build_array(jsonb_build_object(
          'id', ((due.editor->>'revision')::integer + 1)::text,
          'createdAt', p_now, 'author', due.editor #>> '{scheduled,author}',
          'snapshot', due.editor #> '{scheduled,snapshot}'
        )) || coalesce((select jsonb_agg(v.value) from jsonb_array_elements(due.editor->'versions') with ordinality v(value, n) where v.n <= 7), '[]'::jsonb)
      ), true) || '{"websitePublished":true}'::jsonb
    from due where s.id = due.id returning s.slug
  ) select activated.slug from activated;
end;
$$;
revoke all on function public.publish_due_websites(timestamptz) from public, anon, authenticated;
grant execute on function public.publish_due_websites(timestamptz) to service_role;

-- Short-lived website editing presence. No public or authenticated table access;
-- host-bound website actions authorize both writes and site-scoped reads.
create table public.website_editor_presence (
  space_id uuid not null references public.spaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  cursor jsonb,
  seen_at timestamptz not null default now(),
  primary key (space_id, profile_id)
);
alter table public.website_editor_presence enable row level security;
revoke all on table public.website_editor_presence from public, anon, authenticated;
grant select, insert, update, delete on table public.website_editor_presence to service_role;

-- The primary key leads with space_id; profile deletion needs its own FK index.
create index website_editor_presence_profile_id_idx
  on public.website_editor_presence (profile_id);
