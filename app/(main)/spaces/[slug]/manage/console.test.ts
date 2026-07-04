import { describe, it, expect } from 'vitest'
import {
  hrefForSurface,
  groupForSurface,
  isSuggestedByMode,
  orderWithinGroupByEmphasis,
} from './console'
import { SPACE_SURFACES, spaceSurfacesFor, type SpaceSurface } from '@/lib/admin/entities/registry'
import type { SpaceFunctionKey } from '@/lib/spaces/functions'

// The console section links must each open their OWN editor, never bounce back to /manage. The
// /settings INDEX redirects every console type to /manage (isConsoleSpaceType), so any section href
// pointed at the bare index would loop /settings -> /manage -> the console. This is the regression
// that broke "Open basics" (ADR-441 EM1-3 hotfix): Basics pointed at the index. Lock the rule so a
// future href change that reintroduces the loop fails here.
describe('hrefForSurface (console section targets never loop)', () => {
  const slug = 'demo'
  const indexHref = `/spaces/${slug}/settings`

  it('opens Basics at its dedicated editor, NOT the redirecting /settings index', () => {
    expect(hrefForSurface('space.basics', slug)).toBe(`/spaces/${slug}/settings/basics`)
    expect(hrefForSurface('space.basics', slug)).not.toBe(indexHref)
  })

  it('gives Danger no href (it renders its delete control inline)', () => {
    expect(hrefForSurface('space.danger', slug)).toBeNull()
  })

  it('points every linkable spine surface at a real, non-looping sub-page', () => {
    for (const surface of SPACE_SURFACES) {
      const href = hrefForSurface(surface.id, slug)
      if (surface.id === 'space.danger') {
        expect(href).toBeNull()
        continue
      }
      // Every other surface must resolve to a concrete sub-page UNDER this slug, and never to the
      // bare /settings index (the one route that redirects console types back to /manage).
      expect(href).not.toBeNull()
      expect(href).not.toBe(indexHref)
      expect(href).toMatch(new RegExp(`^/spaces/${slug}/`))
      // A sub-page always has a segment past the slug (so it cannot be the redirecting index).
      expect(href!.split('/').filter(Boolean).length).toBeGreaterThan(2)
    }
  })

  // The CRM section is the one console target NOT under /settings or /manage. It opens the paid
  // per-Space CRM board at /spaces/<slug>/crm, an owner surface that escapes the profile shell in
  // [slug]/layout.tsx (the fix for "clicking the CRM section breaks": it used to render double-wrapped
  // in the public profile hero + tabs). Lock the target so it stays the board, not a profile tab.
  it('opens CRM at the standalone board, an owner surface that escapes the profile shell', () => {
    expect(hrefForSurface('space.engage.crm', slug)).toBe(`/spaces/${slug}/crm`)
  })

  // The deeper Offerings merge: the ONE adaptive commerce surface opens the unified Offerings page,
  // which stacks whichever sections apply to the space's type. It replaces the five separate targets
  // (availability / memberships / donations / enroll / tickets / checkin).
  it('opens the unified Offerings surface at /settings/offerings', () => {
    expect(hrefForSurface('space.offerings', slug)).toBe(`/spaces/${slug}/settings/offerings`)
  })
})

// The console clusters by spine SLOT into the SAME 7 groups the admin rail uses (ADR-520, SPACE_GROUP_META:
// Identity=basics · Page=layout · Audience=people · Offerings & money=engage · Reach=reach · Growth=insights
// · Danger=danger). Every declared surface must land in one of those seven slots, so the console and rail
// agree on the IA.
describe('groupForSurface (every surface clusters into one of the 7 ADR-520 slots)', () => {
  const KNOWN_SLOTS = ['basics', 'layout', 'people', 'engage', 'reach', 'insights', 'danger']
  const byId = (id: string) => SPACE_SURFACES.find((s) => s.id === id) as SpaceSurface

  it('assigns every declared surface to a known slot group', () => {
    for (const surface of SPACE_SURFACES) {
      expect(KNOWN_SLOTS).toContain(groupForSurface(surface))
    }
  })

  it('keeps identity-defining surfaces (Basics, Mode) in Identity (basics), Danger in danger', () => {
    expect(groupForSurface(byId('space.basics'))).toBe('basics')
    expect(groupForSurface(byId('space.mode'))).toBe('basics')
    expect(groupForSurface(byId('space.danger'))).toBe('danger')
  })

  it('folds Insights + Plan and usage into the single Growth group (insights slot)', () => {
    expect(groupForSurface(byId('space.billing'))).toBe('insights')
    expect(groupForSurface(byId('space.insights'))).toBe('insights')
  })
})

// THE PIN: Basics / identity is NEVER ordered below the mode-emphasized surfaces. The old console
// flat-sorted the whole spine by Mode emphasis, which promoted bookings/CRM above Basics and buried the
// space's own identity. The rework groups first and applies emphasis WITHIN a group only, so:
//   1. Basics (and Mode) live in the identity group, which renders FIRST regardless of emphasis, and
//   2. ordering within a group never moves an unfunctioned surface (Basics) below a functioned one.
describe('Mode is a secondary signal: Basics/identity is never demoted below mode modules', () => {
  // A practitioner carries Basics + Mode + availability + members + CRM + QR + email + insights + Danger.
  const practitionerSurfaces = spaceSurfacesFor('practitioner', () => true)
  // An emphasis that loudly promotes CRM + bookings, the exact shape that used to bury Basics.
  const emphasis: SpaceFunctionKey[] = ['crm', 'availability', 'email']

  it('keeps Basics + Mode in the Identity (basics) group, which renders before every other group', () => {
    const byId = (id: string) => SPACE_SURFACES.find((s) => s.id === id) as SpaceSurface
    expect(groupForSurface(byId('space.basics'))).toBe('basics')
    expect(groupForSurface(byId('space.mode'))).toBe('basics')
    // CRM lands in Audience (people), the unified Offerings surface in Offerings & money (engage).
    expect(groupForSurface(byId('space.engage.crm'))).toBe('people')
    expect(groupForSurface(byId('space.offerings'))).toBe('engage')
  })

  it('does not move Basics below an emphasized surface when ordering within the Identity group', () => {
    const identityGroup = practitionerSurfaces.filter((s) => s.slot === 'basics')
    const ordered = orderWithinGroupByEmphasis(identityGroup, emphasis)
    const basicsIdx = ordered.findIndex((s) => s.id === 'space.basics')
    const modeIdx = ordered.findIndex((s) => s.id === 'space.mode')
    // Basics + Mode have no requiredFunction, so emphasis never reorders them: they keep spine order
    // (Basics first), never demoted.
    expect(basicsIdx).toBe(0)
    expect(modeIdx).toBe(1)
  })

  it('within a functional group, an emphasized surface sorts ahead of an un-emphasized one', () => {
    // The Audience group (people slot) for a practitioner: members (no emphasis) + CRM (emphasized first).
    const peopleGroup = practitionerSurfaces.filter((s) => s.slot === 'people')
    const ordered = orderWithinGroupByEmphasis(peopleGroup, emphasis)
    const crmIdx = ordered.findIndex((s) => s.id === 'space.engage.crm')
    const membersIdx = ordered.findIndex((s) => s.id === 'space.people')
    expect(crmIdx).toBeLessThan(membersIdx)
  })

  it('tags only surfaces whose function the Mode emphasizes (Basics/Mode never tagged)', () => {
    const basics = SPACE_SURFACES.find((s) => s.id === 'space.basics') as SpaceSurface
    const crm = SPACE_SURFACES.find((s) => s.id === 'space.engage.crm') as SpaceSurface
    expect(isSuggestedByMode(basics, emphasis)).toBe(false)
    expect(isSuggestedByMode(crm, emphasis)).toBe(true)
    // No emphasis at all: nothing is suggested.
    expect(isSuggestedByMode(crm, [])).toBe(false)
  })
})
