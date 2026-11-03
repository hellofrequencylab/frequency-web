// Build out the Vanta Exterior Services Space (govanta.pro) on the Services theme, from the Vanta design system (owner ask 2026-11-03).
// Prints ONE SQL transaction. It edits the existing Space `vanta` (never creates one): the Services theme, the Tide accent, the
// header menu, the footer, a tagline and About, and the four pages (Home, Services, About, Free quote), published through the same
// function the editor's Publish button uses (save_website_editor).
// Guarded: stops unless exactly one Space has slug `vanta` and it has no saved website yet (revision 0), so nothing the owner built
// in the editor is overwritten. The backup table keeps the old preferences; the rollback at the foot restores them.
//
//   node --experimental-strip-types --no-warnings scripts/seed-vanta.mts > seed-vanta.sql

import { VANTA, VANTA_ACCENT, VANTA_FOOTER, VANTA_MENU, VANTA_SLUG, vantaEditorState } from '../lib/sites/vanta-site.ts'

const lit = (v: unknown) => JSON.stringify(v).replace(/'/g, "''")
const str = (s: string) => s.replace(/'/g, "''")

const state = vantaEditorState('2026-11-03T16:30:00.000Z')
const prefs = {
  megaTheme: { theme: 'services', niche: 'general', version: 1 },
  siteStyle: { theme: 'services', synced: true, spaceFonts: 'modern' },
  siteFooter: VANTA_FOOTER,
  siteMenu: VANTA_MENU,
}

const sql = `-- Vanta Exterior Services: the Services theme and the four pages from the Vanta design system.
-- Run AFTER the Services site-skin PR is merged and its production deploy is READY. Safe to re-run: it stops once a website is saved.
begin;

create table if not exists zz_backup_vanta_20261103 (
  space_id uuid primary key,
  preferences jsonb,
  brand_accent text,
  tagline text,
  about text,
  created_at timestamptz not null default now()
);

do $$
declare
  sid uuid;
  rev integer;
  ok boolean;
  state jsonb := '${lit(state)}'::jsonb;
begin
  if (select count(*) from spaces where slug = '${VANTA_SLUG}') <> 1 then raise exception 'expected exactly one Space with slug ${VANTA_SLUG} - rolled back'; end if;
  select id into sid from spaces where slug = '${VANTA_SLUG}';
  select coalesce((website_editor->>'revision')::integer, 0) into rev from space_private_state where space_id = sid;
  if coalesce(rev, 0) <> 0 then raise exception 'the Space already has a saved website (revision %) - rolled back', rev; end if;

  insert into zz_backup_vanta_20261103 (space_id, preferences, brand_accent, tagline, about)
  select id, preferences, brand_accent, tagline, about from spaces where id = sid
  on conflict (space_id) do nothing;

  update spaces
     set preferences = coalesce(preferences, '{}'::jsonb) || '${lit(prefs)}'::jsonb,
         brand_accent = '${VANTA_ACCENT}',
         tagline = '${str(VANTA.descriptor)}',
         about = coalesce(about, '${str(VANTA.full)} is an owner-operated window and solar panel cleaning company on the North County coast. ${str(VANTA.owner)} quotes every job, shows up to every job and does the work himself.')
   where id = sid;

  select public.save_website_editor(sid, 0, state, true) into ok;
  if not ok then raise exception 'the website could not be saved - rolled back'; end if;
end $$;

commit;

select slug, preferences #>> '{siteStyle,theme}' as theme, preferences #>> '{websiteEditor,revision}' as revision from spaces where slug = '${VANTA_SLUG}';

-- ROLLBACK (puts back what this script changed):
-- update spaces s set preferences = b.preferences, brand_accent = b.brand_accent, tagline = b.tagline, about = b.about from zz_backup_vanta_20261103 b where s.id = b.space_id;
-- delete from space_private_state where space_id in (select space_id from zz_backup_vanta_20261103);
`
process.stdout.write(sql)
