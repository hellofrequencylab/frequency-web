// Rename the live Alli Rae Design & Build Space so its website address is alliraebuilddesign.frequencylocal.com
// (LIVE-1495, owner ask 2026-10-27). A Space's free site address is its slug, so the rename is the whole change; the
// footer's two button links name the slug, so the saved footer is rewritten in the same step. Prints ONE SQL
// transaction the owner pastes into the Supabase SQL editor.
// Guarded: stops unless exactly one Space has slug `alli-rae` and no Space has `alliraebuilddesign`. Backs up the old
// slug and footer first, with the rollback at the foot. The claim token, plan and owner are untouched, so the claim
// link keeps working.
//
//   node --experimental-strip-types --no-warnings scripts/seed-alli-rae-rename.mts > alli-rae-rename.sql

import { ALLI_RAE_FOOTER, ALLI_RAE_SLUG } from '../lib/sites/alli-rae-site.ts'

const lit = (v: unknown) => JSON.stringify(v).replace(/'/g, "''")

const sql = `-- Alli Rae Design & Build: move the live Space to alliraebuilddesign (site address alliraebuilddesign.frequencylocal.com).
-- Run AFTER the matching PR is merged and deployed. Stops if the old slug is not there once or the new one is taken.
begin;

create table if not exists zz_backup_alli_rae_rename_20261027 (
  space_id uuid primary key,
  old_slug text,
  old_footer jsonb,
  created_at timestamptz not null default now()
);

do $$
declare
  sid uuid;
begin
  if (select count(*) from spaces where slug = 'alli-rae') <> 1 then raise exception 'expected exactly one Space with slug alli-rae - rolled back'; end if;
  if exists (select 1 from spaces where slug = '${ALLI_RAE_SLUG}') then raise exception 'a Space with slug ${ALLI_RAE_SLUG} already exists - rolled back'; end if;
  select id into sid from spaces where slug = 'alli-rae';

  insert into zz_backup_alli_rae_rename_20261027 (space_id, old_slug, old_footer)
  select id, slug, preferences->'siteFooter' from spaces where id = sid
  on conflict (space_id) do nothing;

  update spaces
     set slug = '${ALLI_RAE_SLUG}',
         preferences = preferences || jsonb_build_object('siteFooter', '${lit(ALLI_RAE_FOOTER)}'::jsonb)
   where id = sid;
end $$;

commit;

select slug, plan, is_comped, (claim_token is not null) as claim_link_ready from spaces where slug = '${ALLI_RAE_SLUG}';

-- ROLLBACK (puts back the old address and footer):
-- update spaces s set slug = b.old_slug, preferences = jsonb_set(s.preferences, '{siteFooter}', coalesce(b.old_footer, 'null'::jsonb)) from zz_backup_alli_rae_rename_20261027 b where s.id = b.space_id;
`
process.stdout.write(sql)
