// SEED GENERATOR: the Free Human Movement Space and Spotlight (owner ask 2026-10-29). Prints ONE guarded SQL transaction the owner pastes
// into the Supabase SQL editor. It adds exactly one Space (slug `freehumanmovement`), owned by the owner's profile (handle
// `danieltyack`), Business plan comped, wearing the free-human theme, with its website published through the same function the
// editor's Publish button uses (save_website_editor) and its Space Spotlight published from the same fields.
// Guarded: refuses unless the slug is free, exactly one owner profile and exactly one root Space match. The backup table records
// the new Space and the rollback at the foot removes only it. Nothing existing is edited.
//
//   RENDER_OUT=/mnt/project-files/free-human pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/free-human-space-sql.render.tsx
//
// LAST STEP after the paste: node scripts/attach-site-subdomain.mjs freehumanmovement (a SQL publish never attaches the address to Vercel).
import { writeFileSync } from 'node:fs'
import { it } from 'vitest'

it('prints the Free Human Movement Space SQL', async () => {
  const out = process.env.RENDER_OUT
  if (!out) throw new Error('set RENDER_OUT')
  const { FREE_HUMAN_MENU, FREE_HUMAN_PROGRAMS, FREE_HUMAN_SLUG, FREE_HUMAN_SPACE, freeHumanEditorState, freeHumanSpotlight } = await import('@/lib/sites/free-human-site')
  const { FREE_HUMAN_SEED_EVENTS } = await import('@/lib/sites/free-human-seed-events')
  const { nextSpotlightPreferences } = await import('@/lib/spaces/spotlight')
  const { planMegaTheme } = await import('@/lib/theme/apply-mega-theme')
  const { FREE_HUMAN_ACCENT } = await import('@/lib/theme/free-human')

  // A Space holds ONE program row (unique index space_programs_one_per_space), so the four seasons are its description.
  const PROGRAM = [{ name: 'The year-round program', description: `Join in any month. Each season brings a new module of movement, teaching and ritual, held together by a live circle. ${FREE_HUMAN_PROGRAMS.map((p) => `${p.name} (${p.description.split('.')[0]!.toLowerCase()})`).join(', ')}.`, schedule: 'A live circle each season' }]
  const lit = (v: unknown) => JSON.stringify(v).replace(/'/g, "''")
  const str = (s: string) => s.replace(/'/g, "''")
  const state = freeHumanEditorState('2026-10-29T00:00:00.000Z')
  const prefs = { ...planMegaTheme({}, 'free-human'), siteMenu: FREE_HUMAN_MENU, ...nextSpotlightPreferences({}, { published: true, layout: freeHumanSpotlight().layout }) }

  // The slim form below is only valid while these three are one snapshot; fail loudly if the state ever diverges.
  if (JSON.stringify(state.draft) !== JSON.stringify(state.published) || JSON.stringify(state.draft) !== JSON.stringify(state.versions[0].snapshot) || state.versions.length !== 1 || state.v !== 1 || state.revision !== 1) throw new Error('editor state is no longer one snapshot')
  const sql = `-- Free Human Movement: a new Space, its Free Human website and its Space Spotlight. Run AFTER the Free Human registration is live.
-- Adds exactly one Space (slug '${FREE_HUMAN_SLUG}'). Re-running is safe: it stops if the Space already exists.
begin;

create table if not exists zz_backup_free_human_20261029 (
  space_id uuid primary key,
  note text,
  created_at timestamptz not null default now()
);

do $$
declare
  sid uuid;
  owner_id uuid;
  ent uuid;
  circ uuid;
  ok boolean;
  events jsonb := '${lit(FREE_HUMAN_SEED_EVENTS)}'::jsonb;
  programs jsonb := '${lit(PROGRAM)}'::jsonb;
  ev jsonb;
  snap jsonb := '${lit(state.draft)}'::jsonb;
  state jsonb;
begin
  -- The draft, the published copy and the first saved version are the same snapshot, so it is written once.
  state := jsonb_build_object('v', 1, 'revision', 1, 'draft', snap, 'published', snap,
    'versions', jsonb_build_array(jsonb_build_object('id', '1', 'createdAt', '${state.versions[0].createdAt}', 'author', '${state.versions[0].author}', 'snapshot', snap)));
  if exists (select 1 from spaces where slug = '${FREE_HUMAN_SLUG}') then raise exception 'a Space with slug ${FREE_HUMAN_SLUG} already exists - rolled back'; end if;
  if (select count(*) from profiles where handle = 'danieltyack') <> 1 then raise exception 'expected exactly one profile with handle danieltyack - rolled back'; end if;
  select id into owner_id from profiles where handle = 'danieltyack';
  if (select count(*) from spaces where type = 'root') <> 1 then raise exception 'expected exactly one root Space - rolled back'; end if;
  select entity_id into ent from spaces where type = 'root';

  insert into spaces (slug, name, type, status, entity_id, plan, is_comped, visibility, network_connected, owner_profile_id,
                      brand_name, brand_logo_url, brand_accent, cover_image_url, time_zone, tagline, about, preferences)
  values ('${FREE_HUMAN_SLUG}', '${str(FREE_HUMAN_SPACE.name)}', 'business', 'active', ent, 'business', true, 'network', true, owner_id,
          '${str(FREE_HUMAN_SPACE.name)}', '${FREE_HUMAN_SPACE.logo}', '${FREE_HUMAN_ACCENT.accent}', '${FREE_HUMAN_SPACE.cover}', '${FREE_HUMAN_SPACE.timeZone}', '${str(FREE_HUMAN_SPACE.tagline)}', '${str(FREE_HUMAN_SPACE.about)}',
          '${lit(prefs)}'::jsonb)
  returning id into sid;

  insert into space_members (space_id, profile_id, role, status) values (sid, owner_id, 'admin', 'active')
  on conflict (space_id, profile_id) do nothing;

  -- Publish the website exactly as the editor does: full state to private state, comment-free stub to the Space.
  select public.save_website_editor(sid, 0, state, true) into ok;
  if not ok then raise exception 'the website could not be saved - rolled back'; end if;

  -- The Space's own Circle (the spaces_ensure_space_circle trigger makes it with the Space) holds the gatherings; a Space without one keeps them standalone.
  select id into circ from circles where space_id = sid order by is_space_primary desc nulls last, created_at limit 1;

  -- The year-round program: one row (a Space holds one), with the four seasons in its description.
  insert into space_programs (space_id, name, description, schedule, is_published)
  select sid, p->>'name', p->>'description', p->>'schedule', true from jsonb_array_elements(programs) p;

  -- The year of gatherings from the design: wall clock held as UTC parts in the Space's time zone, like every Space event.
  for ev in select * from jsonb_array_elements(events) loop
    insert into events (title, description, host_id, scope_type, scope_id, scope_circle_id, space_id, host_space_id, slug, status, visibility,
                        starts_at, ends_at, time_zone, attendance_mode, recurrence_type, recurrence_rule, recurrence_until, join_mode,
                        published_at, posted_by_profile_id, source)
    values (ev->>'title', ev->>'summary', owner_id, case when circ is null then 'standalone' else 'circle' end, coalesce(circ, owner_id), circ, sid, sid,
            'fh-' || (ev->>'id'), 'published', 'public',
            (ev->>'startsAt')::timestamptz, (ev->>'endsAt')::timestamptz, '${FREE_HUMAN_SPACE.timeZone}', ev->>'mode', ev->>'recurrence', ev->>'rule',
            (ev->>'until')::timestamptz, 'rsvp', now(), owner_id, 'manual');
  end loop;

  insert into zz_backup_free_human_20261029 (space_id, note) values (sid, 'created by free-human-space-sql.render.tsx');
end $$;

commit;

-- Check (should return one row: freehumanmovement, business, true, free-human, true, 26, 1)
select s.slug, s.plan, s.is_comped, s.preferences #>> '{megaTheme,theme}' as theme, (s.preferences #>> '{spotlight,published}')::boolean as spotlight_published,
       (select count(*) from events e where e.space_id = s.id) as events, (select count(*) from space_programs p where p.space_id = s.id) as programs
from spaces s where s.slug = '${FREE_HUMAN_SLUG}';

-- ROLLBACK (removes only what this script created):
-- delete from events where space_id in (select space_id from zz_backup_free_human_20261029);
-- delete from space_programs where space_id in (select space_id from zz_backup_free_human_20261029);
-- delete from circles where space_id in (select space_id from zz_backup_free_human_20261029);
-- delete from space_private_state where space_id in (select space_id from zz_backup_free_human_20261029);
-- delete from space_members where space_id in (select space_id from zz_backup_free_human_20261029);
-- delete from spaces where id in (select space_id from zz_backup_free_human_20261029);
`
  writeFileSync(`${out}/free-human-space.sql`, sql)
})
