// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { findA11yViolations, formatViolations } from './axe'
import { NearbyMap } from '@/components/nearby/nearby-map'
import type { MapPin } from '@/components/maps/types'

// THE ONE AUTOMATED CHECK /nearby HAS (ADR-1029).
//
// ── WHY THIS FILE EXISTS AND NOT A PLAYWRIGHT SURFACE ──────────────────────────────────────────
//
// Around You is a primary member surface — first item under COMMUNITY in the rail — and it had
// ZERO automated coverage of its rendered output. Not a visual baseline, not an axe audit, not a
// render test. It is also the most layout-dense page in the app: a header whose divider row carries
// a counts line, a two-column band, a map pinned to an aspect ratio, and a card grid that has to
// stay height-matched to it. All of that shipped on three consecutive PRs guarded by nothing but a
// human looking at a screenshot.
//
// 🔴 IT CANNOT BE COVERED BY THE PLAYWRIGHT SUITE TODAY, and not for a reason a test can fix.
// `/nearby` is auth-walled twice over — `proxy.ts` redirects a signed-out visitor to /sign-in, and
// the page itself calls `notFound()` with no user. So an `audience: 'anon'` entry in
// test/e2e/surfaces.ts is worse than nothing: `publicSurfaces()` filters against the same
// PROTECTED_PATHS list and would drop it, and if it survived it would land on /sign-in and skip.
// A `member` entry is correct and is added alongside this file, but it produces permanent SKIPS
// until the seeded beta account and its three repo secrets exist (UX-MATURITY-PLAN lift 6a, an
// owner action). A suite that skips green is the thing this repo keeps getting bitten by.
//
// So: the half that needs no browser and no credential, landing on the ALREADY-REQUIRED `test`
// check. jsdom cannot compute layout, so it cannot judge the aspect ratio or the height match —
// those stay uncovered and honestly so (see the SCOPE note in ./axe.ts). What it CAN judge is the
// structural half, which is the half that silently breaks: the map band is a named region, the
// legend is a real list, every swatch is decorative rather than an unlabelled graphic, and the
// empty state is announced.

const pin = (over: Partial<MapPin> = {}): MapPin => ({
  id: 'event:1',
  lat: 33.19,
  lng: -117.18,
  kind: 'event',
  title: 'Meld - Community Cowork',
  subtitle: 'Wed, Aug 19 · and 7 more dates',
  detail: 'Vista, CA',
  href: '/events/meld',
  hrefLabel: 'See the event and its dates',
  label: 'Meld - Community Cowork',
  ...over,
})

/** Every layer at once, plus the two qualified states, because the legend and the note under it are
 *  both derived from the pin set and are the parts that go stale silently. */
const ALL_LAYERS: MapPin[] = [
  pin({ moreCount: 7, approximate: true, badge: 'RSVP for address' }),
  pin({ id: 'circle:1', kind: 'circle', title: 'Meld Coworking - Royal Temple', subtitle: '1 member', detail: 'Vista', href: '/circles/meld' }),
  pin({ id: 'space:1', kind: 'space', title: 'Royal Temple', subtitle: 'A room for the work', detail: 'Vista, CA', href: '/spaces/royaltemple', approximate: true }),
]

const CASES: [name: string, pins: MapPin[]][] = [
  ['no pins at all, so the empty state renders', []],
  ['one plain event pin', [pin()]],
  ['every layer, with a repeating pin and two approximate ones', ALL_LAYERS],
]

describe('the Around You map band is accessible', () => {
  for (const [name, pins] of CASES) {
    it(`has no axe violations: ${name}`, async () => {
      const found = await findA11yViolations(<NearbyMap pins={pins} />)
      expect(found, formatViolations(found)).toEqual([])
    })
  }
})

describe('the band names itself, whatever it is showing', () => {
  it('is a region labelled by the heading a sighted member already reads', async () => {
    // `aria-labelledby` pointing at SectionHeader's own `id`, so the spoken name and the seen name
    // are the same string and cannot drift apart.
    const { document: doc } = await render(<NearbyMap pins={[pin()]} />)
    const section = doc.querySelector('section[aria-labelledby]')
    expect(section).not.toBeNull()
    const labelId = section!.getAttribute('aria-labelledby')!
    expect(doc.getElementById(labelId)?.textContent).toContain('On the map')
  })

  it('names itself the same way when it is empty', async () => {
    const { document: doc } = await render(<NearbyMap pins={[]} />)
    expect(doc.querySelector('section[aria-labelledby]')).not.toBeNull()
    expect(doc.body.textContent).toContain('Nothing on the map yet')
  })
})

describe('the legend describes THIS map, not the vocabulary in general', () => {
  it('lists a row per layer present and no others', async () => {
    const { document: doc } = await render(<NearbyMap pins={ALL_LAYERS} />)
    const items = Array.from(doc.querySelectorAll('li')).map((li) => li.textContent?.trim())
    expect(items).toContain('Events')
    expect(items).toContain('Circles')
    expect(items).toContain('Spaces')
  })

  it('🔴 shows no legend row for a layer with no pins, which would read as a broken filter', async () => {
    const { document: doc } = await render(<NearbyMap pins={[pin()]} />)
    const items = Array.from(doc.querySelectorAll('li')).map((li) => li.textContent?.trim())
    expect(items).toContain('Events')
    expect(items).not.toContain('Circles')
    expect(items).not.toContain('Spaces')
  })

  it('renders each swatch as decorative, so a screen reader hears the word and not a stray graphic', async () => {
    const { document: doc } = await render(<NearbyMap pins={ALL_LAYERS} />)
    const swatches = Array.from(doc.querySelectorAll('li > span[aria-hidden]'))
    expect(swatches.length).toBe(3)
  })
})

describe('the map tells everyone what the popups only tell one person', () => {
  it('says a number on a pin means more than one date', async () => {
    const { document: doc } = await render(<NearbyMap pins={[pin({ moreCount: 7 })]} />)
    expect(doc.body.textContent).toContain('more than one date')
  })

  it('🔴 says some pins are an area, because a coarsened dot looks exactly as precise as a real one', async () => {
    const { document: doc } = await render(<NearbyMap pins={[pin({ approximate: true })]} />)
    expect(doc.body.textContent).toContain('general area')
  })

  it('says neither when neither applies, so the line is never noise', async () => {
    const { document: doc } = await render(<NearbyMap pins={[pin()]} />)
    expect(doc.body.textContent).not.toContain('more than one date')
    expect(doc.body.textContent).not.toContain('general area')
  })
})

/** Render to the jsdom document and hand back the document, the same way ./axe.ts does. Kept local
 *  and tiny rather than exported from the harness: the harness's job is axe, and a second export
 *  from it would invite callers to render twice per assertion. */
async function render(ui: React.ReactElement): Promise<{ document: Document }> {
  const { renderToStaticMarkup } = await import('react-dom/server')
  document.body.innerHTML = renderToStaticMarkup(ui)
  return { document }
}
