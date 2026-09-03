import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { groupForModule, isSuggestedByMode, orderWithinGroupByEmphasis } from './console'
import {
  SPACE_MODULES,
  spaceModuleById,
  spaceModuleManifest,
  type SpaceModule,
} from '@/lib/admin/modules/space-modules'
import { panelHrefForModule } from '@/lib/spaces/surface-hrefs'
import { sectionForModule } from '@/lib/admin/modules/space-hub'
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

// The console clusters by module SLOT into the console groups (ADR-782): Setup=basics · Content=place ·
// Audience=people · Offerings & money=engage · Reach=reach · Plan and billing=insights · Danger=danger.
// Every TOP-LEVEL module must fold into one of those seven, so nothing is orphaned.
describe('groupForModule (every module folds into one of the console groups)', () => {
  const KNOWN_SLOTS = ['basics', 'place', 'people', 'engage', 'reach', 'insights', 'danger']

  it('assigns every catalog module to a known group slot', () => {
    for (const mod of SPACE_MODULES) {
      expect(KNOWN_SLOTS).toContain(groupForModule(mod))
    }
  })

  it('folds Profile and Settings + Page into the Setup group (basics)', () => {
    expect(groupForModule(byId('space.basics'))).toBe('basics')
    expect(groupForModule(byId('space.layout'))).toBe('basics') // Page folds into Setup
  })

  it('clusters Practices / Journeys / Airwaves into the Content group (place)', () => {
    expect(groupForModule(byId('space.practices'))).toBe('place')
    expect(groupForModule(byId('space.journeys'))).toBe('place')
    expect(groupForModule(byId('space.airwaves'))).toBe('place')
  })

  it('keeps Members + CRM in Audience (people) and the commerce modules in Offerings & money (engage)', () => {
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

  it('folds Email (comms) into Reach, and Plan and billing into the insights group', () => {
    expect(groupForModule(byId('space.reach'))).toBe('reach')
    expect(groupForModule(byId('space.comms'))).toBe('reach')
    expect(groupForModule(byId('space.billing'))).toBe('insights')
    expect(groupForModule(byId('space.danger'))).toBe('danger')
  })
})

// The console href must PREFER the on-page panel (Stage-D5 no-regression) when the module has one, else
// fall through to the module's deep-editing route. Danger has neither, so it stays null (rendered as the
// inline delete control instead).
describe('panelHrefForModule (on-page panel first, else deep link, no regression)', () => {
  const slug = 'demo'

  it('opens Members / CRM / QR / Email / Billing on-page via ?panel=', () => {
    expect(panelHrefForModule(byId('space.people'), slug)).toBe(`/spaces/${slug}?panel=members`)
    expect(panelHrefForModule(byId('space.crm'), slug)).toBe(`/spaces/${slug}?panel=crm`)
    expect(panelHrefForModule(byId('space.reach'), slug)).toBe(`/spaces/${slug}?panel=qr`)
    expect(panelHrefForModule(byId('space.comms'), slug)).toBe(`/spaces/${slug}?panel=email`)
    expect(panelHrefForModule(byId('space.billing'), slug)).toBe(`/spaces/${slug}?panel=billing`)
  })

  it('deep-links Shop (was Store) to the 3-tab Shop console, not an inline panel (ADR-596)', () => {
    // space.services was relabeled 'Shop' and its MODULE_PANEL_ID entry removed, so it falls through to
    // the deepLink at /settings/shop (the Catalog/Orders/Storefront console) instead of opening ?panel=.
    expect(panelHrefForModule(byId('space.services'), slug)).toBe(`/spaces/${slug}/settings/shop`)
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

  it('opens the Offerings and money box on-page, and falls through to the deep link for Content', () => {
    // ADR-846: the Offerings box opens the ADAPTIVE `offerings` panel (the same workspace its six services
    // open their own sections of). Content has no panel, so it opens the hub's Content & Programs area.
    expect(panelHrefForModule(byId('space.offerings'), slug)).toBe(`/spaces/${slug}?panel=offerings`)
    expect(panelHrefForModule(byId('space.content'), slug)).toBe(`/spaces/${slug}/manage?section=programs`)
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
    expect(isSuggestedByMode(byId('space.basics'), emphasis)).toBe(false)
    expect(isSuggestedByMode(byId('space.crm'), emphasis)).toBe(true)
    expect(isSuggestedByMode(byId('space.booking'), emphasis)).toBe(true)
    // No emphasis at all: nothing is suggested.
    expect(isSuggestedByMode(byId('space.crm'), [])).toBe(false)
  })

  it('does not move an always-on module below an emphasized one when ordering the Setup group', () => {
    // The Setup (basics) group: Profile and Settings + Page, both always-on.
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

// Community (resonance) coverage (Phase 2). The Manage hub's Community tab leads with the member viewer
// (SpaceResonanceCrm), then renders a card grid of the resonance-section modules — so every CRM
// sub-function keeps a VISIBLE entry point inside Community, not only via `/crm` or a deep URL. The CRM
// board card (space.crm) opens the `?panel=crm` workspace, which is where Pipeline + Cockpit live, so
// surfacing that card is what gives Pipeline + Cockpit a home in Community. These lock the invariant the
// console render relies on: the section's module set, and that each one resolves to a reachable card href.
describe('Community (resonance) section coverage', () => {
  const resonance = SPACE_MODULES.filter((m) => sectionForModule(m) === 'resonance')

  it('groups the CRM box and every tool it owns under Community', () => {
    // space.conversations joined the set when the stale space.inbox id was corrected in
    // sectionForModule (the ticketed workspace files under Resonance, not the Offerings catch-all).
    // Automation is the one CRM-owned tool that files under Marketing instead (outbound drip).
    expect(resonance.map((m) => m.id).sort()).toEqual(
      ['space.conversations', 'space.crm', 'space.doors', 'space.leads', 'space.shared'].sort(),
    )
  })

  it('gives every Community module a reachable card href (no silent dead card)', () => {
    for (const m of resonance) {
      expect(panelHrefForModule(m, 'demo-space')).toBeTruthy()
    }
  })

  it('routes the CRM board card into the ?panel=crm workspace (where Pipeline + Cockpit live)', () => {
    const board = byId('space.crm')
    expect(sectionForModule(board)).toBe('resonance')
    expect(panelHrefForModule(board, 'demo-space')).toBe('/spaces/demo-space?panel=crm')
  })
})

// ── Open access during the beta (ADR-1195) ───────────────────────────────────────────────────────────
//
// The console used to pill every card Included / Freemium / Premium (ADR-782) and print its free-tier cap
// underneath (ADR-784). Both describe a wall that does not exist while the beta runs, so the console
// stopped rendering them and shows one open-access notice instead.
//
// These are SOURCE-SHAPE probes because the consequence is a render, and the render is what regressed:
// the manifest still CARRIES `access` + `freeNote` (the tests above keep those honest), so nothing about
// the data can tell you whether a pill came back. Only the file can. They probe the consequence, not the
// title: the pill markup absent, the cap sublabel unread, the notice actually mounted.
describe('the console shows no plan-tier labels during the beta (ADR-1195)', () => {
  const CONSOLE = readFileSync(fileURLToPath(new URL('./console.tsx', import.meta.url)), 'utf8')
  // The banner comment explains WHY the pills are gone and which server seam resolves the date, so it
  // names both; every probe below reads CODE, not prose about the code.
  const CODE = CONSOLE.slice(CONSOLE.indexOf('function BetaAccessNotice'))
  /** The file with block + line comments stripped, for the probes that must span the whole module. */
  const CONSOLE_CODE = CONSOLE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('renders no Included / Freemium / Premium pill on a service card', () => {
    for (const label of ['Included', 'Freemium', 'Premium']) {
      expect(CODE, `the ${label} pill is back on the console`).not.toContain(label)
    }
  })

  it('does not print a module free-tier cap under its label', () => {
    expect(CODE, 'freeNote is a manifest seed for post-beta pricing, not console copy').not.toContain(
      'freeNote',
    )
  })

  it('mounts the open-access notice on every tab that lists tools', () => {
    expect(CODE).toContain('<BetaAccessNotice endsLabel={graceEndsLabel} />')
    expect(CODE).toContain('CARD_SECTIONS.has(section)')
  })

  // The notice promises open access, so it must be bound to the switch that grants it. Rendering it
  // unconditionally is the regression this probes: it would keep promising "no caps" on the first day
  // featureGatesLive() starts enforcing them, and nothing else in the file would notice.
  it('renders the notice ONLY while the grace window is open', () => {
    expect(CODE, 'the notice must be gated on the resolved grace window').toContain(
      'CARD_SECTIONS.has(section) && graceEndsLabel &&',
    )
  })

  // ADR-018 presentation neutrality: the date is resolved server-side and handed in. A console that
  // formatted its own date would be reading a different source than featureGatesLive(), which is how
  // the copy and the caps drift apart.
  it('takes the date as a prop and never resolves the window itself', () => {
    for (const reader of ['betaWindow', 'getBetaGrace', 'featureGatesLive', 'betaStartLabel']) {
      expect(CONSOLE_CODE, `the console must not read ${reader} itself`).not.toContain(reader)
    }
  })

  it('composes the kit gate vocabulary rather than a second hand-rolled notice frame', () => {
    expect(CONSOLE_CODE).toContain("import { GateNotice } from '@/components/ui/gate-notice'")
    expect(CODE).toContain('<GateNotice kind="preview"')
  })

  // The notice says "nothing here is capped". That is true only on tabs whose tools all stand down with
  // featureGatesLive(). The QR ladder (lib/qr/space-codes.ts) deliberately does NOT — 3 codes on free
  // bites during the grace window too — and QR lives on Marketing. Putting the notice there would hang a
  // no-caps promise directly over a capped tool, so the exclusion is load-bearing, not cosmetic.
  it('never carries the notice onto Marketing, whose QR cap bites through the grace window', () => {
    const set = /const CARD_SECTIONS[\s\S]*?\]\)/.exec(CODE)?.[0] ?? ''
    expect(set, 'the CARD_SECTIONS declaration did not parse').toBeTruthy()
    expect(set).not.toContain("'marketing'")
    expect(set).not.toContain("'dashboard'")
  })

  it('keeps the notice copy free of em dashes (CONTENT-VOICE punctuation hard rule)', () => {
    const copy = /<GateNotice kind="preview"[\s\S]*?<\/GateNotice>/.exec(CODE)?.[0] ?? ''
    expect(copy, 'the notice did not parse').toBeTruthy()
    expect(copy).not.toContain('—')
  })
})
