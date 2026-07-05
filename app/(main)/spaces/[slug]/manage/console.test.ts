import { describe, it, expect } from 'vitest'
import { groupForModule, isSuggestedByMode, orderWithinGroupByEmphasis } from './console'
import {
  SPACE_MODULES,
  spaceModuleById,
  spaceModuleManifest,
  type SpaceModule,
} from '@/lib/admin/modules/space-modules'
import { panelHrefForModule } from '@/lib/spaces/surface-hrefs'
import type { SpaceFunctionKey } from '@/lib/spaces/functions'

// P1 (docs/MODULAR-MENU.md, ADR-544): the /manage console renders the SPACE menu from the P0 module
// manifest. These lock the console's pure helpers on the MODULE shape: every module folds into one of the
// 7 member-facing groups, each console href prefers its on-page panel (no Stage-D5 `?panel=` regression)
// else its deep link, and Mode stays a secondary signal (tag + within-group order, never a gate).

const byId = (id: string): SpaceModule => {
  const m = spaceModuleById(id)
  if (!m) throw new Error(`missing module ${id}`)
  return m
}

// The console clusters by module SLOT into the SAME 7 groups the admin rail uses (ADR-520, SPACE_GROUP_META:
// Identity/Info=basics · Page=layout · Audience=people · Offerings & money=engage · Reach=reach · Growth=
// insights · Danger=danger). Every module must fold into one of those seven, so the console and rail agree.
describe('groupForModule (every module folds into one of the 7 console groups)', () => {
  const KNOWN_SLOTS = ['basics', 'layout', 'people', 'engage', 'reach', 'insights', 'danger']

  it('assigns every catalog module to a known group slot', () => {
    for (const mod of SPACE_MODULES) {
      expect(KNOWN_SLOTS).toContain(groupForModule(mod))
    }
  })

  it('folds Identity & Branding (place) and Settings (safety) into the identity group (basics)', () => {
    expect(groupForModule(byId('space.branding'))).toBe('basics')
    expect(groupForModule(byId('space.basics'))).toBe('basics')
    expect(groupForModule(byId('space.settings'))).toBe('basics')
  })

  it('keeps Members + CRM in Audience (people) and every commerce module in Offerings & money (engage)', () => {
    expect(groupForModule(byId('space.people'))).toBe('people')
    expect(groupForModule(byId('space.crm'))).toBe('people')
    for (const id of [
      'space.booking',
      'space.memberships',
      'space.donations',
      'space.enroll',
      'space.tickets',
      'space.checkin',
      'space.services',
    ]) {
      expect(groupForModule(byId(id))).toBe('engage')
    }
  })

  it('folds Email (comms) into Reach, and Plan and usage (billing) into Growth (insights)', () => {
    expect(groupForModule(byId('space.reach'))).toBe('reach')
    expect(groupForModule(byId('space.comms'))).toBe('reach')
    expect(groupForModule(byId('space.insights'))).toBe('insights')
    expect(groupForModule(byId('space.billing'))).toBe('insights')
    expect(groupForModule(byId('space.danger'))).toBe('danger')
  })
})

// The console href must PREFER the on-page panel (Stage-D5 no-regression) when the module has one, else
// fall through to the module's deep-editing route. Danger has neither, so it stays null (rendered as the
// inline delete control instead).
describe('panelHrefForModule (on-page panel first, else deep link, no regression)', () => {
  const slug = 'demo'

  it('opens Members / CRM / Store / QR / Email / Billing on-page via ?panel=', () => {
    expect(panelHrefForModule(byId('space.people'), slug)).toBe(`/spaces/${slug}?panel=members`)
    expect(panelHrefForModule(byId('space.crm'), slug)).toBe(`/spaces/${slug}?panel=crm`)
    expect(panelHrefForModule(byId('space.services'), slug)).toBe(`/spaces/${slug}?panel=services`)
    expect(panelHrefForModule(byId('space.reach'), slug)).toBe(`/spaces/${slug}?panel=qr`)
    expect(panelHrefForModule(byId('space.comms'), slug)).toBe(`/spaces/${slug}?panel=email`)
    expect(panelHrefForModule(byId('space.billing'), slug)).toBe(`/spaces/${slug}?panel=billing`)
  })

  it('opens each split commerce module on-page via ?panel= (modular menu P2, ADR-545)', () => {
    // P2: the six independent commerce services gained full inline bodies, so they open on-page like the
    // rest (no longer deep-linking to their /settings/* page).
    expect(panelHrefForModule(byId('space.booking'), slug)).toBe(`/spaces/${slug}?panel=booking`)
    expect(panelHrefForModule(byId('space.memberships'), slug)).toBe(`/spaces/${slug}?panel=memberships`)
    expect(panelHrefForModule(byId('space.donations'), slug)).toBe(`/spaces/${slug}?panel=donations`)
    expect(panelHrefForModule(byId('space.enroll'), slug)).toBe(`/spaces/${slug}?panel=enroll`)
    expect(panelHrefForModule(byId('space.tickets'), slug)).toBe(`/spaces/${slug}?panel=tickets`)
    expect(panelHrefForModule(byId('space.checkin'), slug)).toBe(`/spaces/${slug}?panel=checkin`)
  })

  it('falls through to the deep link for a module with no panel (Insights)', () => {
    // Insights still has no on-page panel, so it opens its deep route (the QR Scans anchor).
    expect(panelHrefForModule(byId('space.insights'), slug)).toBe(`/spaces/${slug}/settings/qr#scans`)
  })

  it('gives Danger no href (it renders its delete control inline)', () => {
    expect(panelHrefForModule(byId('space.danger'), slug)).toBeNull()
  })

  it('resolves a non-null, in-slug href for every module except Danger', () => {
    for (const mod of SPACE_MODULES) {
      const href = panelHrefForModule(mod, slug)
      if (mod.id === 'space.danger') {
        expect(href).toBeNull()
        continue
      }
      expect(href).not.toBeNull()
      expect(href).toMatch(new RegExp(`^/spaces/${slug}[/?]`))
    }
  })
})

// THE PIN: Identity is NEVER ordered below the mode-emphasized modules. The console groups first and
// applies emphasis WITHIN a group only, so the identity group renders FIRST regardless of emphasis, and
// ordering within a group never moves an always-on module below a functioned one.
describe('Mode is a secondary signal: Identity is never demoted below mode modules', () => {
  // An emphasis that loudly promotes CRM + bookings, the exact shape that used to bury identity.
  const emphasis: SpaceFunctionKey[] = ['crm', 'availability', 'email']

  it('tags only modules whose gate function the Mode emphasizes (shell modules never tagged)', () => {
    expect(isSuggestedByMode(byId('space.branding'), emphasis)).toBe(false)
    expect(isSuggestedByMode(byId('space.crm'), emphasis)).toBe(true)
    expect(isSuggestedByMode(byId('space.booking'), emphasis)).toBe(true)
    // No emphasis at all: nothing is suggested.
    expect(isSuggestedByMode(byId('space.crm'), [])).toBe(false)
  })

  it('does not move an always-on module below an emphasized one when ordering the identity group', () => {
    // The identity (basics) group: Identity & Branding + Info and Connect + Settings, all always-on.
    const identityGroup = spaceModuleManifest({}).filter((m) => groupForModule(m) === 'basics')
    const ordered = orderWithinGroupByEmphasis(identityGroup, emphasis)
    // No gate functions, so emphasis never reorders them: they keep catalog order, never demoted.
    expect(ordered.map((m) => m.id)).toEqual(identityGroup.map((m) => m.id))
  })

  it('within a functional group, an emphasized module sorts ahead of an un-emphasized one', () => {
    // The Audience group: members (un-emphasized) + CRM (emphasized) — CRM sorts first.
    const audience = spaceModuleManifest({}).filter((m) => groupForModule(m) === 'people')
    const ordered = orderWithinGroupByEmphasis(audience, emphasis)
    const crmIdx = ordered.findIndex((m) => m.id === 'space.crm')
    const membersIdx = ordered.findIndex((m) => m.id === 'space.people')
    expect(crmIdx).toBeLessThan(membersIdx)
    // Booking (availability, emphasized) sorts ahead of Memberships (un-emphasized) in Offerings & money.
    const offerings = spaceModuleManifest({}).filter((m) => groupForModule(m) === 'engage')
    const orderedOfferings = orderWithinGroupByEmphasis(offerings, emphasis)
    const bookingIdx = orderedOfferings.findIndex((m) => m.id === 'space.booking')
    const membershipsIdx = orderedOfferings.findIndex((m) => m.id === 'space.memberships')
    expect(bookingIdx).toBeLessThan(membershipsIdx)
  })
})
