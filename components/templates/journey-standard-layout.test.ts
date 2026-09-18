// THE JOURNEY STANDARD IS A COMPOSITION, AND IT STAYS ONE.
//
// The sibling of event-standard-layout.test.ts, written for the same failure and in the same idiom:
// source-level string assertions, no rendering. The defect it guards is not hypothetical — both
// Journey surfaces had already hand-rolled the SAME interior grid, byte for byte, around a raw
// DetailTemplate. A layout that lives in two files is a layout that will disagree with itself.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const TEMPLATE = 'components/templates/journey-detail-template.tsx'
const template = readFileSync(TEMPLATE, 'utf8')

/** The template with prose stripped. Load-bearing: the file's own comments NAME the patterns this
 *  guard bans, so asserting against the raw source would fail on the explanation of the ban. */
const templateCode = template.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '')

/** Every surface that must compose the standard. Both are real pages; there are no Journey detail
 *  loading skeletons today, so unlike the event set this list has no `loading.tsx` entries. Add one
 *  here the day a skeleton appears — a skeleton IS a claim about the destination's shape. */
const JOURNEY_PAGES = [
  'app/(main)/journeys/[slug]/page.tsx',
  'app/discover/journeys/[slug]/page.tsx',
] as const

describe('the standard exists and is a composition, not a fork', () => {
  it('is a real file with a real export (non-vacuity control)', () => {
    expect(template.length).toBeGreaterThan(2000)
    expect(template).toContain('export function JourneyDetailTemplate')
  })

  it('wraps DetailTemplate rather than re-declaring what it owns', () => {
    expect(template).toContain("import { DetailTemplate } from './detail-template'")
    expect(template).toContain('<DetailTemplate')
    // The kit owns the h1 and the hairline. A composition that re-declares either has forked.
    expect(templateCode).not.toContain('<h1')
    expect(templateCode).not.toContain('PageAdminBar')
  })

  it('carries no per-surface branch', () => {
    // A public page has no Manage button because it omits `actions`, never because the template
    // knows who is looking.
    for (const fork of ['isPublic', 'variant', 'anonymous', 'isDiscover', 'publicView']) {
      expect(templateCode).not.toMatch(new RegExp(`\\b${fork}\\b`))
    }
  })

  it('renders every identity slot it declares, in declaration order', () => {
    const iface = template.slice(
      template.indexOf('export interface JourneyIdentitySlots'),
      template.indexOf('export interface JourneyDetailTemplateProps'),
    )
    const slots = [...iface.matchAll(/^\s{2}(\w+)\?:/gm)].map((m) => m[1])
    expect(slots).toEqual(['promise', 'shape', 'meets', 'guide', 'belonging', 'reward', 'aside'])
    for (const slot of slots) expect(template).toContain(`{identity.${slot}}`)
  })

  it('puts the identity region in the full-width slot, not the narrow column', () => {
    expect(templateCode).toContain('meta={')
    expect(templateCode).not.toContain('subtitle={')
    const kit = readFileSync('components/templates/detail-template.tsx', 'utf8')
    expect(kit).toContain('meta?: React.ReactNode')
    expect(kit).toContain('{meta && <div className="mt-3">{meta}</div>}')
  })

  it('reads as one column in groups that self-suppress', () => {
    expect(templateCode).not.toContain('md:grid-cols-2')
    expect(templateCode).toContain('hasOffer &&')
    expect(templateCode).toContain('hasGathering &&')
    // The 2:1 gap ratio IS the grouping mechanism: three things, not six lines.
    expect(templateCode).toContain('space-y-3 text-body-sm text-muted')
    expect(templateCode).toContain('<div className="space-y-1.5">')
  })

  it('rides the status chips on the cover, with a slot-test fallback', () => {
    expect(templateCode).toContain('cover !== undefined && badges')
    expect(templateCode).toContain('absolute right-3 top-3')
    expect(templateCode).toContain('badges={cover !== undefined && badges ? undefined : badges}')
  })
})

describe('the interior geometry cannot drift from the module engine', () => {
  const pageModules = readFileSync('components/widgets/page-modules.tsx', 'utf8')
  const MAIN_SIDE = [
    'grid gap-6 lg:grid-cols-5 lg:gap-8',
    '@container space-y-4 lg:col-span-3',
    '@container order-first space-y-4 lg:order-none lg:col-span-2',
  ]

  it('uses the exact class strings the module engine uses for main-side', () => {
    for (const cls of MAIN_SIDE) {
      expect(pageModules, `page-modules.tsx lost "${cls}" — update the template to match`).toContain(cls)
      expect(template, `the template lost "${cls}" — the interiors have drifted`).toContain(cls)
    }
  })

  it('shares that geometry with the event standard', () => {
    // Three interiors, one grid. If any of them is edited, all three must be.
    const eventTemplate = readFileSync('components/templates/event-detail-template.tsx', 'utf8')
    for (const cls of MAIN_SIDE) expect(eventTemplate).toContain(cls)
  })

  it('adds exactly ONE thing the event interior does not: a sticky side column', () => {
    // ⚠️ The single deliberate difference, asserted so it reads as a decision rather than drift.
    // An event's side column is a short stack of facts; a Journey's is a buy box beside long sales
    // copy, and a buy control that scrolls away is the one thing the checkout research agrees on.
    expect(template).toContain('<div className="lg:sticky lg:top-6">{side}</div>')
    const eventTemplate = readFileSync('components/templates/event-detail-template.tsx', 'utf8')
    expect(eventTemplate).not.toContain('lg:sticky lg:top-6')
  })

  it('does not reintroduce the hand-rolled rail it replaced', () => {
    // The literal string both pages carried before this template existed. Asserted against the
    // COMMENT-STRIPPED source: the template's own header quotes that string to explain what it
    // replaced, so the raw file legitimately contains it.
    expect(templateCode).not.toContain('lg:grid-cols-[minmax(0,1fr)_20rem]')
  })
})

describe('the template is reachable through the house path', () => {
  it('is exported from the kit barrel', () => {
    // Every consumer imports from '@/components/templates'; check:templates matches the TAG, not
    // the import, so a missing export fails nowhere else.
    const barrel = readFileSync('components/templates/index.ts', 'utf8')
    expect(barrel).toContain("from './journey-detail-template'")
    expect(barrel).toContain('JourneyDetailTemplate')
  })

  it('is registered as a shell the template audit recognises', () => {
    const gate = readFileSync('scripts/check-templates.mjs', 'utf8')
    expect(gate).toContain("'JourneyDetailTemplate'")
  })
})

describe.each(JOURNEY_PAGES)('%s composes the standard', (path) => {
  const source = readFileSync(path, 'utf8')

  it('composes it', () => {
    expect(source).toContain('<JourneyDetailTemplate')
  })

  it('does not reach past it to the kit shell', () => {
    expect(source).not.toContain('<DetailTemplate')
    expect(source).not.toMatch(/import \{[^}]*\bDetailTemplate\b[^}]*\} from/)
  })

  it('hand-rolls no header and no layout of its own', () => {
    expect(source).not.toContain('<h1')
    expect(source).not.toContain('lg:grid-cols-')
    expect(source).not.toContain('lg:col-span-')
  })
})
