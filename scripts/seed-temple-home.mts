// Put the Royal Temple design's Home on the Royal Temple website (owner ask 2026-10-22, "match the design").
// Prints ONE SQL transaction the owner pastes into the Supabase SQL editor. It changes exactly one Space (slug
// `royaltemple`): the Home page's blocks, in the published site (spaces.preferences) and in the private editor
// state (space_private_state), and keeps every other page, the page's SEO and every other preference. The old
// Home blocks are saved first in zz_backup_temple_home_20261022, so the swap is undone with the rollback at the
// foot of the output. Guarded: it refuses unless exactly one Space matches and a Home page exists.
//
//   node --experimental-strip-types --no-warnings scripts/seed-temple-home.mts > temple-home.sql

import { layoutDefault } from '../lib/page-editor/layout.ts'
import { templeHomeBlocks } from '../lib/sites/temple-home.ts'

const content = templeHomeBlocks().map((b, i) => ({ type: b.type, props: { id: `tp-home-${i + 1}-${b.type.replace(/^Temple/, '').toLowerCase()}`, ...b.props, layout: layoutDefault } }))
const literal = JSON.stringify(content).replace(/'/g, "''")

/** The pages array with the Home page's blocks replaced and its old per-block layout cleared. */
const swap = (pages: string) => `(select jsonb_agg(case when p->>'slug' = 'home'
      then jsonb_set(jsonb_set(p, '{doc,content}', new_content), '{doc,root,props}', coalesce(p->'doc'->'root'->'props', '{}'::jsonb) - 'websiteLayout')
      else p end order by ord)
    from jsonb_array_elements(${pages}) with ordinality as t(p, ord))`

const sql = `-- Royal Temple's Home, as the design sets it. Run AFTER the PR that adds the Temple blocks is merged and live.
-- Changes exactly one Space (slug 'royaltemple'). Re-running is safe: the backup is written once.
begin;

create table if not exists zz_backup_temple_home_20261022 (
  space_id uuid primary key,
  public_pages jsonb,
  private_state jsonb,
  saved_at timestamptz not null default now()
);

do $$
declare
  sid uuid;
  n int;
  new_content jsonb := '${literal}'::jsonb;
begin
  select id into sid from spaces where slug = 'royaltemple';
  if sid is null then raise exception 'no Space with slug royaltemple - rolled back'; end if;
  if (select count(*) from spaces where slug = 'royaltemple') <> 1 then raise exception 'more than one royaltemple Space - rolled back'; end if;
  if not exists (select 1 from spaces s, jsonb_array_elements(s.preferences->'websiteEditor'->'published'->'pages') p where s.id = sid and p->>'slug' = 'home') then
    raise exception 'royaltemple has no published Home page - rolled back';
  end if;

  insert into zz_backup_temple_home_20261022 (space_id, public_pages, private_state)
  select sid, preferences->'websiteEditor'->'published'->'pages', (select website_editor from space_private_state where space_id = sid)
    from spaces where id = sid
  on conflict (space_id) do nothing;

  -- The published site the public page reads.
  update spaces
     set preferences = jsonb_set(preferences, '{websiteEditor,published,pages}', ${swap("preferences->'websiteEditor'->'published'->'pages'")})
   where id = sid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'expected to change 1 Space, changed % - rolled back', n; end if;

  -- The private editor state: the published snapshot and the draft, so the editor opens on the same Home.
  update space_private_state
     set website_editor = jsonb_set(jsonb_set(website_editor,
           '{published,pages}', ${swap("website_editor->'published'->'pages'")}),
           '{draft,pages}', ${swap("website_editor->'draft'->'pages'")}),
         updated_at = now()
   where space_id = sid and website_editor->'published'->'pages' is not null and website_editor->'draft'->'pages' is not null;
end $$;

commit;

-- ROLLBACK (puts the old Home blocks back):
-- update spaces s set preferences = jsonb_set(s.preferences, '{websiteEditor,published,pages}', b.public_pages)
--   from zz_backup_temple_home_20261022 b where s.id = b.space_id;
-- update space_private_state p set website_editor = b.private_state from zz_backup_temple_home_20261022 b where p.space_id = b.space_id and b.private_state is not null;
`
process.stdout.write(sql)
