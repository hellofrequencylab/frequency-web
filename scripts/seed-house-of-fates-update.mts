// Bring the LIVE House of Fates Space up to the current site, footer and menu (the House of Fates Midnight kit). The first
// seed (seed-house-of-fates.mts) created the Space; the design-fidelity work (the design-fidelity PR) since added footer fields, a saved
// menu and block props, so the stored copy needs one update. Prints ONE SQL transaction the owner pastes into the
// Supabase SQL editor.
// Guarded: stops unless exactly one Space has slug `house-of-fates` and its saved site is still revision 1 (no one has edited it
// in the editor since the first seed). It backs up the old preferences and private editor state first, then writes the
// new state as revision 2 through save_website_editor (the editor's own Publish function) and merges siteFooter and
// siteMenu into preferences. Nothing else on the Space changes; the claim token is not touched.
//
//   node --experimental-strip-types --no-warnings scripts/seed-house-of-fates-update.mts > house-of-fates-update.sql

import { HOF_FOOTER, HOF_MENU, houseOfFatesEditorState } from '../lib/sites/house-of-fates-site.ts'

const lit = (v: unknown) => JSON.stringify(v).replace(/'/g, "''")

const now = '2026-10-27T02:00:00.000Z'
const state = houseOfFatesEditorState(now)

const sql = `-- House of Fates: update the live site, footer and menu to the current Midnight build.
-- Run AFTER the fidelity PR (the design-fidelity PR) is merged and deployed. Safe to re-run: it stops unless the saved site is still revision 1.
begin;

create table if not exists zz_backup_house_of_fates_update_20261027 (
  space_id uuid primary key,
  preferences jsonb,
  website_editor jsonb,
  created_at timestamptz not null default now()
);

do $$
declare
  sid uuid;
  cur jsonb;
  rev integer;
  state jsonb := '${lit(state)}'::jsonb;
  ok boolean;
begin
  if (select count(*) from spaces where slug = 'house-of-fates') <> 1 then raise exception 'expected exactly one Space with slug house-of-fates - rolled back'; end if;
  select id into sid from spaces where slug = 'house-of-fates';
  select website_editor into cur from space_private_state where space_id = sid;
  rev := coalesce((cur->>'revision')::integer, 0);
  if rev <> 1 then raise exception 'the saved site is at revision %, expected 1 (it was edited after the first seed) - rolled back', rev; end if;

  insert into zz_backup_house_of_fates_update_20261027 (space_id, preferences, website_editor)
  select sid, preferences, cur from spaces where id = sid
  on conflict (space_id) do nothing;

  -- The new site as revision 2, keeping the old versions behind it.
  state := jsonb_set(state, '{revision}', to_jsonb(rev + 1));
  state := jsonb_set(state, '{versions}', jsonb_build_array(jsonb_build_object('id', (rev + 1)::text, 'createdAt', '${now}', 'author', 'Frequency', 'snapshot', state->'draft')) || coalesce(cur->'versions', '[]'::jsonb));

  select public.save_website_editor(sid, rev, state, true) into ok;
  if not ok then raise exception 'the website could not be saved - rolled back'; end if;

  update spaces set preferences = preferences || jsonb_build_object('siteFooter', '${lit(HOF_FOOTER)}'::jsonb, 'siteMenu', '${lit(HOF_MENU)}'::jsonb) where id = sid;
end $$;

commit;

select slug, preferences #>> '{websiteEditor,revision}' as revision, jsonb_array_length(preferences->'siteMenu'->'items') as menu_items from spaces where slug = 'house-of-fates';

-- ROLLBACK (puts back what this script changed):
-- update spaces s set preferences = b.preferences from zz_backup_house_of_fates_update_20261027 b where s.id = b.space_id;
-- update space_private_state p set website_editor = b.website_editor, updated_at = now() from zz_backup_house_of_fates_update_20261027 b where p.space_id = b.space_id;
`
process.stdout.write(sql)
