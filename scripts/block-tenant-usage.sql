-- PROG-E2 aggregate census. Run against Frequency Community with an authorized read-only connection.
-- Counts stored placements in current drafts and published or scheduled documents, once per Space.
with docs as (
  select 'puck' as system, space_id, data as doc from public.pages where data is not null
  union all select 'puck', space_id, published_data from public.pages where published_data is not null
  union all
  select 'puck', s.id, d.value from public.spaces s
    cross join lateral jsonb_each(case when jsonb_typeof(s.preferences->'pageDocs') = 'object'
      then s.preferences->'pageDocs' else '{}'::jsonb end) d
  union all
  select 'puck', id, preferences->'puck' from public.spaces
    where not coalesce(preferences->'pageDocs', '{}'::jsonb) ? 'home'
  union all
  select 'puck', s.id, page.doc from public.spaces s
    left join public.space_private_state p on p.space_id = s.id
    cross join lateral (
      select coalesce(nullif(p.website_editor, 'null'::jsonb), s.preferences->'websiteEditor') as editor
    ) w
    cross join lateral jsonb_path_query(w.editor, 'strict $.draft.pages[*].doc', '{}', true) page(doc)
  union all
  select 'puck', s.id, page.doc from public.spaces s
    left join public.space_private_state p on p.space_id = s.id
    cross join lateral (
      select coalesce(nullif(p.website_editor, 'null'::jsonb), s.preferences->'websiteEditor') as editor
    ) w
    cross join lateral (values (w.editor->'published'), (w.editor#>'{scheduled,snapshot}')) v(snapshot)
    cross join lateral jsonb_path_query(v.snapshot, 'strict $.pages[*].doc', '{}', true) page(doc)
  union all select 'entity', id, preferences->'profileLayout' from public.spaces
  union all select 'entity', id, preferences->'profileLayoutDraft' from public.spaces
  union all select 'email', space_id, block_json from public.campaigns
  union all select 'email', null::uuid, block_json from public.nurture_steps
  union all select 'spotlight', id, preferences#>'{spotlight,layout}' from public.spaces
  union all select 'spotlight', null::uuid, meta#>'{spotlight,layout}' from public.profiles
    where meta->'spotlight' ? 'layout'
), types as (
  select d.system, d.space_id, v.item #>> '{}' as block_type from docs d
    cross join lateral jsonb_path_query(d.doc,
      'strict $.** ? (exists(@.type) && exists(@.props)).type', '{}', true) v(item)
    where d.system = 'puck' and jsonb_typeof(v.item) = 'string'
  union all
  select d.system, d.space_id,
    case jsonb_typeof(v.item) when 'string' then v.item #>> '{}' when 'object' then v.item->>'type' end
    from docs d
    cross join lateral (values
      ('strict $.rows[*].cells[*][*]'::jsonpath, jsonb_typeof(d.doc->'rows') = 'array'),
      ('strict $.rows[*].slots[*]'::jsonpath, jsonb_typeof(d.doc->'rows') = 'array'),
      ('strict $.order[*]'::jsonpath, jsonb_typeof(d.doc->'rows') is distinct from 'array'),
      ('strict $.slots.*[*]'::jsonpath, jsonb_typeof(d.doc->'rows') is distinct from 'array')
    ) shape(path, use_path)
    cross join lateral jsonb_path_query(d.doc, shape.path, '{}', true) v(item)
    where d.system in ('entity', 'email', 'spotlight') and shape.use_path
  union all
  select d.system, d.space_id, v.item #>> '{}' from docs d
    cross join lateral jsonb_path_query(d.doc, 'strict $.blocks[*].type', '{}', true) v(item)
    where d.system = 'spotlight' and d.space_id is null and jsonb_typeof(v.item) = 'string'
  union all
  select 'loom', d.space_id, concat(a.config->>'registry', ':', a.config->>'name')
    from docs d
    cross join lateral jsonb_path_query(d.doc,
      'strict $.** ? (exists(@.assetId) && exists(@.url)).assetId', '{}', true) v(id)
    join public.library_assets a on a.id::text = v.id #>> '{}'
    where a.kind = 'element' and a.config ? 'registry' and a.config ? 'name'
), usage as (
  select system, block_type, count(distinct space_id) as tenants
    from types where nullif(block_type, '') is not null
    group by system, block_type
)
select jsonb_build_object(
  'capturedOn', current_date,
  'systems', (select jsonb_object_agg(system, coalesce(counts, '{}'::jsonb)) from (
    select s.system, jsonb_object_agg(u.block_type, u.tenants) filter (where u.block_type is not null) as counts
      from (values ('entity'), ('puck'), ('email'), ('loom'), ('spotlight')) s(system)
      left join usage u on u.system = s.system
      group by s.system
  ) systems),
  'sourceDocuments', (select jsonb_object_agg(system, documents) from (
    select system, count(*) filter (where doc is not null and doc <> 'null'::jsonb) as documents
      from docs group by system
  ) sources)
) as snapshot;
