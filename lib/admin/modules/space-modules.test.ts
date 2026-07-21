import { describe, it, expect } from 'vitest'
import {
  SPACE_MODULES,
  spaceModuleById,
  isFeatureEnabled,
  isModuleEnabled,
  spaceModuleManifest,
  isModuleHideable,
  isModuleAdvanced,
  UNHIDEABLE_MODULE_IDS,
  SPACE_MODULE_FAMILY_ORDER,
  SPACE_MODULE_FAMILY_LABEL,
} from './space-modules'
import { SPACE_FUNCTIONS, type SpaceFunctionKey } from '@/lib/spaces/functions'

// ADR-543 (docs/MODULAR-MENU.md P0): the universal SPACE module catalog + manifest.

describe('SPACE_MODULES catalog', () => {
  it('has unique ids and a monotonic order', () => {
    const ids = SPACE_MODULES.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    const orders = SPACE_MODULES.map((m) => m.order)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
  })

  it('covers every space SERVICE function with at least one module (profile is the shell)', () => {
    const featured = new Set(
      SPACE_MODULES.filter((m) => m.gate.kind === 'feature').map((m) => (m.gate as { fn: SpaceFunctionKey }).fn),
    )
    for (const fn of SPACE_FUNCTIONS.map((f) => f.key)) {
      if (fn === 'profile') continue // the shell (Identity & Branding / Info & Connect) covers profile
      expect(featured, `no module gates on function ${fn}`).toContain(fn)
    }
  })

  it('splits the commerce services into INDEPENDENT modules (no merged Offerings surface)', () => {
    for (const id of ['space.booking', 'space.memberships', 'space.donations', 'space.enroll', 'space.tickets', 'space.checkin', 'space.services']) {
      expect(spaceModuleById(id), `${id} should be its own module`).not.toBeNull()
    }
    expect(spaceModuleById('space.offerings')).toBeNull() // the merged surface is gone
  })

  it('keeps the shell modules always-on and every service feature-gated + toggleable', () => {
    for (const m of SPACE_MODULES) {
      if (m.gate.kind === 'feature') {
        expect(m.featureKey, `${m.id} feature module should carry a featureKey`).toBe(m.gate.fn)
      }
    }
    // The shell areas that can never be turned off:
    for (const id of ['space.basics', 'space.layout', 'space.danger']) {
      expect(spaceModuleById(id)?.gate.kind).toBe('always')
    }
  })

  it('gives every module a deep-editing route except Danger (inline delete)', () => {
    for (const m of SPACE_MODULES) {
      if (m.id === 'space.danger') continue
      expect(typeof m.deepLink, `${m.id} needs a deepLink`).toBe('function')
      expect(m.deepLink?.('demo')).toMatch(/^\/spaces\/demo\//)
    }
  })
})

describe('feature gating', () => {
  it('is default-ON (a feature is enabled unless explicitly false)', () => {
    expect(isFeatureEnabled(undefined, 'crm')).toBe(true)
    expect(isFeatureEnabled({}, 'crm')).toBe(true)
    expect(isFeatureEnabled({ crm: true }, 'crm')).toBe(true)
    expect(isFeatureEnabled({ crm: false }, 'crm')).toBe(false)
  })

  it('isModuleEnabled: shell always, service follows its feature', () => {
    const crm = spaceModuleById('space.crm')!
    const page = spaceModuleById('space.layout')!
    expect(isModuleEnabled(page, { crm: false })).toBe(true) // shell
    expect(isModuleEnabled(crm, {})).toBe(true)
    expect(isModuleEnabled(crm, { crm: false })).toBe(false)
  })
})

describe('spaceModuleManifest', () => {
  it('returns the full catalog (order-sorted) with default entitlements', () => {
    const manifest = spaceModuleManifest({})
    expect(manifest).toHaveLength(SPACE_MODULES.length)
    const orders = manifest.map((m) => m.order)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
  })

  it('drops modules whose feature is turned off', () => {
    const manifest = spaceModuleManifest({ crm: false, availability: false })
    const ids = manifest.map((m) => m.id)
    expect(ids).not.toContain('space.crm')
    expect(ids).not.toContain('space.booking')
    expect(ids).toContain('space.people') // members still on
    expect(ids).toContain('space.layout') // shell still on
  })

  it('drops hidden modules and honors the owner order', () => {
    const manifest = spaceModuleManifest({}, { hidden: ['space.danger'], order: ['space.crm', 'space.people'] })
    const ids = manifest.map((m) => m.id)
    expect(ids).not.toContain('space.danger')
    expect(ids[0]).toBe('space.crm')
    expect(ids[1]).toBe('space.people')
    // unlisted modules keep catalog order after the explicit ones
    expect(ids.slice(2)).toEqual([...ids.slice(2)].sort((a, b) => spaceModuleById(a)!.order - spaceModuleById(b)!.order))
  })

  it('a disabled QR feature drops BOTH its modules (QR codes + Insights)', () => {
    const ids = spaceModuleManifest({ qr: false }).map((m) => m.id)
    expect(ids).not.toContain('space.reach')
    expect(ids).not.toContain('space.insights')
  })
})

// ADR-796: progressive disclosure — advanced modules are collapsed out of the primary menu until activated.
describe('advanced modules (progressive disclosure)', () => {
  it('isModuleAdvanced is true for a deeper tool, false for an essential and never for a shell/Danger', () => {
    const advanced = spaceModuleById('space.automation')!
    const essential = spaceModuleById('space.crm')!
    expect(isModuleAdvanced(advanced)).toBe(true)
    expect(isModuleAdvanced(essential)).toBe(false)
    expect(isModuleAdvanced(spaceModuleById('space.basics')!)).toBe(false) // shell
    expect(isModuleAdvanced(spaceModuleById('space.danger')!)).toBe(false) // Danger
  })

  it('with NO activated opt (undefined), advanced modules are NOT collapsed — the full catalog (drift parity)', () => {
    const ids = spaceModuleManifest({}).map((m) => m.id)
    expect(ids).toContain('space.automation')
    expect(ids).toContain('space.airwaves')
    expect(ids).toHaveLength(SPACE_MODULES.length)
  })

  it('with an activated list supplied, advanced modules are OFF unless listed; essentials always show', () => {
    const ids = spaceModuleManifest({}, { activated: [] }).map((m) => m.id)
    expect(ids).not.toContain('space.automation') // advanced, not activated
    expect(ids).not.toContain('space.airwaves') // advanced, not activated
    expect(ids).toContain('space.crm') // essential, always up front
    expect(ids).toContain('space.booking') // essential
    expect(ids).toContain('space.basics') // shell, always
  })

  it('activating an advanced module surfaces it while the others stay collapsed', () => {
    const ids = spaceModuleManifest({}, { activated: ['space.automation'] }).map((m) => m.id)
    expect(ids).toContain('space.automation') // activated → shown
    expect(ids).not.toContain('space.airwaves') // still collapsed
  })
})

// ADR-546 (docs/MODULAR-MENU.md P3): the hide/family metadata. (The "Menu and features" / space.modules rail
// entry was removed — item 7 — so it is no longer part of the catalog.)
describe('hide/family metadata', () => {
  it('has no space.modules rail entry (removed, item 7)', () => {
    expect(spaceModuleById('space.modules')).toBeNull()
  })

  it('protects the shell config surfaces and Danger from hiding', () => {
    for (const id of ['space.basics', 'space.layout', 'space.danger']) {
      expect(isModuleHideable(id), `${id} must be unhideable`).toBe(false)
      expect(UNHIDEABLE_MODULE_IDS).toContain(id)
    }
  })

  it('lets every SERVICE module be hidden', () => {
    for (const m of SPACE_MODULES) {
      if (m.gate.kind === 'feature') expect(isModuleHideable(m.id), `${m.id} should be hideable`).toBe(true)
    }
  })

  it('gives every family a display order slot and a label', () => {
    for (const m of SPACE_MODULES) {
      expect(SPACE_MODULE_FAMILY_ORDER).toContain(m.family)
      expect(SPACE_MODULE_FAMILY_LABEL[m.family]).toBeTruthy()
    }
  })
})

// ADR-546b (docs/MODULAR-MENU.md P3b): the RAIL presentation fields the manifest now carries, so the
// standardized rail can render from SPACE_MODULES with its shipped band + bank layout byte-identical.
describe('rail presentation metadata (priority + placement)', () => {
  it('gives every module a numeric rail priority (within-band order)', () => {
    for (const m of SPACE_MODULES) {
      expect(typeof m.priority, `${m.id} needs a rail priority`).toBe('number')
    }
  })

  it('banks exactly the back-office reach + growth destinations (QR · Email · Insights · Plan and usage)', () => {
    const banked = SPACE_MODULES.filter((m) => m.placement === 'bank').map((m) => m.id).sort()
    expect(banked).toEqual(['space.billing', 'space.comms', 'space.insights', 'space.reach'].sort())
  })

  it('never banks Danger (destructive is never a bottom-bank quick-link)', () => {
    expect(spaceModuleById('space.danger')!.placement ?? 'inline').toBe('inline')
  })
})

// ADR-782: the console consolidation (Profile & Settings collapse + parent-nesting + access badges).
describe('console consolidation metadata (ADR-782)', () => {
  it('collapsed the three duplicate basics cards into one space.basics', () => {
    expect(spaceModuleById('space.branding')).toBeNull()
    expect(spaceModuleById('space.settings')).toBeNull()
    const basics = spaceModuleById('space.basics')!
    expect(basics.label).toBe('Profile and Settings')
    expect(basics.deepLink?.('demo')).toBe('/spaces/demo/settings/basics')
  })

  it('every access badge is one of included / freemium / premium', () => {
    for (const m of SPACE_MODULES) {
      if (m.access !== undefined) expect(['included', 'freemium', 'premium']).toContain(m.access)
    }
  })

  it('every `parent` points to a real, panel-or-linkable module (no dangling nest)', () => {
    for (const m of SPACE_MODULES) {
      if (!m.parent) continue
      const parent = spaceModuleById(m.parent)
      expect(parent, `${m.id} nests under a missing parent ${m.parent}`).not.toBeNull()
      expect(parent!.parent, `${m.id} parent ${m.parent} is itself nested (no two-level nesting)`).toBeUndefined()
    }
  })

  it('nests the CRM cluster under CRM and the email trio under Email', () => {
    for (const id of ['space.automation', 'space.leads', 'space.doors', 'space.shared']) {
      expect(spaceModuleById(id)!.parent).toBe('space.crm')
    }
    for (const id of ['space.marketing', 'space.emailstyle']) {
      expect(spaceModuleById(id)!.parent).toBe('space.comms')
    }
    expect(spaceModuleById('space.insights')!.parent).toBe('space.reach')
  })
})

// ADR-784: the access badges corrected to match the real code caps (feature-meters.ts), + the free-cap
// sublabel (freeNote) that makes the upgrade lever legible.
describe('access badges match the real free-tier caps (ADR-784)', () => {
  it('badges the metered offerings Freemium (they are capped on free, not fully Included)', () => {
    for (const id of ['space.booking', 'space.memberships', 'space.tickets']) {
      expect(spaceModuleById(id)!.access, `${id} is capped on free`).toBe('freemium')
    }
  })

  it('badges Team Freemium (1 seat free, then paid per seat)', () => {
    expect(spaceModuleById('space.people')!.access).toBe('freemium')
  })

  it('badges Practices Included (no cap constant backs a freemium claim)', () => {
    expect(spaceModuleById('space.practices')!.access).toBe('included')
  })

  it('gives every Freemium / Premium card a freeNote lever (except email/qr children that ride a parent)', () => {
    const childRides = new Set(['space.marketing', 'space.emailstyle', 'space.leads', 'space.doors', 'space.shared', 'space.insights'])
    for (const m of SPACE_MODULES) {
      if ((m.access === 'freemium' || m.access === 'premium') && !childRides.has(m.id)) {
        expect(m.freeNote, `${m.id} needs a freeNote lever`).toBeTruthy()
      }
    }
  })
})
