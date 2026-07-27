import { describe, it, expect } from 'vitest'
import {
  ADMIN_RAIL,
  ADMIN_RAIL_BOXES,
  ADMIN_SECTION,
  KNOWN_GATE_DIVERGENCES,
  adminRailChildren,
  adminRailEntry,
} from './admin-rail'
import { normalizeAdminHref } from './admin-nesting'
import { NAV_AREAS } from '@/lib/nav-areas'
import { STUDIO_LEAVES, STUDIO_WORLDS } from './studio'

// The reconciled operator rail (ADR-850).
//
// The load-bearing test in this file is the DRIFT GUARD at the bottom. Two catalogs describe the
// same operator pages and no code read both, so they were free to disagree — and on two rows they
// do. That guard turns "they disagree" from something nobody notices into a CI failure, with the
// two existing differences listed as accepted exceptions so a THIRD one cannot slip in quietly.

describe('the rail is a projection of NAV_AREAS, not a second list', () => {
  it('has exactly one entry per Admin-section nav area, in order', () => {
    const expected = NAV_AREAS.filter((a) => a.section === ADMIN_SECTION).map((a) => a.key)
    expect(ADMIN_RAIL.map((e) => e.key)).toEqual(expected)
  })

  it('preserves every legacy key verbatim, because area_permissions is keyed by them', () => {
    for (const entry of ADMIN_RAIL) {
      const area = NAV_AREAS.find((a) => a.key === entry.key)
      expect(area).toBeDefined()
      expect(entry.href).toBe(area!.href)
      expect(entry.label).toBe(area!.label)
    }
  })

  it('takes the gate from NAV_AREAS verbatim, so nothing about access changes', () => {
    for (const entry of ADMIN_RAIL) {
      const area = NAV_AREAS.find((a) => a.key === entry.key)!
      expect(entry.gate.minAccess).toBe(area.defaultAccess)
      expect(entry.gate.staffDomain).toBe(area.staffDomain)
    }
  })
})

describe('the box shape', () => {
  it('nests every row under a box that is itself a rail row', () => {
    const keys = new Set(ADMIN_RAIL.map((e) => e.key))
    for (const entry of ADMIN_RAIL) {
      if (entry.parentKey) expect(keys.has(entry.parentKey)).toBe(true)
    }
  })

  it('is one level deep: no box is itself nested', () => {
    const boxKeys = new Set(ADMIN_RAIL_BOXES.map((e) => e.key))
    for (const entry of ADMIN_RAIL) {
      if (entry.parentKey) expect(boxKeys.has(entry.parentKey)).toBe(true)
    }
    for (const box of ADMIN_RAIL_BOXES) expect(box.parentKey).toBeNull()
  })

  it('draws the six boxes the rail collapsed to', () => {
    expect(ADMIN_RAIL_BOXES.map((e) => e.key).sort()).toEqual(
      ['admin-community', 'admin-growth', 'admin-home', 'admin-operations', 'admin-programs', 'lead'].sort(),
    )
  })

  it('files the tools under the worlds their own leaves declare', () => {
    expect(adminRailChildren('admin-growth').map((e) => e.key)).toEqual(['admin-crm', 'admin-qr'])
    expect(adminRailChildren('admin-programs').map((e) => e.key)).toEqual(['admin-library'])
    // In NAV_AREAS declaration order, which is rail order. Vera AI leads because it is declared
    // before Operations itself; the box still draws first and pulls its children up beneath it.
    expect(adminRailChildren('admin-operations').map((e) => e.key)).toEqual([
      'admin-vera-ai',
      'admin-spaces',
      'admin-marketplace',
    ])
  })

  it('accounts for every row: each is a box or a child of one', () => {
    const boxed = new Set(ADMIN_RAIL_BOXES.map((e) => e.key))
    const nested = ADMIN_RAIL_BOXES.flatMap((b) => adminRailChildren(b.key).map((c) => c.key))
    expect([...boxed, ...nested].sort()).toEqual(ADMIN_RAIL.map((e) => e.key).sort())
  })

  it('does not claim rows the code catalog has never heard of', () => {
    // "Business Seeder" is a DB-only menu row: it is deliberately absent here, and nests at RENDER
    // time via the href-keyed pass in admin-nesting.ts instead.
    expect(ADMIN_RAIL.some((e) => e.href.includes('business-seeder'))).toBe(false)
  })

  it('resolves a row by key, and nothing by an unknown key', () => {
    expect(adminRailEntry('admin-crm')?.label).toBe('Resonance CRM')
    expect(adminRailEntry('not-a-key')).toBeUndefined()
  })
})

describe('the keys are pinned, because a rename orphans stored data', () => {
  // `area_permissions` rows are keyed by these strings, and `lib/permissions.ts` SILENTLY DROPS a
  // row whose key it does not recognise. So renaming a key here does not fail anything at runtime:
  // it just quietly voids the operator's saved override for that area. Two such orphans were found
  // in production and cleaned up in 20270102000000; this pin is what stops a third.
  //
  // Changing this list is allowed. Changing it WITHOUT a migration that remaps or prunes the
  // matching `area_permissions` rows is the mistake it exists to catch.
  const PINNED_KEYS = [
    'admin-home',
    'admin-community',
    'lead',
    'admin-programs',
    'admin-growth',
    'admin-crm',
    'admin-vera-ai',
    'admin-operations',
    'admin-qr',
    'admin-library',
    'admin-spaces',
    'admin-marketplace',
  ] as const

  it('still uses exactly the keys production has stored overrides against', () => {
    expect(ADMIN_RAIL.map((e) => e.key)).toEqual([...PINNED_KEYS])
  })

  it('keeps the four keys carrying a live operator override', () => {
    // admin-growth / admin-operations / admin-vera-ai at 'mentor', admin-programs at 'guide'.
    for (const key of ['admin-growth', 'admin-operations', 'admin-vera-ai', 'admin-programs']) {
      expect(adminRailEntry(key)).toBeDefined()
    }
  })
})

describe('traceability back to the operator catalog', () => {
  it('backs every row but Leadership with a leaf or a world', () => {
    for (const entry of ADMIN_RAIL) {
      if (entry.key === 'lead') {
        // /lead is a leader home, not an operator page: no StudioLeaf claims it, which is why it
        // stays a box of its own rather than nesting anywhere.
        expect(entry.leafId).toBeNull()
      } else {
        expect(entry.leafId).not.toBeNull()
      }
    }
  })

  it('names a real leaf or world id', () => {
    const leafIds = new Set<string>(STUDIO_LEAVES.map((l) => l.id))
    const worldIds = new Set(STUDIO_WORLDS.map((w) => `world:${w.key}`))
    for (const entry of ADMIN_RAIL) {
      if (!entry.leafId) continue
      expect(leafIds.has(entry.leafId) || worldIds.has(entry.leafId)).toBe(true)
    }
  })
})

// ── THE DRIFT GUARD ────────────────────────────────────────────────────────────────────────────
describe('the two catalogs may not silently disagree about a shared destination', () => {
  /** Every destination described by BOTH catalogs, paired up by href. */
  function sharedDestinations() {
    const out: { key: string; navMin: string; navDomain?: string; leafMin: string; leafDomain?: string }[] = []
    for (const entry of ADMIN_RAIL) {
      const href = normalizeAdminHref(entry.href)
      const world = STUDIO_WORLDS.find((w) => normalizeAdminHref(w.href) === href)
      const leaf = STUDIO_LEAVES.find((l) => normalizeAdminHref(l.href) === href)
      const src = world ?? leaf
      if (!src) continue
      out.push({
        key: entry.key,
        navMin: entry.gate.minAccess,
        navDomain: entry.gate.staffDomain,
        leafMin: src.min,
        leafDomain: src.staffDomain,
      })
    }
    return out
  }

  it('finds a real overlap to check, so this guard cannot pass vacuously', () => {
    expect(sharedDestinations().length).toBeGreaterThanOrEqual(10)
  })

  it('agrees on every shared destination except the two recorded exceptions', () => {
    const diverged = sharedDestinations()
      .filter((d) => d.navMin !== d.leafMin || d.navDomain !== d.leafDomain)
      .map((d) => d.key)
    expect(diverged.sort()).toEqual([...KNOWN_GATE_DIVERGENCES].sort())
  })

  it('keeps the exception list honest: every listed key really does still diverge', () => {
    // Stops the allowlist rotting into a licence after someone reconciles one of them.
    const divergedKeys = new Set(
      sharedDestinations()
        .filter((d) => d.navMin !== d.leafMin || d.navDomain !== d.leafDomain)
        .map((d) => d.key),
    )
    for (const key of KNOWN_GATE_DIVERGENCES) expect(divergedKeys.has(key)).toBe(true)
  })

  it('pins what each recorded divergence actually is, so resolving one is a deliberate edit', () => {
    const byKey = new Map(sharedDestinations().map((d) => [d.key, d]))
    expect(byKey.get('admin-library')).toEqual({
      key: 'admin-library',
      navMin: 'janitor',
      navDomain: 'marketing',
      leafMin: 'janitor',
      leafDomain: undefined,
    })
    expect(byKey.get('admin-spaces')).toEqual({
      key: 'admin-spaces',
      navMin: 'admin',
      navDomain: 'platform',
      leafMin: 'janitor',
      leafDomain: undefined,
    })
  })
})
