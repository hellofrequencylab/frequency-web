import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// DRIFT GUARD for the standard event layout (owner directive 2026-07-28: "Make this block layout the
// standard for All events. Change them all over to this layout and make it the standard template").
//
// The failure mode this pins is not a crash — it is a second event page quietly hand-rolling its own
// header and its own two-column grid because copying the JSX was easier than filling slots. That
// looks fine in review and only shows up months later as two events that no longer resemble each
// other. So the composition is asserted at the SOURCE level, the house drift-guard archetype
// (components/events/series-wiring.test.ts, lib/events/options.test.ts).

const TEMPLATE = 'components/templates/event-detail-template.tsx'
const template = readFileSync(TEMPLATE, 'utf8')
/** The template with prose stripped, so a comment that NAMES a banned pattern (this file's own rules
 *  are documented at the top of the template) can't fail the rule it is explaining. */
const templateCode = template.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '')

// Every surface that renders ONE event as a page. Operator consoles (manage / crm / settings / edit)
// are a different archetype (Dashboard / Studio, PAGE-FRAMEWORK §8.1) and are deliberately not here;
// cards, rows and rails are not layouts and are not here either.
// Loading skeletons are in here too: a skeleton IS a claim about the destination's shape, and a
// hand-rolled one drifts from the page it stands in for (both of these already had).
const EVENT_PAGES = [
  'app/(main)/events/[slug]/page.tsx',
  'app/discover/events/[slug]/page.tsx',
  'app/(main)/events/[slug]/loading.tsx',
  'app/discover/events/[slug]/loading.tsx',
] as const

describe('the standard exists and is a composition, not a fork', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    expect(template.length).toBeGreaterThan(2000)
    expect(template).toContain('export function EventDetailTemplate')
  })

  it('WRAPS DetailTemplate rather than re-declaring a header, an h1, or a divider', () => {
    expect(template).toContain("import { DetailTemplate } from './detail-template'")
    expect(template).toContain('<DetailTemplate')
    // The kit owns the heading and the hairline. A copy of either here is a second source of truth.
    expect(template).not.toContain('<h1')
    expect(template).not.toContain('PageAdminBar')
  })

  it('carries NO per-surface branch: a difference must be an absent slot', () => {
    // The whole point of the extraction. A `variant`/`isPublic`/`anonymous` knob is how one template
    // becomes two layouts wearing one name.
    for (const fork of ['isPublic', 'variant', 'anonymous', 'isDiscover', 'publicView']) {
      expect(templateCode).not.toMatch(new RegExp(`\\b${fork}\\b`))
    }
  })

  it('declares every identity slot it documents, and renders every slot it declares', () => {
    const iface = template.slice(
      template.indexOf('export interface EventIdentitySlots'),
      template.indexOf('export interface EventDetailTemplateProps'),
    )
    const slots = [...iface.matchAll(/^\s{2}(\w+)\?:/gm)].map((m) => m[1])
    // The arrangement, in reading order: lane A (the facts), lane B (where it belongs and to
    // whom), then the two full-width rows. `seriesRail` moved down on 2026-09-10 when the region
    // went from one narrow column to two lanes — it is a ROW of date chips, so it belongs under
    // both lanes at full width rather than mid-column where it wrapped into three rows.
    expect(slots).toEqual([
      'when',
      'where',
      'cadence',
      'nextDate',
      'belonging',
      'hostedBy',
      'credit',
      'seriesRail',
      'reward',
    ])
    // A slot added to the type but never rendered would silently swallow a page's content.
    for (const slot of slots) {
      expect(template).toContain(`{identity.${slot}}`)
    }
  })

  it('🔴 puts the identity region in the FULL-WIDTH slot, not the column beside the actions', () => {
    // The 2026-09-10 report. `subtitle` sits inside DetailTemplate's lockup flex row, so anything
    // passed there is capped at `content width - actions width` for its whole height; `meta` spans
    // the band. A regression here is silent — the page still renders, it just crams again.
    expect(templateCode).toContain('meta={')
    expect(templateCode, 'the identity region must not go back into the narrow column').not.toContain('subtitle={')
    // And the slot has to exist on the kit side, spanning the header rather than the lockup.
    const detail = readFileSync('components/templates/detail-template.tsx', 'utf8')
    expect(detail).toContain('meta?: React.ReactNode')
    expect(detail).toContain('{meta && <div className="mt-3">{meta}</div>}')
  })

  it('the two lanes are side by side from md, and each self-suppresses when empty', () => {
    // A surface that fills only one lane (the loading skeleton fills the facts) must get one
    // column, not a column and an empty gutter.
    expect(templateCode).toContain('md:grid-cols-2')
    expect(templateCode).toContain('hasFacts &&')
    expect(templateCode).toContain('hasBelonging &&')
  })
})

describe('the interior geometry cannot drift from the module engine', () => {
  // A public surface has no module engine (no setEventContext, no page_settings layout row), so the
  // template draws the grid itself. Those class strings are DUPLICATED from the `main-side` case of
  // TemplateGrid — importing page-modules.tsx would drag the widget registry and 20+ RSCs into a
  // public marketing route's module graph. Duplication is only safe if it is pinned, so it is pinned.
  const pageModules = readFileSync('components/widgets/page-modules.tsx', 'utf8')
  const MAIN_SIDE = [
    'grid gap-6 lg:grid-cols-5 lg:gap-8',
    '@container space-y-4 lg:col-span-3',
    '@container order-first space-y-4 lg:order-none lg:col-span-2',
  ]

  it('uses the exact class strings the module engine uses for main-side', () => {
    for (const cls of MAIN_SIDE) {
      expect(pageModules, `page-modules.tsx lost "${cls}" — update the template to match`).toContain(cls)
      expect(template, `the template lost "${cls}" — the two interiors have drifted`).toContain(cls)
    }
  })
})

describe.each(EVENT_PAGES)('%s composes the standard', (path) => {
  const source = readFileSync(path, 'utf8')

  it('renders through EventDetailTemplate', () => {
    expect(source).toContain('<EventDetailTemplate')
  })

  it('does not reach past the standard to DetailTemplate directly', () => {
    expect(source).not.toContain('<DetailTemplate')
    expect(source).not.toMatch(/import \{[^}]*\bDetailTemplate\b[^}]*\} from/)
  })

  it('hand-rolls no heading, no page frame, and no two-column grid of its own', () => {
    expect(source).not.toContain('<h1')
    // The interior split and the mobile-bar reservation belong to the template. A page writing
    // either one is the exact drift this guard exists to catch.
    expect(source).not.toContain('lg:grid-cols-')
    expect(source).not.toContain('lg:col-span-')
    expect(source).not.toContain('pb-24 lg:pb-0')
  })
})
