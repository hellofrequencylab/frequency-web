// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { findA11yViolations, formatViolations } from './axe'
import { NearbyMapHeader } from '@/components/nearby/nearby-map-header'
import type { MapPin } from '@/components/maps/types'

// THE ONE AUTOMATED CHECK /nearby HAS (ADR-1029, re-aimed at the header band by ADR-1032).
//
// ── WHY THIS FILE EXISTS AND NOT A PLAYWRIGHT SURFACE ──────────────────────────────────────────
//
// Around You is a primary member surface — first item under COMMUNITY in the rail — and it had
// ZERO automated coverage of its rendered output. Not a visual baseline, not an axe audit, not a
// render test. It is also the most layout-dense page in the app: a header band carrying a live map
// behind its scrim, a counts line on the divider row, and a rail of cards beside the Dispatch feed.
// All of that shipped on consecutive PRs guarded by nothing but a human looking at a screenshot.
//
// IT IS NOT A SUBSTITUTE FOR THE PLAYWRIGHT SURFACE — it is the half that needs no browser.
// `/nearby` is auth-walled twice over: `proxy.ts` redirects a signed-out visitor to /sign-in, and
// the page itself calls `notFound()` with no user. So an `audience: 'anon'` entry in
// test/e2e/surfaces.ts is worse than nothing — `publicSurfaces()` filters against the same
// PROTECTED_PATHS list and would drop it, and if it survived it would land on /sign-in and skip.
// A `member` entry is the correct one and ships alongside this file.
//
// What this file covers is the half that needs no browser at all, landing on the ALREADY-REQUIRED
// `test` check. jsdom cannot compute layout, so it cannot judge the band's height or the scrim's
// contrast — those stay uncovered and honestly so (see the SCOPE note in ./axe.ts). What it CAN
// judge is the structural half, which is the half that silently breaks: the band carries the page's
// heading, the map behind it stays out of the accessibility tree, the ONE control says what it
// does, the legend is a real list, every swatch is decorative rather than an unlabelled graphic,
// and the empty case still says what a member can do about it.
//
// ⚠️ THE MAP ITSELF DOES NOT RENDER HERE, and that is not a gap this file can close. Both engines
// are loaded through `next/dynamic` with `ssr: false` (components/maps/map-canvas.tsx), so a
// server render produces the band and its controls with an empty map container inside. The engines'
// own behaviour is guarded structurally instead, by components/maps/map-capabilities.test.ts.

const HEADING = 'Around You'
const SUB = 'Everything happening around you.'

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

const band = (pins: MapPin[]) => (
  <NearbyMapHeader pins={pins} eyebrow="Community" title={HEADING} subtitle={SUB} />
)

const CASES: [name: string, pins: MapPin[]][] = [
  ['no pins at all, so the band keeps its gradient and drops the control', []],
  ['one plain event pin', [pin()]],
  ['every layer, with a repeating pin and two approximate ones', ALL_LAYERS],
]

describe('the Around You header band is accessible', () => {
  for (const [name, pins] of CASES) {
    it(`has no axe violations: ${name}`, async () => {
      const found = await findA11yViolations(band(pins))
      expect(found, formatViolations(found)).toEqual([])
    })
  }
})

describe('the band carries the page heading, whatever it is showing', () => {
  it('renders the title as the h1 and the description under it', async () => {
    const { document: doc } = await render(band([pin()]))
    expect(doc.querySelector('h1')?.textContent).toContain(HEADING)
    expect(doc.body.textContent).toContain(SUB)
  })

  it('still carries the heading when there is nothing to plot', async () => {
    const { document: doc } = await render(band([]))
    expect(doc.querySelector('h1')?.textContent).toContain(HEADING)
    // A page whose header quietly loses its heading because a data read came back empty is the
    // failure this asserts against: the map is the band's BACKGROUND, not its content.
    expect(doc.body.textContent).toContain('Nothing on the map yet')
  })
})

describe('the map behind the scrim is a backdrop, not a second interface', () => {
  it('is hidden from the accessibility tree and takes no pointer', async () => {
    // A screen reader walking a marker tree behind a scrim hears a list of places with no way to
    // act on them, and a member dragging the header instead of scrolling the page is a worse map
    // than no map. The REAL map is what the button opens.
    const { document: doc } = await render(band(ALL_LAYERS))
    const backdrop = doc.querySelector('[aria-hidden].pointer-events-none')
    expect(backdrop).not.toBeNull()
  })

  it('offers exactly one control, and it says what it does', async () => {
    const { document: doc } = await render(band(ALL_LAYERS))
    const buttons = Array.from(doc.querySelectorAll('button')).map((b) => b.textContent?.trim())
    expect(buttons).toEqual(['View the map'])
  })

  it('🔴 offers no control at all with nothing to plot, so the popup is never a door onto an empty view', async () => {
    const { document: doc } = await render(band([]))
    expect(doc.querySelectorAll('button').length).toBe(0)
  })
})

describe('the legend describes THIS map, not the vocabulary in general', () => {
  it('lists a row per layer present and no others', async () => {
    const { document: doc } = await render(band(ALL_LAYERS))
    const items = Array.from(doc.querySelectorAll('li')).map((li) => li.textContent?.trim())
    expect(items).toContain('Events')
    expect(items).toContain('Circles')
    expect(items).toContain('Spaces')
  })

  it('🔴 shows no legend row for a layer with no pins, which would read as a broken filter', async () => {
    const { document: doc } = await render(band([pin()]))
    const items = Array.from(doc.querySelectorAll('li')).map((li) => li.textContent?.trim())
    expect(items).toContain('Events')
    expect(items).not.toContain('Circles')
    expect(items).not.toContain('Spaces')
  })

  it('renders each swatch as decorative, so a screen reader hears the word and not a stray graphic', async () => {
    const { document: doc } = await render(band(ALL_LAYERS))
    const swatches = Array.from(doc.querySelectorAll('li > span[aria-hidden]'))
    expect(swatches.length).toBe(3)
  })
})

describe('the map tells everyone what the popups only tell one person', () => {
  it('says a number on a pin means more than one date', async () => {
    const { document: doc } = await render(band([pin({ moreCount: 7 })]))
    expect(doc.body.textContent).toContain('more than one date')
  })

  it('🔴 says some pins are an area, because a coarsened dot looks exactly as precise as a real one', async () => {
    const { document: doc } = await render(band([pin({ approximate: true })]))
    expect(doc.body.textContent).toContain('general area')
  })

  it('says neither when neither applies, so the line is never noise', async () => {
    const { document: doc } = await render(band([pin()]))
    expect(doc.body.textContent).not.toContain('more than one date')
    expect(doc.body.textContent).not.toContain('general area')
  })
})

/** Render to the jsdom document and hand back the document, the same way ./axe.ts does. Kept local
 *  and tiny rather than exported from the harness: the harness's job is axe, and a second export
 *  from it would invite callers to render twice per assertion. */
async function render(ui: React.ReactElement): Promise<{ document: Document }> {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(ui)
  document.body.innerHTML = ''
  document.body.appendChild(host)
  return { document }
}
