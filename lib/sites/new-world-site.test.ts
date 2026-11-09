import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { loadKit } from '@/lib/sites/kits/registry'
import { config } from '@/lib/page-editor/config'
import { planMegaTheme } from '@/lib/theme/apply-mega-theme'
import { validWebsiteSnapshot, type WebsiteSnapshot } from '@/lib/sites/editor/state'
import { hoursRowsOf, newWorldSiteFor, newWorldSiteSql, offeringPrice, type NewWorldSiteSpace } from './new-world-site'

// LIVE-2052: a Space's website dressed in New World without losing the owner's words. The last test doubles as the
// generator scripts/new-world-site-sql.mjs runs (NEW_WORLD_SITE_INPUT / NEW_WORLD_SITE_OUT), so the SQL that reaches
// production is built by the same code these tests pin.

const defaults = (type: string) => config.components[type]?.defaultProps as Record<string, unknown> | undefined
const space: NewWorldSiteSpace = {
  slug: 'harbor', name: 'Harbor Room', tagline: 'Body-based guidance', about: 'Harbor Room works with people who feel stuck.', coverUrl: 'https://cdn/cover.jpg', logoUrl: 'https://cdn/logo.jpg',
  profile: { kind: 'coach', address: '1 Main St, Encinitas', phone: '555 0100', email: 'hi@harbor.io', hours: 'Mon to Fri, 9am to 6pm, by appointment\nSat: 10am to 1pm', offerings: [{ title: 'Guidance Call', blurb: 'One call.', price: 120, durationMinutes: 60 }, { title: 'Deep Session', blurb: 'Longer.', price: 180, priceModel: 'from', durationMinutes: 90 }, { title: 'Ask', priceModel: 'contact' }] },
  siteHero: { heading: 'Fine, but *not okay.*', tagline: 'For when you look fine on paper.' },
  headerCta: { label: 'Book an exploratory call' },
}
const current: WebsiteSnapshot = {
  theme: 'NewWorld',
  pages: [{ slug: 'home', label: 'Home', seo: { title: '', description: '' }, comments: [], doc: { root: {}, content: [
    { type: 'ServicesHero', props: { id: 'h', title: 'Fine, but *not okay.*', lead: 'Get unstuck in person or online.', image: 'https://cdn/hero.jpg', alt: 'Harbor', primaryLabel: 'Book an exploratory call', primaryHref: '/spaces/harbor/book' } },
    { type: 'ServicesStory', props: { id: 's1', eyebrow: 'Who this is for', title: 'This might be *you*', paragraphs: ['Maybe everything came apart.', 'If that lands, you are in the right place.'], image: 'https://cdn/s1.jpg', alt: 'Harbor' } },
    { type: 'ServicesSteps', props: { id: 'st', eyebrow: 'How it works', title: 'Simplified', rows: [{ title: 'We settle', body: 'A conversation.' }, { title: 'We find', body: 'The weight.' }] } },
    { type: 'ServicesStory', props: { id: 's2', eyebrow: 'Finding myself', title: 'The way back was *through the body*', paragraphs: ['There was a stretch when everything came apart.', 'The thing that saved me was learning to feel.'], image: 'https://cdn/s2.jpg', alt: 'Outdoors' } },
    { type: 'ServicesTrust', props: { id: 't', items: [{ title: '1,000+', line: 'guided meditations' }, { title: '5+ years', line: 'body-based work' }] } },
    { type: 'SpaceCTA', props: { id: 'c', quote: 'We deal in the shadow.' } },
    { type: 'SpaceContact', props: { id: 'cf', eyebrow: 'Get in touch', title: 'Send me a message', body: 'Tell me what&#39;s going on.', submitLabel: 'Send message', successMessage: 'Thank you. I&#39;ll reply soon.' } },
    { type: 'ServicesContact', props: { id: 'cl', title: "When you're *ready*", lede: "There's a way through.", buttonLabel: 'Book an exploratory call', buttonHref: '/spaces/harbor/book' } },
  ] } }],
}
const blocks = (snap: WebsiteSnapshot, slug: string) => (snap.pages.find((p) => p.slug === slug)!.doc.content ?? []) as { type: string; props: Record<string, unknown> }[]
const find = (snap: WebsiteSnapshot, slug: string, type: string) => blocks(snap, slug).find((b) => b.type === type)!.props

describe('newWorldSiteFor', () => {
  it('replaces the pages with the New World General kit and keeps every page valid', async () => {
    const kit = (await loadKit('new-world-general'))!
    const built = newWorldSiteFor({ kit, current, space, defaults })
    if (!built.ok) throw new Error(built.error)
    expect(validWebsiteSnapshot(built.snapshot)).toBe(true)
    expect(built.snapshot.theme).toBe('NewWorld')
    expect(built.snapshot.pages.map((p) => p.slug)).toEqual(['home', 'services', 'about', 'booking', 'join'])
    expect(blocks(built.snapshot, 'home').every((b) => b.type.startsWith('NewWorld'))).toBe(true)
  })

  it('carries the hero, story, steps, numbers, closer, form line and quote into the matching New World blocks', async () => {
    const kit = (await loadKit('new-world-general'))!
    const built = newWorldSiteFor({ kit, current, space, defaults })
    if (!built.ok) throw new Error(built.error)
    const s = built.snapshot
    const hero = find(s, 'home', 'NewWorldHero')
    expect(hero.title).toBe('Fine, but *not okay.*')
    expect(hero.lead).toBe('Get unstuck in person or online.')
    expect(hero.image).toBe('https://cdn/hero.jpg')
    expect(hero.primaryLabel).toBe('Book an exploratory call')
    expect(hero.primaryHref).toBe('~/booking')
    expect(hero.eyebrow).toBe('1 Main St, Encinitas')
    expect(hero.rows).toEqual([])
    expect(hero.sample).toBe(false)
    expect(find(s, 'home', 'NewWorldStats').items).toEqual([
      { icon: 'award', value: '1,000+', label: 'guided meditations', note: '' },
      { icon: 'clock', value: '5+ years', label: 'body-based work', note: '' },
    ])
    expect(find(s, 'home', 'NewWorldStory').paragraphs).toEqual(['Maybe everything came apart.', 'If that lands, you are in the right place.'])
    expect(find(s, 'home', 'NewWorldFirstVisit').rows).toEqual([{ title: 'We settle', body: 'A conversation.' }, { title: 'We find', body: 'The weight.' }])
    expect(find(s, 'home', 'NewWorldAsk').lede).toBe("Tell me what's going on.")
    expect(find(s, 'home', 'NewWorldCloser')).toMatchObject({ title: "When you're *ready*", aside: "There's a way through.", primaryLabel: 'Book an exploratory call' })
    expect(find(s, 'about', 'NewWorldQuote')).toMatchObject({ quote: 'We deal in the shadow.', by: 'Harbor Room' })
    expect(find(s, 'about', 'NewWorldAboutHero')).toMatchObject({ title: 'The way back was *through the body*', lead: 'There was a stretch when everything came apart.', name: 'Harbor Room', role: 'Coach', image: 'https://cdn/s2.jpg' })
    expect(find(s, 'about', 'NewWorldLongStory').paragraphs).toEqual(['The thing that saved me was learning to feel.', 'Maybe everything came apart.', 'If that lands, you are in the right place.', 'Harbor Room works with people who feel stuck.'])
    expect(built.carried).toContain('home/NewWorldHero')
  })

  it('prices the ways in from the Space offerings and leaves every live block without sample rows', async () => {
    const kit = (await loadKit('new-world-general'))!
    const built = newWorldSiteFor({ kit, current, space, defaults })
    if (!built.ok) throw new Error(built.error)
    const s = built.snapshot
    expect(find(s, 'home', 'NewWorldOffers').rows).toEqual([
      { icon: 'calendar', meta: '60 min', name: 'Guidance Call', body: 'One call.', price: '$120', href: '~/booking' },
      { icon: 'calendar', meta: '90 min', name: 'Deep Session', body: 'Longer.', price: 'From $180', href: '~/booking' },
      { icon: 'calendar', meta: '', name: 'Ask', body: '', price: '', href: '~/booking' },
    ])
    expect((find(s, 'booking', 'NewWorldBook').ways as unknown[]).length).toBe(3)
    for (const type of ['NewWorldGroups', 'NewWorldCalendar', 'NewWorldReviews', 'NewWorldTeam', 'NewWorldPlans', 'NewWorldOpenings', 'NewWorldPosts', 'NewWorldFaq']) {
      expect(find(s, 'home', type).rows, type).toEqual([])
    }
    expect(find(s, 'home', 'NewWorldGallery').images).toEqual([])
    expect(find(s, 'home', 'NewWorldWhere')).toMatchObject({ address: '1 Main St, Encinitas', phone: '555 0100', email: 'hi@harbor.io', hours: [{ day: 'Mon to Fri', time: '9am to 6pm, by appointment' }, { day: 'Sat', time: '10am to 1pm' }] })
    // The kit's own words stay flagged for the editor; the owner's do not.
    expect(find(s, 'home', 'NewWorldTools').sample).toBe(true)
    expect(find(s, 'home', 'NewWorldStory').sample).toBe(false)
  })

  it('falls back to the Space page hero words and cover when the site has no hero block', async () => {
    const kit = (await loadKit('new-world-general'))!
    const built = newWorldSiteFor({ kit, current: null, space, defaults })
    if (!built.ok) throw new Error(built.error)
    expect(find(built.snapshot, 'home', 'NewWorldHero')).toMatchObject({ title: 'Fine, but *not okay.*', lead: 'For when you look fine on paper.', image: 'https://cdn/cover.jpg', primaryLabel: 'Book an exploratory call' })
    expect(find(built.snapshot, 'home', 'NewWorldStats')).toMatchObject({ items: [], sample: true })
  })
})

describe('offeringPrice and hoursRowsOf', () => {
  it('say the price the way the offering does', () => {
    expect(offeringPrice({ title: 'a', price: 120 })).toBe('$120')
    expect(offeringPrice({ title: 'a', price: 99.5 })).toBe('$99.50')
    expect(offeringPrice({ title: 'a', price: 120, priceModel: 'from' })).toBe('From $120')
    expect(offeringPrice({ title: 'a', priceModel: 'free' })).toBe('Free')
    expect(offeringPrice({ title: 'a', price: 0 })).toBe('Free')
    expect(offeringPrice({ title: 'a', priceModel: 'contact' })).toBe('')
    expect(hoursRowsOf('Mon to Fri: 9am to 5pm\nBy appointment')).toEqual([{ day: 'Mon to Fri', time: '9am to 5pm' }, { day: 'By appointment', time: '' }])
  })
})

describe('newWorldSiteSql', () => {
  it('publishes through save_website_editor at the exported revision and records the theme key-scoped, in one transaction', () => {
    const sql = newWorldSiteSql({ spaceId: '9f58e07e-8912-4c3e-8551-d15b275dc768', revision: 68, snapshot: current, preferencesPatch: { megaTheme: { theme: 'new-world' } }, author: 'Claude', now: '2026-11-09T16:00:00.000Z' })
    expect(sql.startsWith('-- LIVE-2052')).toBe(true)
    expect(sql).toContain("public.save_website_editor('9f58e07e-8912-4c3e-8551-d15b275dc768'::uuid, 68, jsonb_build_object(")
    expect(sql).toContain("'revision', 69")
    expect(sql).toContain("where v.n <= 7")
    expect(sql).toContain("public.set_space_preferences('9f58e07e-8912-4c3e-8551-d15b275dc768'::uuid, $j${\"megaTheme\":{\"theme\":\"new-world\"}}$j$::jsonb)")
    expect(sql).toContain('raise exception')
    expect(sql.trim().endsWith('commit;')).toBe(true)
    expect(() => newWorldSiteSql({ spaceId: 'nope', revision: 1, snapshot: current, preferencesPatch: {} })).toThrow()
  })
})

// The generator (scripts/new-world-site-sql.mjs). Reads NEW_WORLD_SITE_INPUT, writes NEW_WORLD_SITE_OUT (SQL) and a
// sibling .snapshot.json for the render check. Skipped in an ordinary run.
describe.runIf(process.env.NEW_WORLD_SITE_INPUT && process.env.NEW_WORLD_SITE_OUT)('the generator', () => {
  it('writes the SQL for the exported Space', async () => {
    const input = JSON.parse(readFileSync(process.env.NEW_WORLD_SITE_INPUT!, 'utf8')) as { spaceId: string; revision: number; kit: string; accent: string; register: string; current: WebsiteSnapshot | null; preferences: unknown; space: NewWorldSiteSpace }
    const kit = await loadKit(input.kit)
    if (!kit) throw new Error(`unknown kit ${input.kit}`)
    const built = newWorldSiteFor({ kit, current: input.current, space: input.space, defaults })
    if (!built.ok) throw new Error(built.error)
    const plan = planMegaTheme(input.preferences, 'new-world') as { megaTheme?: unknown; theme?: unknown; siteStyle?: Record<string, unknown> }
    const preferencesPatch = { megaTheme: plan.megaTheme ?? null, theme: plan.theme ?? null, siteStyle: { ...(plan.siteStyle ?? {}), accent: input.accent, register: input.register } }
    const sql = newWorldSiteSql({ spaceId: input.spaceId, revision: input.revision, snapshot: built.snapshot, preferencesPatch })
    writeFileSync(process.env.NEW_WORLD_SITE_OUT!, sql)
    writeFileSync(process.env.NEW_WORLD_SITE_OUT!.replace(/\.sql$/, '') + '.snapshot.json', JSON.stringify({ snapshot: built.snapshot, preferencesPatch, carried: built.carried }, null, 1))
    expect(sql.length).toBeGreaterThan(1000)
  })
})
