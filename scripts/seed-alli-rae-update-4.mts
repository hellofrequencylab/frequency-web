// Trim the Home page's "How We Bring Your Vision To Life" steps on the LIVE Alli Rae Design & Build Space (LIVE-1560):
// shorter lead and body for each of the three steps, so the panel stands about as tall as the portrait. Prints ONE SQL
// transaction the owner pastes into the Supabase SQL editor.
//
// Guarded: stops unless exactly one Space has slug `alliraebuilddesign`, its saved site is at revision 3 or 4 (update 3
// ran on top of update 2) and its newest saved version is still ours (author Frequency), so nothing Alli changed in the
// editor is overwritten. It backs up the old preferences and private editor state first and writes the new state as the
// next revision through save_website_editor (the editor's own Publish function). The menu, footer and entitlements are
// not touched.
//
//   node --experimental-strip-types --no-warnings scripts/seed-alli-rae-update-4.mts > update-alli-rae-space-4.sql

import { ALLI_RAE_SLUG, alliRaeEditorState } from '../lib/sites/alli-rae-site.ts'

const lit = (v: unknown) => JSON.stringify(v).replace(/'/g, "''")

const now = '2026-10-28T09:00:00.000Z'
const state = alliRaeEditorState(now)

const sql = `-- Alli Rae Design & Build: shorter Home steps (lead and body of the three approach steps).
-- Run AFTER the LIVE-1560 PR is merged and deployed, and after update 3. Safe to re-run: it stops once the saved site is past revision 4 or has an edit that is not ours.
begin;

create table if not exists zz_backup_alli_rae_update4_20261028 (
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
  if (select count(*) from spaces where slug = '${ALLI_RAE_SLUG}') <> 1 then raise exception 'expected exactly one Space with slug ${ALLI_RAE_SLUG} - rolled back'; end if;
  select id into sid from spaces where slug = '${ALLI_RAE_SLUG}';
  select website_editor into cur from space_private_state where space_id = sid;
  rev := coalesce((cur->>'revision')::integer, 0);
  if rev not in (3, 4) then raise exception 'the saved site is at revision %, expected 3 or 4 (update 3 not run yet, or it was edited since) - rolled back', rev; end if;
  if coalesce(cur #>> '{versions,0,author}', '') <> 'Frequency' then raise exception 'the newest saved version is not ours (the site was edited in the editor) - rolled back'; end if;

  insert into zz_backup_alli_rae_update4_20261028 (space_id, preferences, website_editor)
  select sid, preferences, cur from spaces where id = sid
  on conflict (space_id) do nothing;

  -- The new site as the next revision, keeping the old versions behind it.
  state := jsonb_set(state, '{revision}', to_jsonb(rev + 1));
  state := jsonb_set(state, '{versions}', jsonb_build_array(jsonb_build_object('id', (rev + 1)::text, 'createdAt', '${now}', 'author', 'Frequency', 'snapshot', state->'draft')) || coalesce(cur->'versions', '[]'::jsonb));

  select public.save_website_editor(sid, rev, state, true) into ok;
  if not ok then raise exception 'the website could not be saved - rolled back'; end if;
end $$;

commit;

select slug, preferences #>> '{websiteEditor,revision}' as revision from spaces where slug = '${ALLI_RAE_SLUG}';

-- ROLLBACK (puts back what this script changed):
-- update spaces s set preferences = b.preferences from zz_backup_alli_rae_update4_20261028 b where s.id = b.space_id;
-- update space_private_state p set website_editor = b.website_editor, updated_at = now() from zz_backup_alli_rae_update4_20261028 b where p.space_id = b.space_id;
`
process.stdout.write(sql)
