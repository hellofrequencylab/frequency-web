// SEED GENERATOR: the Free Human Movement Space PAGE (the in-app Space profile), arranged as the website tells its story (owner ask 2026-10-30:
// "Do a deep analysis of the story the website tells, and set it up the same way. Remove services so there are only 4."). Prints ONE guarded
// SQL transaction: the Space's own blocks (about, quote, offerings, workshops, events, books, Audrey, lineage, FAQ, contact) in the website's
// order with its words and pictures, and the offerings cut to the four seasons. The synced data blocks (about, offerings, events, team, FAQ)
// keep reading the Space; the rest are authored blocks that carry the website's copy.
//
//   RENDER_OUT=/mnt/project-files/free-human pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/free-human-space-page-sql.render.tsx
import { writeFileSync } from 'node:fs'
import { it } from 'vitest'

it('prints the Free Human Space page SQL', async () => {
  const out = process.env.RENDER_OUT
  if (!out) throw new Error('set RENDER_OUT')
  const { FREE_HUMAN_SLUG, FREE_HUMAN_SPACE } = await import('@/lib/sites/free-human-site')
  const { FREE_HUMAN_BOOKS, FREE_HUMAN_HERO, FREE_HUMAN_LINEAGE, FREE_HUMAN_LYRIC, FREE_HUMAN_SEASONS, FREE_HUMAN_SPEAKING, FREE_HUMAN_WORKSHOPS } = await import('@/lib/sites/free-human-home')
  const { sanitizeEntityLayout } = await import('@/lib/entity-blocks/layout')
  const site = `https://${FREE_HUMAN_SLUG}.frequencylocal.com`
  const plain = (s: string) => s.replace(/\*/g, '')

  const layout = {
    rows: [
      { id: 'r1', columns: 2, ratio: 'lead', cells: [['about'], ['image']] },
      { id: 'r2', columns: 1, cells: [['quote']] },
      { id: 'r3', columns: 1, cells: [['offerings']] },
      { id: 'r4', columns: 1, cells: [['cardGrid']] },
      { id: 'r5', columns: 2, ratio: 'lead', cells: [['events'], ['team']] },
      { id: 'r6', columns: 1, cells: [['features']] },
      { id: 'r7', columns: 1, cells: [['zigzag']] },
      { id: 'r8', columns: 1, cells: [['heading', 'gallery']] },
      { id: 'r9', columns: 2, ratio: 'lead', cells: [['faq'], ['contactForm']] },
      { id: 'r10', columns: 1, cells: [['accentBeat']] },
    ],
    content: {
      about: { eyebrow: 'Free Human Movement', title: plain(FREE_HUMAN_HERO.title), body: `${FREE_HUMAN_HERO.lead}\n\n${FREE_HUMAN_SEASONS.lead} Come as you are. Bring the baby.\n\nCreated by Audrey Uma Wilder, who also writes, speaks and gathers women around the turns of the year.` },
      image: { src: FREE_HUMAN_HERO.image, alt: FREE_HUMAN_HERO.alt },
      quote: { text: FREE_HUMAN_LYRIC.line },
      offerings: { eyebrow: FREE_HUMAN_SEASONS.eyebrow, title: plain(FREE_HUMAN_SEASONS.title) },
      cardGrid: {
        eyebrow: FREE_HUMAN_WORKSHOPS.eyebrow, title: plain(FREE_HUMAN_WORKSHOPS.title), subtitle: FREE_HUMAN_WORKSHOPS.aside, columns: '3', shape: 'top', rounded: true, shadow: true,
        cards: FREE_HUMAN_WORKSHOPS.rows.map((r) => ({ title: plain(r.title), text: `${r.mode}. ${r.body}`, image: r.image, link: `${site}/workshops` })),
      },
      events: { eyebrow: 'Gather', title: 'Come as you are. Bring the baby.' },
      features: {
        eyebrow: FREE_HUMAN_BOOKS.eyebrow, title: plain(FREE_HUMAN_BOOKS.title), source: 'custom', layout: 'spotlight',
        items: FREE_HUMAN_BOOKS.books.map((b) => ({ icon: '', title: plain(b.title), text: `${b.subtitle} ${b.body}`, image: b.image, link: `${site}/books`, cta: b.primaryLabel })),
      },
      zigzag: { eyebrow: FREE_HUMAN_SPEAKING.eyebrow, title: plain(FREE_HUMAN_SPEAKING.title), body: FREE_HUMAN_SPEAKING.body, image: FREE_HUMAN_SPEAKING.image, alt: FREE_HUMAN_SPEAKING.alt, mediaSide: 'left' },
      heading: { text: plain(FREE_HUMAN_LINEAGE.title) },
      gallery: { images: FREE_HUMAN_LINEAGE.photos.map((p) => p.image), view: 'masonry', gap: 'standard' },
      faq: { eyebrow: 'Questions', title: 'Before you join' },
      contactForm: { eyebrow: 'Bring Audrey to your gathering', title: 'Say hello', body: 'Tell us about your gathering, retreat, school or podcast. We write back to every request.', showMessage: true, messageLabel: 'About your gathering', submitLabel: 'Send', successMessage: FREE_HUMAN_SPEAKING.successMessage },
      accentBeat: { eyebrow: 'Join in any month', title: 'Move like the woman who made a world.', body: FREE_HUMAN_SPACE.about, buttonOn: true, buttonLabel: 'Join the circle', buttonUrl: `${site}/program` },
    },
  }
  const clean = sanitizeEntityLayout(layout, 'space')
  if (!clean?.rows || clean.rows.length !== layout.rows.length) throw new Error('rows did not survive sanitize')
  for (const k of Object.keys(layout.content)) if (!clean.content?.[k]) throw new Error(`content for ${k} did not survive sanitize`)
  if ((clean.content!.cardGrid as { cards: unknown[] }).cards.length !== 3) throw new Error('cards lost')
  if ((clean.content!.gallery as { images: unknown[] }).images.length !== 5) throw new Error('gallery lost')

  const seasons = FREE_HUMAN_SEASONS.seasons.map((s) => ({ title: s.name, blurb: `${s.season === 'fall' ? 'Fall' : s.season[0]!.toUpperCase() + s.season.slice(1)}. ${s.body}`, priceModel: 'contact', visibility: 'listed' }))
  const lit = (v: unknown) => JSON.stringify(v).replace(/'/g, "''")
  const sql = `-- FREE HUMAN MOVEMENT: arrange the Space page as the website tells its story, and cut the offerings to the four seasons. One guarded transaction.
begin;
create table if not exists zz_backup_free_human_page_20261030 as select id as space_id, preferences from spaces where slug = '${FREE_HUMAN_SLUG}';
do $$
declare sid uuid;
begin
  if (select count(*) from spaces where slug = '${FREE_HUMAN_SLUG}') <> 1 then raise exception 'expected exactly one ${FREE_HUMAN_SLUG} Space - rolled back'; end if;
  select id into sid from spaces where slug = '${FREE_HUMAN_SLUG}';
  update spaces set preferences = jsonb_set(preferences || jsonb_build_object('profileLayout', '${lit(clean)}'::jsonb), '{profileData,offerings}', '${lit(seasons)}'::jsonb) where id = sid;
  if (select jsonb_array_length(preferences #> '{profileData,offerings}') from spaces where id = sid) <> 4 then raise exception 'offerings are not four - rolled back'; end if;
end $$;
select jsonb_array_length(preferences #> '{profileData,offerings}') as offerings, jsonb_array_length(preferences #> '{profileLayout,rows}') as rows from spaces where slug = '${FREE_HUMAN_SLUG}';
commit;
-- UNDO: update spaces s set preferences = b.preferences from zz_backup_free_human_page_20261030 b where s.id = b.space_id;
`
  writeFileSync(`${out}/free-human-space-page.sql`, sql)
})
