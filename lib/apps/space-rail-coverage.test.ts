import { describe, it, expect } from 'vitest'
import { APPS } from './catalog'
import { appsForScope } from './for-scope'
import { nestAdminRows } from '@/lib/nav/admin-nesting'
import { orderByBox } from '@/components/layout/settings-panel'
import { SPACE_MODULES, SPACE_MODULE_BOX_IDS } from '@/lib/admin/modules/space-modules'
import { SPACE_FUNCTIONS, type SpaceFunctionKey } from '@/lib/spaces/functions'
import type { AppViewer } from './types'

// END-TO-END COVERAGE GUARD for the Space rail.
//
// The twelve-box consolidation (ADR-846) and the operator-rail nesting (ADR-848) both REORDER rows
// and both introduce a depth. Neither may ever REMOVE a Space's features from its rail: a Space
// carries a large set of working, surface-specific functions, and the whole point of nesting them
// under boxes is presentation, not culling. These lock that end to end, from the catalog through
// the resolver to the ordered rail rows a Space owner actually sees.

/** A Space owner with every function switched on: the maximum rail. */
const owner: AppViewer = {
  caps: new Set(),
  canUseSpaceFn: () => true,
}

const spaceScope = { kind: 'space' as const, id: 's1', spaceType: 'business' as const }

describe('every Space module reaches the rail', () => {
  const resolved = appsForScope(spaceScope, owner, 'editor')
  const resolvedIds = resolved.map((a) => a.id)

  it('resolves one rail row per catalog row, for an owner who can use everything', () => {
    expect(resolvedIds.sort()).toEqual(SPACE_MODULES.map((m) => m.id).sort())
  })

  it('leaves no catalog row unreachable', () => {
    const missing = SPACE_MODULES.filter((m) => !resolvedIds.includes(m.id)).map((m) => m.id)
    expect(missing).toEqual([])
  })

  it('carries every Space function through to a rail row, bar one that gates a box CONTENTS', () => {
    // A function nobody can reach from the rail would be a feature with no door, so this is a
    // coverage guard on the catalog. Exactly one function is deliberately not a row gate:
    //
    //   `profile` — the Profile and Settings BOX is `gate: always`, because an owner must never be
    //   locked out of their own settings surface. So `profile` gates what is INSIDE that surface
    //   rather than whether the row appears, and it is enforced server-side in
    //   lib/spaces/profile-settings.ts and the /manage rail getters. Making it a row gate would
    //   hide the box from the very owner who needs it to turn the function back on.
    const CONTENT_GATED = ['profile'] as const satisfies readonly SpaceFunctionKey[]

    const rowGatedFns = new Set(
      SPACE_MODULES.filter((m) => m.gate.kind === 'feature' && resolvedIds.includes(m.id)).map((m) =>
        m.gate.kind === 'feature' ? m.gate.fn : '',
      ),
    )
    const contentGated: readonly string[] = CONTENT_GATED
    const orphanFns = SPACE_FUNCTIONS.filter(
      (f) => !rowGatedFns.has(f.key) && !contentGated.includes(f.key),
    ).map((f) => f.key)
    expect(orphanFns).toEqual([])

    // And the exception is real, not a stale allowlist: it must NOT also be a row gate.
    for (const fn of CONTENT_GATED) expect(rowGatedFns.has(fn)).toBe(false)
  })
})

describe('nesting reorders the Space rail, it never culls it', () => {
  const resolvedIds = appsForScope(spaceScope, owner, 'editor').map((a) => a.id)
  const ordered = orderByBox(resolvedIds, true)

  it('emits exactly the rows it was given', () => {
    expect(ordered.map((r) => r.id).sort()).toEqual([...resolvedIds].sort())
  })

  it('never duplicates a row', () => {
    expect(new Set(ordered.map((r) => r.id)).size).toBe(ordered.length)
  })

  it('draws every box at the top level', () => {
    const boxes = ordered.filter((r) => r.depth === 0).map((r) => r.id)
    for (const boxId of SPACE_MODULE_BOX_IDS) {
      if (resolvedIds.includes(boxId)) expect(boxes).toContain(boxId)
    }
  })

  it('nests only one level deep, so no tool hides inside another tool', () => {
    expect(ordered.every((r) => r.depth === 0 || r.depth === 1)).toBe(true)
  })

  it('keeps a tool visible when its box is gated away', () => {
    // A Space that turned off the Offerings services still reaches any surviving tool.
    const withoutBox = resolvedIds.filter((id) => id !== 'space.offerings')
    const out = orderByBox(withoutBox, true)
    expect(out.map((r) => r.id).sort()).toEqual([...withoutBox].sort())
  })
})

describe('the operator nav lane cannot displace a surface-specific rail', () => {
  it('contributes nothing to a Space scope', () => {
    const ids = appsForScope(spaceScope, owner, 'editor').map((a) => a.id)
    expect(ids.some((id) => id.startsWith('nav:'))).toBe(false)
  })

  it('contributes nothing to any entity scope rail', () => {
    const caps: AppViewer = { caps: new Set(APPS.flatMap((a) => (a.gate.system === 'capability' ? [a.gate.capability] : []))) }
    for (const kind of ['circle', 'event', 'hub', 'nexus', 'journey', 'practice'] as const) {
      const ids = appsForScope({ kind, id: 'x' }, caps, 'editor').map((a) => a.id)
      expect(ids.some((id) => id.startsWith('nav:'))).toBe(false)
    }
  })

  it('leaves a non-admin href untouched when the operator nesting pass runs over it', () => {
    // The LEFT RAIL no longer runs this pass (2026-08-06): it re-sorted rows, so the rail could
    // not agree with the order an operator set in the Menu Manager. The function survives for
    // lib/nav/admin-rail.ts, which still derives the operator App rail's parentage from it — so
    // the identity-on-member-rows property still matters there, and stays pinned here.
    const rows = [{ href: '/feed' }, { href: '/circles' }, { href: '/events' }, { href: '/market' }]
    expect(nestAdminRows(rows)).toEqual(rows.map((r) => ({ ...r, depth: 0 })))
  })
})
