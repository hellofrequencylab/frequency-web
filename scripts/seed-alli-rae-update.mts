// Bring the LIVE Alli Rae Design & Build Space up to the current site, footer and menu (LIVE-1494). The first
// seed (seed-alli-rae.mts) created the Space; the design-fidelity work (LIVE-1493) since added footer fields, a saved
// menu and block props, so the stored copy needs one update. Prints ONE SQL transaction the owner pastes into the
// Supabase SQL editor.
// Guarded: stops unless exactly one Space has slug `alli-rae` and its saved site is still revision 1 (no one has edited it
// in the editor since the first seed). It backs up the old preferences and private editor state first, then writes the
// new state as revision 2 through save_website_editor (the editor's own Publish function) and merges siteFooter and
// siteMenu into preferences. Nothing else on the Space changes; the claim token is not touched.
//
//   node --experimental-strip-types --no-warnings scripts/seed-alli-rae-update.mts > alli-rae-update.sql

import { ALLI_RAE_FOOTER, ALLI_RAE_MENU, alliRaeEditorState } from '../lib/sites/alli-rae-site.ts'

const lit = (v: unknown) => JSON.stringify(v).replace(/'/g, "''")

const now = '2026-10-27T02:00:00.000Z'
const state = alliRaeEditorState(now)

const sql = `-- Alli Rae Design & Build: update the live site, footer and menu to the current Designer build.
-- Run AFTER the fidelity PR (LIVE-1493) is merged and deployed. Safe to re-run: it stops unless the saved site is still revision 1.
begin;

create table if not exists zz_backup_alli_rae_update_20261027 (
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
  if (select count(*) from spaces where slug = 'alli-rae') <> 1 then raise exception 'expected exactly one Space with slug alli-rae - rolled back'; end if;
  select id into sid from spaces where slug = 'alli-rae';
  select website_editor into cur from space_private_state where space_id = sid;
  rev := coalesce((cur->>'revision')::integer, 0);
  if rev <> 1 then raise exception 'the saved site is at revision %, expected 1 (it was edited after the first seed) - rolled back', rev; end if;

  insert into zz_backup_alli_rae_update_20261027 (space_id, preferences, website_editor)
  select sid, preferences, cur from spaces where id = sid
  on conflict (space_id) do nothing;

  -- The new site as revision 2, keeping the old versions behind it.
  state := jsonb_set(state, '{revision}', to_jsonb(rev + 1));
  state := jsonb_set(state, '{versions}', jsonb_build_array(jsonb_build_object('id', (rev + 1)::text, 'createdAt', '${now}', 'author', 'Frequency', 'snapshot', state->'draft')) || coalesce(cur->'versions', '[]'::jsonb));

  select public.save_website_editor(sid, rev, state, true) into ok;
  if not ok then raise exception 'the website could not be saved - rolled back'; end if;

  update spaces set preferences = preferences || jsonb_build_object('siteFooter', '${lit(ALLI_RAE_FOOTER)}'::jsonb, 'siteMenu', '${lit(ALLI_RAE_MENU)}'::jsonb) where id = sid;
end $$;

commit;

select slug, preferences #>> '{websiteEditor,revision}' as revision, jsonb_array_length(preferences->'siteMenu'->'items') as menu_items from spaces where slug = 'alli-rae';

-- ROLLBACK (puts back what this script changed):
-- update spaces s set preferences = b.preferences from zz_backup_alli_rae_update_20261027 b where s.id = b.space_id;
-- update space_private_state p set website_editor = b.website_editor, updated_at = now() from zz_backup_alli_rae_update_20261027 b where p.space_id = b.space_id;
`
process.stdout.write(sql)
