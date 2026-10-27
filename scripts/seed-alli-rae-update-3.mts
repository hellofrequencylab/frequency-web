// Bring the LIVE Alli Rae Design & Build Space to the 2026-10-27 header ask (LIVE-1506): the header menu is exactly
// Home | Portfolio | About, and the Portfolio page lists the three custom builds. Prints ONE SQL transaction the owner
// pastes into the Supabase SQL editor.
//
// Why the houses leaked into the top bar: a SAVED menu only draws on a Space that holds the `space_full_website`
// entitlement (lib/spaces/entitlements.ts, a deliberate default-deny lock), and the seed never granted it. So the saved
// menu was ignored and the site drew its automatic menu, every page in a row. This update grants that one entitlement
// to this comped Business Space and saves the new menu.
//
// Guarded: stops unless exactly one Space has slug `alliraebuilddesign`, its saved site is at revision 2 or 3 (the first
// seed plus update 2, or update 1 plus update 2) and its newest saved version is still ours (author Frequency), so
// nothing Alli changed in the editor is overwritten. It backs up the old preferences, entitlements and private editor state
// first, writes the new state as the next revision through save_website_editor (the editor's own Publish function),
// merges siteMenu into preferences and sets the one entitlement. The claim token is not touched.
//
//   node --experimental-strip-types --no-warnings scripts/seed-alli-rae-update-3.mts > update-alli-rae-space-3.sql

import { ALLI_RAE_NAV, ALLI_RAE_SLUG, alliRaeEditorState } from '../lib/sites/alli-rae-site.ts'

const lit = (v: unknown) => JSON.stringify(v).replace(/'/g, "''")

const now = '2026-10-27T18:00:00.000Z'
const state = alliRaeEditorState(now)

const sql = `-- Alli Rae Design & Build: header menu Home | Portfolio | About, Portfolio page lists the custom builds.
-- Run AFTER the LIVE-1506 PR is merged and deployed, and after update 2. Safe to re-run: it stops once the saved site is past revision 3 or has an edit that is not ours.
begin;

create table if not exists zz_backup_alli_rae_update3_20261027 (
  space_id uuid primary key,
  preferences jsonb,
  entitlements jsonb,
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
  if rev not in (2, 3) then raise exception 'the saved site is at revision %, expected 2 or 3 (update 2 not run yet, or it was edited since) - rolled back', rev; end if;
  if coalesce(cur #>> '{versions,0,author}', '') <> 'Frequency' then raise exception 'the newest saved version is not ours (the site was edited in the editor) - rolled back'; end if;

  insert into zz_backup_alli_rae_update3_20261027 (space_id, preferences, entitlements, website_editor)
  select sid, preferences, entitlements, cur from spaces where id = sid
  on conflict (space_id) do nothing;

  -- The new site as the next revision, keeping the old versions behind it.
  state := jsonb_set(state, '{revision}', to_jsonb(rev + 1));
  state := jsonb_set(state, '{versions}', jsonb_build_array(jsonb_build_object('id', (rev + 1)::text, 'createdAt', '${now}', 'author', 'Frequency', 'snapshot', state->'draft')) || coalesce(cur->'versions', '[]'::jsonb));

  select public.save_website_editor(sid, rev, state, true) into ok;
  if not ok then raise exception 'the website could not be saved - rolled back'; end if;

  -- The saved menu, and the one entitlement that lets a Space's saved menu draw on its website.
  update spaces
     set preferences = preferences || jsonb_build_object('siteMenu', '${lit(ALLI_RAE_NAV)}'::jsonb),
         entitlements = coalesce(entitlements, '{}'::jsonb) || '{"space_full_website": true}'::jsonb
   where id = sid;
end $$;

commit;

select slug, preferences #>> '{websiteEditor,revision}' as revision, jsonb_array_length(preferences->'siteMenu'->'items') as menu_items, entitlements->>'space_full_website' as saved_menu_on from spaces where slug = '${ALLI_RAE_SLUG}';

-- ROLLBACK (puts back what this script changed):
-- update spaces s set preferences = b.preferences, entitlements = b.entitlements from zz_backup_alli_rae_update3_20261027 b where s.id = b.space_id;
-- update space_private_state p set website_editor = b.website_editor, updated_at = now() from zz_backup_alli_rae_update3_20261027 b where p.space_id = b.space_id;
`
process.stdout.write(sql)
