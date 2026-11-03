// SEED GENERATOR: replaces the opening hero of the LIVE Program, Workshops and Books pages (new photos and lines, nothing else touched).
// Prints ONE guarded SQL transaction. Re-running is safe.
//
//   RENDER_OUT=/mnt/project-files/free-human pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/free-human-heroes-sql.render.tsx
import { writeFileSync } from 'node:fs'
import { it } from 'vitest'

it('prints the Free Human pages SQL', async () => {
  const out = process.env.RENDER_OUT
  if (!out) throw new Error('set RENDER_OUT')
  const { FREE_HUMAN_SLUG, freeHumanEditorState } = await import('@/lib/sites/free-human-site')
  const lit = (v: unknown) => JSON.stringify(v).replace(/'/g, "''")
  const pages = freeHumanEditorState('2026-10-30T00:00:00.000Z').draft.pages.filter((p) => ['program', 'workshops', 'books'].includes(p.slug))
  const sql = `-- Free Human Movement: new hero photos and lines on the Program, Workshops and Books pages. Replaces the first block of those three pages, nothing else.
begin;
create table if not exists zz_backup_free_human_heroes_20261103 as select space_id, website_editor from space_private_state where space_id = (select id from spaces where slug = '${FREE_HUMAN_SLUG}');
do $$
declare
  sid uuid; st jsonb; rev int; fresh jsonb := '${lit(pages)}'::jsonb; snap jsonb; ok boolean; pg jsonb; newpages jsonb := '[]'::jsonb; f jsonb;
begin
  select id into sid from spaces where slug = '${FREE_HUMAN_SLUG}';
  if sid is null then raise exception 'no freehumanmovement Space - rolled back'; end if;
  select website_editor into st from space_private_state where space_id = sid;
  if st is null then raise exception 'no website state - rolled back'; end if;
  rev := (st->>'revision')::int;
  for pg in select * from jsonb_array_elements(st->'draft'->'pages') loop
    select p into f from jsonb_array_elements(fresh) p where p->>'slug' = pg->>'slug';
    if f is not null then
      pg := jsonb_set(pg, '{doc,content,0}', f->'doc'->'content'->0);
    end if;
    newpages := newpages || jsonb_build_array(pg);
  end loop;
  snap := jsonb_set(st->'draft', '{pages}', newpages);
  st := jsonb_set(jsonb_set(jsonb_set(st, '{revision}', to_jsonb(rev + 1)), '{draft}', snap), '{published}', snap);
  st := jsonb_set(st, '{versions}', jsonb_build_array(jsonb_build_object('id', (rev + 1)::text, 'createdAt', now(), 'author', 'Frequency', 'snapshot', snap)) || (st->'versions'));
  select public.save_website_editor(sid, rev, st, true) into ok;
  if not ok then raise exception 'the website could not be saved - rolled back'; end if;
end $$;
select website_editor->>'revision' as revision, jsonb_array_length(website_editor->'published'->'pages') as pages from space_private_state where space_id = (select id from spaces where slug = '${FREE_HUMAN_SLUG}');
commit;
-- UNDO: the website state before this ran is in zz_backup_free_human_heroes_20261103 (column website_editor); ask Claude to restore it as the next revision.
`
  writeFileSync(`${out}/free-human-heroes.sql`, sql)
})
