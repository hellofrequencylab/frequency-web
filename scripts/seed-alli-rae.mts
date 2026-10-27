// Create the Alli Rae Design & Build Space and launch its website on the Designer theme (owner ask 2026-10-27).
// Prints ONE SQL transaction the owner pastes into the Supabase SQL editor. It adds exactly one Space (slug
// `alli-rae`), owned by the owner's own profile (handle `danieltyack`) until a claim link hands it to Alli. Business
// plan, comped (no Stripe subscription, nothing is charged). It publishes the site through the same function the
// editor's Publish button uses (save_website_editor), so the public stub and the private state agree.
// Guarded: refuses unless the slug is free, exactly one owner profile and exactly one root Space match. The backup
// table records the new Space, and the rollback at the foot of the output removes it. Nothing existing is edited.
//
//   node --experimental-strip-types --no-warnings scripts/seed-alli-rae.mts > alli-rae.sql
//
// LAST STEP after the paste (LIVE-1496): node scripts/attach-site-subdomain.mjs <slug>. A SQL publish never attaches the
// address to Vercel, and there is no wildcard domain.

import { ALLI_RAE, ALLI_RAE_ACCENT, ALLI_RAE_FOOTER, ALLI_RAE_MENU, alliRaeEditorState } from '../lib/sites/alli-rae-site.ts'

const lit = (v: unknown) => JSON.stringify(v).replace(/'/g, "''")
const str = (s: string) => s.replace(/'/g, "''")

const state = alliRaeEditorState('2026-10-27T00:00:00.000Z')
const prefs = {
  megaTheme: { theme: 'designer', niche: null, version: 1 },
  siteStyle: { theme: 'designer', synced: true, spaceFonts: 'classic' },
  siteFooter: ALLI_RAE_FOOTER,
  siteMenu: ALLI_RAE_MENU,
}

const sql = `-- Alli Rae Design & Build: a new Space and its Designer website. Run AFTER the Designer theme PR is merged and live.
-- Adds exactly one Space (slug 'alli-rae'). Re-running is safe: it stops if the Space already exists.
begin;

create table if not exists zz_backup_alli_rae_20261027 (
  space_id uuid primary key,
  note text,
  created_at timestamptz not null default now()
);

do $$
declare
  sid uuid;
  owner_id uuid;
  ent uuid;
  tok text;
  ok boolean;
  state jsonb := '${lit(state)}'::jsonb;
begin
  if exists (select 1 from spaces where slug = 'alli-rae') then raise exception 'a Space with slug alli-rae already exists - rolled back'; end if;
  if (select count(*) from profiles where handle = 'danieltyack') <> 1 then raise exception 'expected exactly one profile with handle danieltyack - rolled back'; end if;
  select id into owner_id from profiles where handle = 'danieltyack';
  if (select count(*) from spaces where type = 'root') <> 1 then raise exception 'expected exactly one root Space - rolled back'; end if;
  select entity_id into ent from spaces where type = 'root';

  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into spaces (slug, name, type, status, entity_id, plan, is_comped, visibility, network_connected, owner_profile_id,
                      brand_name, brand_accent, tagline, about, claim_token, preferences)
  values ('alli-rae', '${str(ALLI_RAE.name)}', 'business', 'active', ent, 'business', true, 'network', true, owner_id,
          '${str(ALLI_RAE.name)}', '${ALLI_RAE_ACCENT}', '${str(ALLI_RAE.tagline)}',
          '${str(ALLI_RAE.name)} is a San Diego Design + Build firm: custom homes, remodels and commercial spaces, designed and built by one team.',
          tok, '${lit(prefs)}'::jsonb)
  returning id into sid;

  insert into space_members (space_id, profile_id, role, status) values (sid, owner_id, 'admin', 'active')
  on conflict (space_id, profile_id) do nothing;

  -- Publish the website exactly as the editor does: full state to private state, comment-free stub to the Space.
  select public.save_website_editor(sid, 0, state, true) into ok;
  if not ok then raise exception 'the website could not be saved - rolled back'; end if;

  insert into zz_backup_alli_rae_20261027 (space_id, note) values (sid, 'created by seed-alli-rae.mts');
end $$;

commit;

-- The claim link: open  <site address>/spaces/claim/<claim_token>  to hand the Space to Alli.
select slug, plan, is_comped, claim_token from spaces where slug = 'alli-rae';

-- ROLLBACK (removes only what this script created):
-- delete from space_private_state where space_id in (select space_id from zz_backup_alli_rae_20261027);
-- delete from space_members where space_id in (select space_id from zz_backup_alli_rae_20261027);
-- delete from spaces where id in (select space_id from zz_backup_alli_rae_20261027);
`
process.stdout.write(sql)
