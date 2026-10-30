// SEED GENERATOR: adds the Free Human menu pages (Program, Workshops, Books, Audrey) to the LIVE website and saves the menu.
// Prints ONE guarded SQL transaction. Re-running is safe: pages already present are kept, only missing ones are added.
//
//   RENDER_OUT=/mnt/project-files/free-human pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/free-human-pages-sql.render.tsx
import { writeFileSync } from 'node:fs'
import { it } from 'vitest'

it('prints the Free Human pages SQL', async () => {
  const out = process.env.RENDER_OUT
  if (!out) throw new Error('set RENDER_OUT')
  const { FREE_HUMAN_MENU, FREE_HUMAN_SLUG, freeHumanEditorState } = await import('@/lib/sites/free-human-site')
  const lit = (v: unknown) => JSON.stringify(v).replace(/'/g, "''")
  const pages = freeHumanEditorState('2026-10-30T00:00:00.000Z').draft.pages.filter((p) => ['program', 'workshops', 'books', 'audrey'].includes(p.slug))
  const sql = `-- Free Human Movement: add the Program, Workshops, Books and Audrey pages to the website and the menu. Adds pages, edits none.
begin;
create table if not exists zz_backup_free_human_pages_20261030 as select space_id, website_editor from space_private_state where space_id = (select id from spaces where slug = '${FREE_HUMAN_SLUG}');
do $$
declare
  sid uuid; st jsonb; rev int; newpages jsonb := '${lit(pages)}'::jsonb; merged jsonb; snap jsonb; ok boolean;
begin
  select id into sid from spaces where slug = '${FREE_HUMAN_SLUG}';
  if sid is null then raise exception 'no freehumanmovement Space - rolled back'; end if;
  select website_editor into st from space_private_state where space_id = sid;
  if st is null then raise exception 'no website state - rolled back'; end if;
  rev := (st->>'revision')::int;
  -- keep every page already there; add only the ones missing (by slug), before the Calendar
  select coalesce(jsonb_agg(p order by o), '[]'::jsonb) into merged from (
    select p, o from (
      select p, case when p->>'slug' = 'home' then 0 when p->>'slug' = 'calendar' then 100 else 50 + n end as o
      from jsonb_array_elements(st->'draft'->'pages') with ordinality as t(p, n)
      union all
      select p, 10 + n from jsonb_array_elements(newpages) with ordinality as t(p, n)
      where not exists (select 1 from jsonb_array_elements(st->'draft'->'pages') e where e->>'slug' = p->>'slug')
    ) x
  ) y;
  snap := jsonb_set(st->'draft', '{pages}', merged);
  st := jsonb_set(jsonb_set(jsonb_set(st, '{revision}', to_jsonb(rev + 1)), '{draft}', snap), '{published}', snap);
  st := jsonb_set(st, '{versions}', jsonb_build_array(jsonb_build_object('id', (rev + 1)::text, 'createdAt', now(), 'author', 'Frequency', 'snapshot', snap)) || (st->'versions'));
  select public.save_website_editor(sid, rev, st, true) into ok;
  if not ok then raise exception 'the website could not be saved - rolled back'; end if;
  update spaces set preferences = preferences || jsonb_build_object('siteMenu', '${lit(FREE_HUMAN_MENU)}'::jsonb) where id = sid;
end $$;
select jsonb_array_length(website_editor->'published'->'pages') as pages, website_editor->>'revision' as revision from space_private_state where space_id = (select id from spaces where slug = '${FREE_HUMAN_SLUG}');
commit;
-- UNDO: the website state before this ran is in zz_backup_free_human_pages_20261030 (column website_editor); ask Claude to restore it as the next revision.
`
  writeFileSync(`${out}/free-human-pages.sql`, sql)
})
