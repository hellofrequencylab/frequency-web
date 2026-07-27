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
  SPACE_MODULE_BOX_IDS,
  spaceModuleChildren,
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

  // ADR-846 REVERSES the ADR-544b split: the six commerce services keep their own rows (own gate, own
  // panel, own anchored section) but are TOOLS inside the one "Offerings and money" box again.
  it('keeps each commerce service a real module, owned by the Offerings and money box', () => {
    for (const id of ['space.booking', 'space.memberships', 'space.donations', 'space.enroll', 'space.tickets', 'space.checkin']) {
      const m = spaceModuleById(id)
      expect(m, `${id} should still be its own module`).not.toBeNull()
      expect(m!.parent, `${id} belongs to the Offerings and money box`).toBe('space.offerings')
    }
    // Shop is its own BOX (a full 3-tab console), not a section of the adaptive offerings surface.
    expect(spaceModuleById('space.services')!.parent).toBeUndefined()
    const offerings = spaceModuleById('space.offerings')
    expect(offerings, 'the Offerings and money box exists again').not.toBeNull()
    expect(offerings!.deepLink?.('demo')).toBe('/spaces/demo/settings/offerings')
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

  it('a disabled QR feature drops the QR codes and insights box', () => {
    const ids = spaceModuleManifest({ qr: false }).map((m) => m.id)
    expect(ids).not.toContain('space.reach')
    // ADR-846 retired the second `space.insights` row onto the same page; the box absorbed it.
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

  it('banks exactly the back-office reach + growth destinations (QR and insights · Email · Plan and billing)', () => {
    // Insights left the catalog with ADR-846 (it was a second row onto the QR page). The rail bank keeps
    // its own fixed Insights quick-link straight to /settings/qr#scans (lib/admin/rail-bank.ts).
    const banked = SPACE_MODULES.filter((m) => m.placement === 'bank').map((m) => m.id).sort()
    expect(banked).toEqual(['space.billing', 'space.comms', 'space.reach'].sort())
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
    for (const id of ['space.conversations', 'space.automation', 'space.leads', 'space.doors', 'space.shared']) {
      expect(spaceModuleById(id)!.parent).toBe('space.crm')
    }
    for (const id of ['space.marketing', 'space.emailstyle']) {
      expect(spaceModuleById(id)!.parent).toBe('space.comms')
    }
  })
})

// ADR-846: the TWELVE-BOX consolidation. A Space menu is twelve top-level boxes; every other catalog row is
// a tool owned by exactly one of them. This is the lock on that shape.
describe('the twelve boxes (ADR-846)', () => {
  it('has exactly twelve top-level boxes, in the approved order', () => {
    expect(SPACE_MODULE_BOX_IDS).toEqual([
      'space.basics', // 1 Profile and Settings
      'space.layout', // 2 Page
      'space.people', // 3 People
      'space.crm', // 4 CRM
      'space.calendar', // 5 Calendar
      'space.offerings', // 6 Offerings and money
      'space.content', // 8 Content (catalog order puts it before Shop)
      'space.services', // 7 Shop
      'space.reach', // 10 QR codes and insights (catalog order puts it before Email)
      'space.comms', // 9 Email
      'space.billing', // 11 Plan and billing
      'space.danger', // 12 Danger zone
    ])
    expect(SPACE_MODULE_BOX_IDS).toHaveLength(12)
  })

  it('gives every non-box row a box that owns it, one level deep, with no orphan', () => {
    const boxes = new Set(SPACE_MODULE_BOX_IDS)
    for (const m of SPACE_MODULES) {
      if (boxes.has(m.id)) continue
      expect(m.parent, `${m.id} is neither a box nor owned by one`).toBeTruthy()
      expect(boxes.has(m.parent!), `${m.id} nests under ${m.parent}, which is not a box`).toBe(true)
    }
  })

  it('files each absorbed tool under the box the consolidation assigned it', () => {
    const expected: Record<string, string> = {
      'space.reviews': 'space.basics',
      'space.collaborators': 'space.people',
      'space.conversations': 'space.crm',
      'space.leads': 'space.crm',
      'space.doors': 'space.crm',
      'space.shared': 'space.crm',
      'space.automation': 'space.crm',
      'space.booking': 'space.offerings',
      'space.memberships': 'space.offerings',
      'space.donations': 'space.offerings',
      'space.enroll': 'space.offerings',
      'space.tickets': 'space.offerings',
      'space.checkin': 'space.offerings',
      'space.practices': 'space.content',
      'space.journeys': 'space.content',
      'space.circles': 'space.content',
      'space.airwaves': 'space.content',
      'space.loom': 'space.content',
      'space.marketing': 'space.comms',
      'space.emailstyle': 'space.comms',
    }
    for (const [id, parent] of Object.entries(expected)) {
      expect(spaceModuleById(id)?.parent, `${id} belongs to ${parent}`).toBe(parent)
    }
    // Every box keeps its tools reachable: each child resolves a real deep-editing route of its own.
    for (const id of Object.keys(expected)) {
      expect(spaceModuleById(id)!.deepLink?.('demo')).toMatch(/^\/spaces\/demo\//)
    }
  })

  it('retired only the one row whose destination duplicated its box (Scans and insights)', () => {
    expect(spaceModuleById('space.insights')).toBeNull()
    // The box it folded into now says so, and still opens the page that carries the scans readout.
    const reach = spaceModuleById('space.reach')!
    expect(reach.label).toBe('QR codes and insights')
    expect(reach.deepLink?.('demo')).toBe('/spaces/demo/settings/qr')
  })

  it('gives each box a real child set (spaceModuleChildren)', () => {
    expect(spaceModuleChildren('space.offerings').map((m) => m.id)).toEqual([
      'space.booking',
      'space.memberships',
      'space.donations',
      'space.enroll',
      'space.tickets',
      'space.checkin',
    ])
    expect(spaceModuleChildren('space.content').map((m) => m.id)).toEqual([
      'space.practices',
      'space.journeys',
      'space.circles',
      'space.airwaves',
      'space.loom',
    ])
    expect(spaceModuleChildren('space.danger')).toEqual([])
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
