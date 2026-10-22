import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { SiteChrome } from '@/components/sites/site-chrome'
import { MensworkPage } from '@/components/sites/menswork-page'
import { HouseBlock, HouseHero, type HouseBlockModel, type HouseHeroModel } from '@/components/sites/house-sections'
import { planMensworkPage, type MwBlock } from '@/lib/sites/menswork-page'
import type { MwLive } from '@/lib/sites/menswork-data'
import type { SiteLinkMap } from '@/lib/sites/house-theme'
import { BlockRender } from '@/lib/page-editor/block-render'
import { config } from '@/lib/page-editor/config'
import { categoryKeysForSurface } from '@/lib/page-editor/palette-scope'
import { TEMPLE_CSS } from '@/components/sites/temple-css'

vi.mock('@/components/sites/site-admin-gate', () => ({
  useSiteAdmin: () => true,
  SiteAdminOnly: ({ children }: { children: React.ReactNode }) => children,
}))

// THE TEMPLE SITE, RENDERED OFFLINE. The Temple skin is a stylesheet over the house sections and the site page
// sections (components/sites/site-chrome.tsx layers HOUSE_CSS, FREQUENCY_PAGE_CSS and TEMPLE_CSS), so this test
// renders the SAME tree the Next page draws one level down: SiteChrome with the Temple skin around the house
// Home (hero and every section kind, filled with Royal Temple's own copy from the design handoff), and around
// EVERY block the website surface offers, each on its own default props. It measures that each renders under
// the theme without throwing, and with TEMPLE_SHOTS_DIR set writes each as a standalone HTML file for the
// side-by-side render (scripts/probes/temple-shots.mjs).

const ORIGIN = 'https://frequency.example'
const NOW = new Date(Date.UTC(2026, 9, 22, 20))
const links: SiteLinkMap = { origin: ORIGIN, slug: 'royaltemple', siteBase: '', pages: ['home', 'gatherings'], contactHref: '/contact', bookHref: null, email: null }
const menu = [{ href: '/', label: 'The House' }, { href: '/gatherings', label: 'Gatherings' }, { href: '/membership', label: 'Membership' }, { href: '/contact', label: 'Visit' }]

const LOGO = '/sites/temple/textures/palm-fan.svg'

const hero: HouseHeroModel = {
  photo: '/sites/temple/textures/stucco-wash.svg',
  focus: '50% 50%',
  eyebrow: 'Vista, California · A community house',
  title: 'A house for *gathering.*',
  lede: 'Dinners, circles, music and shared work, in the same slots most weeks of the year. Come as a guest, or become part of the house.',
  cta: { href: '/gatherings', label: "See what's happening" },
  secondary: { href: '/membership', label: 'Membership' },
  pill: null,
  start: { eyebrow: 'Next at the house', name: 'Community Dinner', role: 'Sun Oct 25 · 5–7 PM', logo: null, body: 'Members come to every house gathering. Guests pay at the door.', cta: { href: '/gatherings', label: 'RSVP' } },
}

const blocks: HouseBlockModel[] = [
  { kind: 'steps', key: 's0', anchor: 'week', eyebrow: 'The standing week', title: 'Same slots, all year.', subtitle: null, steps: [
    { n: '1', title: 'Tuesday', body: 'Craft Night or Circles Night, 6 to 9 PM.' },
    { n: '2', title: 'Wednesday', body: 'Meld or Moon Circle.' },
    { n: '3', title: 'Sunday', body: 'Ecstatic Dance, Community Dinner, then a Concert.' },
  ] },
  { kind: 'sessions', key: 's1', anchor: 'sessions', eyebrow: 'Next at the house', title: "What's coming up.", cards: [
    { length: '2 hours', price: '$22', title: 'Community Dinner', body: 'A long table, shared plates and the people who made them.', cta: { href: '/gatherings', label: 'RSVP' } },
    { length: '3 hours', price: '$33', title: 'Circles Night', body: 'Fire, a circle and a question worth sitting with.', cta: { href: '/gatherings', label: 'RSVP' } },
    { length: '2 hours', price: '$25', title: 'Ecstatic Dance', body: 'Barefoot, no talking on the floor, all bodies welcome.', cta: { href: '/gatherings', label: 'RSVP' } },
  ] },
  { kind: 'story', key: 's2', anchor: 'retreat', eyebrow: 'Retreat & rental', title: 'Fridays and Saturdays are *held.*', image: '/sites/temple/textures/stucco-wash.svg', alt: '', body: ['A lawn for 120, an open table for 24, a studio under the sky and six rooms to stay in.', 'Ask about a date.'], pull: 'Come as a guest. Stay as part of the house.', facts: { eyebrow: null, title: null, items: [{ value: '120', label: 'standing on the lawn' }, { value: '24', label: 'seated at the Open Table' }, { value: '30', label: 'mats in the studio' }] } },
  { kind: 'community', key: 's3', anchor: 'membership', eyebrow: 'Membership', title: 'Follow, belong, hold.', body: 'Three rungs. Each one opens what the one below it could not.', button: { href: '/membership', label: 'Compare the rungs' }, quote: 'No one is kept out over money.', tiers: [
    { name: 'Temple Guest', description: 'Hear what is happening first.', price: 'Free', href: '/membership' },
    { name: 'Temple Member', description: 'Every house gathering, included.', price: '$44 / month', href: '/membership' },
    { name: 'Temple Guardian', description: 'Hold the house with us.', price: '$88 / month', href: '/membership' },
  ], note: 'Annual plans save two months.' },
  { kind: 'faq', key: 's4', anchor: 'questions', eyebrow: 'Questions', title: 'Before you come.', items: [
    { q: 'Is the address public?', a: ['The address comes with your RSVP.'] },
    { q: 'Do guests pay?', a: ['Guests pay at the door. Members are included.'] },
  ] },
  { kind: 'facts', key: 's5', eyebrow: 'The house', title: 'In numbers', items: [{ value: '6–7', label: 'gatherings a month' }, { value: '4', label: 'seasonal events' }, { value: '$44', label: 'membership, monthly' }] },
  { kind: 'inquiry', key: 's6', anchor: 'message', eyebrow: 'Visit', title: 'Write to the house.', body: ['For private events, retreat stays and guest hosting.'], form: { slug: 'royaltemple', showPhone: false, showMessage: true, next: null } },
  { kind: 'closing', key: 's7', anchor: 'contact', eyebrow: null, title: "Hear what's happening, first.", body: 'Event announcements from Royal Temple.', button: { href: '/contact', label: 'Follow' }, photo: null, contact: { title: null, address: 'Vista, California', mapsHref: null, hours: ['Quiet hours Monday'], phone: null, email: 'hello@example.org', links: [] } },
]

const live: MwLive = { events: [], circles: [], journeys: [] }
const metadata = { space: { identity: { name: 'Royal Temple', logoUrl: LOGO }, slug: 'royaltemple', tagline: 'A community house in Vista, California.', logoUrl: LOGO, events: [], series: [], reviews: { count: 0, average: 0, latest: [] } }, links }

const footer = {
  columns: [
    { title: 'Gatherings', links: [{ label: 'Community Dinner', href: '/gatherings' }, { label: 'Concert', href: '/gatherings' }, { label: 'Moon Circle', href: '/gatherings' }] },
    { title: 'The house', links: [{ label: 'Membership', href: '/membership' }, { label: 'The year', href: '/year' }] },
    { title: 'Visit', links: [{ label: 'Contact', href: '/contact' }, { label: 'Private events', href: '/contact' }] },
  ],
  blurb: 'A community house in Vista, California.',
  line: null,
  note: null,
  suffix: null,
}

function chrome(children: React.ReactNode, accent?: boolean) {
  void accent
  return (
    <SiteChrome
      brandName="Royal Temple"
      homeHref="/"
      links={menu}
      cta={{ href: '/membership', label: 'Become a member', external: false }}
      themeFonts
      skin={{ theme: 'temple', season: 'fall' }}
      logoUrl={LOGO}
      tagline="A community house in Vista, California."
      showBrandFooter
      footer={footer}
      admin={{ menu: [{ href: '/admin/editor', label: 'Website builder' }], console: `${ORIGIN}/spaces/royaltemple/manage/leadership` }}
    >
      {children}
    </SiteChrome>
  )
}

const websitePageTypes = () => {
  const cats = config.categories as Record<string, { components?: string[] }>
  return [...new Set([...(categoryKeysForSurface('website') ?? [])].flatMap((k) => cats[k]?.components ?? []))]
}

function page(blocksIn: MwBlock[], title: string) {
  const plan = planMensworkPage(blocksIn)
  return chrome(
    <MensworkPage
      blocks={blocksIn}
      plan={plan}
      live={live}
      links={links}
      origin={ORIGIN}
      pageTitle={title}
      now={NOW}
      renderOther={(b) => <BlockRender config={config} data={{ root: {}, content: [b] }} metadata={metadata} />}
    />,
  )
}

const HEAD = (title: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>html,body{margin:0}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.hidden{display:none}@media (min-width:768px){.md\\:block{display:block}.md\\:hidden{display:none}}</style></head><body>`

const FONT_VARS = "--font-tp-branch:Branch;--font-tp-marcellus:Marcellus;--font-tp-jost:Jost;--font-tp-cormorant:'Cormorant Garamond'"

const write = (dir: string, name: string, html: string) => writeFileSync(join(dir, `${name}.html`), `${HEAD(name)}<div style="${FONT_VARS}">${html}</div></body></html>`)

describe('the Temple site, rendered through the real chrome and sections', () => {
  const out = process.env.TEMPLE_SHOTS_DIR
  if (out) mkdirSync(out, { recursive: true })

  it('renders the house Home in the Temple skin: the hero, every section kind, the footer columns', () => {
    const html = renderToStaticMarkup(
      chrome(
        <>
          <HouseHero hero={hero} />
          {blocks.map((b, i) => (
            <HouseBlock key={b.key} block={b} first={i === 0} />
          ))}
        </>,
      ),
    )
    if (out) write(out, 'home', html)
    expect(html).toContain('data-house-theme="temple"')
    expect(html).toContain('tp-footer-ground')
    expect(html).toContain('hs-footer-top" data-columns=""')
    expect(html).toContain(TEMPLE_CSS.slice(0, 60))
    for (const s of ['A house for', 'Same slots, all year.', 'Follow, belong, hold.', 'Write to the house.', 'Temple Member', 'Is the address public?']) expect(html).toContain(s)
    // The Space's logo is drawn alone as the one-colour seal, header and footer.
    expect(html).toContain('hs-logo-image')
    expect(html).toContain('tp-footer-seal')
    expect(html).not.toMatch(/—/)
  })

  it('renders every block the website surface offers under the Temple skin', () => {
    const types = websitePageTypes()
    expect(types.length).toBeGreaterThan(40)
    const failures: string[] = []
    const all: string[] = []
    for (const type of types) {
      const component = (config.components as Record<string, { defaultProps?: Record<string, unknown> }>)[type]
      const props = { id: `b-${type}`, ...(component?.defaultProps ?? {}) }
      try {
        const html = renderToStaticMarkup(page([{ type, props }], type))
        if (!html.includes('data-house-theme="temple"')) failures.push(`${type}: not drawn inside the Temple root`)
        all.push(`<section data-block="${type}">${html}</section>`)
      } catch (err) {
        failures.push(`${type}: ${(err as Error).message.split('\n')[0]}`)
      }
    }
    expect(failures).toEqual([])
    if (out) write(out, 'blocks', all.join('\n'))
  })
})
