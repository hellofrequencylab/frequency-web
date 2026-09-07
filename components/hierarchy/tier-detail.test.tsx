import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  TierDetailBody,
  metaLine,
  tierCrumbs,
  tierDetailHeader,
  type TierDetailView,
} from './tier-detail'

// HYG-046. The Hub and Nexus detail pages were hand-maintained twins that had drifted; this file
// pins the SHARED rendering they now both go through, so a change made for one tier is provably
// made for both. The companion source-shape test (tier-detail.pages.test.ts) asserts neither page
// has grown its own copy back, and lib/hierarchy/tier-detail.test.ts covers the loading half.

/** A Hub-shaped view: children with a type chip and a seat cap. */
const HUB: TierDetailView = {
  kind: 'hub',
  id: 'hub-1',
  name: 'Riverside',
  slug: 'riverside',
  status: 'active',
  href: '/hubs/riverside',
  caps: ['hub.manage'],
  canManage: true,
  saveName: null,
  crumbs: [{ label: 'North' }, { label: 'Riverside' }],
  lead: { role: 'Guide', name: 'Ada Lovelace', handle: 'ada' },
  summary: '12 members across 2 / 5 circles',
  showsInsight: true,
  totalMembers: 12,
  childLabel: 'Circles',
  childNoun: 'circle',
  rows: [
    {
      id: 'c1',
      name: 'Tuesday Sit',
      href: '/circles/tuesday-sit',
      status: 'active',
      chip: 'in-person',
      meta: 'Host: Grace Hopper',
      capacity: { count: 8, cap: 8 },
    },
  ],
}

/** A Nexus-shaped view: children with no chip and no cap, plus the tier's own capacity bar. */
const NEXUS: TierDetailView = {
  kind: 'nexus',
  id: 'nexus-1',
  name: 'North',
  slug: 'north',
  status: 'active',
  href: '/nexuses/north',
  caps: ['nexus.manage'],
  canManage: true,
  saveName: null,
  crumbs: [{ label: 'North' }],
  lead: { role: 'Mentor', name: 'Ada Lovelace', handle: 'ada' },
  summary: '40 / 100 members · 3 hubs',
  capacity: { value: 40, max: 100, label: '40 of 100 members' },
  showsInsight: true,
  totalMembers: 40,
  childLabel: 'Hubs',
  childNoun: 'hub',
  rows: [
    { id: 'h1', name: 'Riverside', href: '/hubs/riverside', status: 'active', meta: 'Guide: Ada' },
  ],
}

const body = (view: TierDetailView) => renderToStaticMarkup(<TierDetailBody view={view} />)
const node = (n: React.ReactNode) => renderToStaticMarkup(<>{n}</>)

describe('metaLine — a separator is earned by a part on each side', () => {
  it('joins the parts it was given', () => {
    expect(metaLine('Guide: Ada', '2 circles · 9 members')).toBe('Guide: Ada · 2 circles · 9 members')
  })

  // The exact defect on the Nexus page before the extraction: a Hub with no Guide rendered its
  // meta line starting with a bare "·".
  it('never leads with a separator when the first part is absent', () => {
    const line = metaLine(null, '2 circles · 9 members')
    expect(line).toBe('2 circles · 9 members')
    expect(line?.startsWith('·')).toBe(false)
  })

  it('collapses to null when every part is absent', () => {
    expect(metaLine(null, undefined, false, '')).toBeNull()
  })
})

describe('tierCrumbs — the rungs the entity does not have are dropped', () => {
  it('keeps strings, keeps links, and drops the empty rungs', () => {
    expect(
      tierCrumbs('Cascadia', undefined, { label: 'North', href: '/nexuses/north' }, 'Riverside')
    ).toEqual([
      { label: 'Cascadia' },
      { label: 'North', href: '/nexuses/north' },
      { label: 'Riverside' },
    ])
  })
})

describe('TierDetailBody — one grammar for both tiers', () => {
  it('gives the Hub and the Nexus child rows the SAME row shell', () => {
    // The drift this replaces: the Hub row wrapped its name line and the Nexus row did not.
    const rowClass = (html: string) => html.match(/<a class="([^"]*group[^"]*)"/)?.[1]
    expect(rowClass(body(HUB))).toBeTruthy()
    expect(rowClass(body(NEXUS))).toBe(rowClass(body(HUB)))
    expect(body(HUB)).toContain('flex-wrap')
    expect(body(NEXUS)).toContain('flex-wrap')
  })

  it('renders the optional row parts only for the tier that has them', () => {
    const hub = body(HUB)
    expect(hub).toContain('in-person')
    expect(hub).toContain('8 / 8')
    expect(hub).toContain('8 of 8 seats taken')

    const nexus = body(NEXUS)
    expect(nexus).toContain('Guide: Ada')
    expect(nexus).not.toContain('seats taken')
  })

  it('derives the Insight band from the tier, not from a hand-written copy', () => {
    expect(body(HUB)).toContain('Avg per circle')
    expect(body(NEXUS)).toContain('Avg per hub')
    // Members · <children> · average, with the average floored at 0 rather than NaN.
    expect(body({ ...HUB, rows: [], totalMembers: 0 })).toContain('Avg per circle')
    expect(body({ ...HUB, rows: [], totalMembers: 0 })).not.toContain('NaN')
  })

  it('hides the Insight band from a viewer who does not lead the scope (ADR-225)', () => {
    expect(body({ ...HUB, showsInsight: false })).not.toContain('Insight')
    expect(body({ ...NEXUS, showsInsight: false })).not.toContain('Insight')
  })

  it('derives the empty state from the child label', () => {
    expect(body({ ...HUB, rows: [] })).toContain('No circles yet.')
    expect(body({ ...NEXUS, rows: [] })).toContain('No hubs yet.')
  })
})

describe('tierDetailHeader — the identity slots both tiers share', () => {
  it('names the tier in both operator entries and points Manage at the tier', () => {
    const hub = node(tierDetailHeader(HUB).actions)
    expect(hub).toContain('Edit hub')
    expect(hub).toContain('Manage hub')
    expect(hub).toContain('/hubs/riverside/manage')

    const nexus = node(tierDetailHeader(NEXUS).actions)
    expect(nexus).toContain('Edit nexus')
    expect(nexus).toContain('Manage nexus')
    expect(nexus).toContain('/nexuses/north/manage')
  })

  it('shows no operator entries to a viewer who cannot manage the tier', () => {
    expect(tierDetailHeader({ ...HUB, canManage: false }).actions).toBeUndefined()
    expect(tierDetailHeader({ ...NEXUS, canManage: false }).actions).toBeUndefined()
  })

  it('leaves the title as plain text when the viewer cannot rename it', () => {
    expect(tierDetailHeader({ ...HUB, canManage: false, saveName: null }).title).toBe('Riverside')
  })

  it('renders the steward under whichever name that tier gives the role', () => {
    expect(node(tierDetailHeader(HUB).subtitle)).toContain('Guide:')
    expect(node(tierDetailHeader(NEXUS).subtitle)).toContain('Mentor:')
    expect(node(tierDetailHeader(HUB).subtitle)).toContain('/people/ada')
  })

  it('draws the tier capacity bar only for a tier that carries a cap', () => {
    expect(node(tierDetailHeader(NEXUS).subtitle)).toContain('40 of 100 members')
    expect(node(tierDetailHeader(HUB).subtitle)).not.toContain('aria-valuenow')
  })
})
