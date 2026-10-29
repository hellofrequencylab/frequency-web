import { describe, it, expect } from 'vitest'
import {
  PROGRAMS_CAP,
  programsOptIn,
  programsOptInFromGrid,
  shapePrograms,
  type CircleRow,
  type PlanRow,
  type SpaceRow,
} from './programs.shared'

const ROOT = 'root-space'
const circle = (o: Partial<CircleRow> = {}): CircleRow => ({
  id: 'c1', name: 'Dawn Walkers', slug: 'dawn-walkers', unlisted: false, access: 'open', status: 'active', space_id: ROOT, ...o,
})
const space = (o: Partial<SpaceRow> = {}): SpaceRow => ({
  id: 's1', name: 'Harbor Studio', slug: 'harbor-studio', visibility: 'network', status: 'active', network_connected: true, type: 'studio', ...o,
})
const plan = (o: Partial<PlanRow> = {}): PlanRow => ({
  id: 'j1', title: 'Thirty Days of Sitting', slug: 'thirty-days', visibility: 'public', status: 'approved',
  published_at: '2026-01-01T00:00:00Z', space_id: ROOT, ongoing: false, ...o,
})
const shape = (raw: Partial<Parameters<typeof shapePrograms>[0]>) =>
  shapePrograms({ circles: [], spaces: [], journeys: [], ...raw }, ROOT)

describe('opt-in', () => {
  it('is off by default and for anything that is not a real true', () => {
    expect(programsOptIn(undefined)).toEqual({ circles: false, journeys: false, spaces: false })
    expect(programsOptIn({ showCircles: 'true', showSpaces: 1 })).toEqual({ circles: false, journeys: false, spaces: false })
    expect(programsOptIn({ showCircles: true })).toEqual({ circles: true, journeys: false, spaces: false })
  })

  it('unions the switches across every placement in a saved grid', () => {
    const grid = {
      content: { memberPrograms: { showCircles: true } },
      nodes: { rows: [{ cells: [[{ type: 'memberPrograms', content: { showSpaces: true } }, { type: 'text', content: { showJourneys: true } }]] }] },
    }
    expect(programsOptInFromGrid(grid)).toEqual({ circles: true, journeys: false, spaces: true })
    expect(programsOptInFromGrid(null)).toEqual({ circles: false, journeys: false, spaces: false })
  })

  it('ignores a hidden placement', () => {
    const grid = { nodes: { rows: [{ cells: [[{ type: 'memberPrograms', hidden: true, content: { showCircles: true } }]] }] } }
    expect(programsOptInFromGrid(grid).circles).toBe(false)
  })
})

describe('privacy', () => {
  it('drops Circles that are unlisted, closed, draft or inside a private Space', () => {
    const out = shape({
      circles: [
        circle({ id: 'ok' }),
        circle({ id: 'unlisted', unlisted: true }),
        circle({ id: 'closed', access: 'invite' }),
        circle({ id: 'tier', access: 'tier' }),
        circle({ id: 'draft', status: 'draft' }),
        circle({ id: 'walled', space_id: 'private-space' }),
        null,
      ],
    })
    expect(out.circles.map((c) => c.id)).toEqual(['ok'])
  })

  it('drops Spaces that are private, unlisted, unconnected, inactive or the root', () => {
    const out = shape({
      spaces: [
        space({ id: 'ok' }),
        space({ id: 'private', visibility: 'private' }),
        space({ id: 'unlisted', visibility: 'unlisted' }),
        space({ id: 'offnet', network_connected: false }),
        space({ id: 'paused', status: 'paused' }),
        space({ id: 'root', type: 'root' }),
      ],
    })
    expect(out.spaces.map((s) => s.id)).toEqual(['ok'])
  })

  it('drops Journeys that are not public, approved and published', () => {
    const out = shape({
      journeys: [
        { plan: plan({ id: 'ok' }), completed_at: null },
        { plan: plan({ id: 'private', visibility: 'private' }), completed_at: null },
        { plan: plan({ id: 'review', status: 'pending' }), completed_at: null },
        { plan: plan({ id: 'unpublished', published_at: null }), completed_at: null },
        { plan: plan({ id: 'walled', space_id: 'private-space' }), completed_at: null },
        { plan: null, completed_at: null },
      ],
    })
    expect(out.journeys.map((j) => j.id)).toEqual(['ok'])
  })

  it('carries only the allowlisted fields, no counts or people', () => {
    const out = shape({ circles: [circle()], spaces: [space()], journeys: [{ plan: plan(), completed_at: null }] })
    expect(Object.keys(out.circles[0]!).sort()).toEqual(['href', 'id', 'name'])
    expect(Object.keys(out.spaces[0]!).sort()).toEqual(['href', 'id', 'name'])
    expect(Object.keys(out.journeys[0]!).sort()).toEqual(['finished', 'href', 'id', 'name'])
  })
})

describe('shape', () => {
  it('caps each kind', () => {
    const many = Array.from({ length: 10 }, (_, i) => circle({ id: `c${i}`, slug: `c${i}` }))
    expect(shape({ circles: many }).circles).toHaveLength(PROGRAMS_CAP)
  })

  it('marks finished Journeys, never an ongoing one, and lists the ones in progress first', () => {
    const out = shape({
      journeys: [
        { plan: plan({ id: 'done' }), completed_at: '2026-02-01T00:00:00Z' },
        { plan: plan({ id: 'now', slug: 'now' }), completed_at: null },
        { plan: plan({ id: 'yearly', slug: 'yearly', ongoing: true }), completed_at: '2026-02-01T00:00:00Z' },
      ],
    })
    expect(out.journeys.map((j) => [j.id, j.finished])).toEqual([['now', false], ['yearly', false], ['done', true]])
  })

  it('de-duplicates', () => {
    expect(shape({ circles: [circle(), circle()] }).circles).toHaveLength(1)
  })
})
