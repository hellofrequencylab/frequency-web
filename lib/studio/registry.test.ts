import { describe, it, expect } from 'vitest'

// DRIFT GUARDS for the Studio catalog (ADR-986), the same posture as the menu-contract tests
// (lib/admin/modules/registry.test.ts). These fail the build when an entity is declared in a
// way the kernel cannot render, so a broken manifest never reaches a wizard.
//
// The STRUCTURAL half of the contract (no kernel -> entities import) is asserted by
// `pnpm check:studio`, because it is a filesystem property, not a runtime one.

import { STUDIO_ENTITIES, studioEntityIds, studioManifest } from './registry'
import { FIELD_KINDS, isFieldKind, validateManifest } from './kernel/manifest'
import { buildFieldModel } from './kernel/review-kernel'

describe('the Studio catalog', () => {
  it('declares at least one entity', () => {
    expect(STUDIO_ENTITIES.length).toBeGreaterThan(0)
  })

  it('has no duplicate entity ids', () => {
    const ids = studioEntityIds()
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('resolves every id back to its manifest, and nothing else', () => {
    for (const id of studioEntityIds()) expect(studioManifest(id)?.entity).toBe(id)
    expect(studioManifest('not-an-entity')).toBeNull()
  })
})

describe.each(STUDIO_ENTITIES.map((m) => [m.entity, m] as const))('manifest: %s', (_entity, manifest) => {
  it('is well formed', () => {
    expect(validateManifest(manifest)).toEqual([])
  })

  it('only uses field kinds the kernel knows how to render', () => {
    const kinds = [...manifest.fields, ...(manifest.repeats ?? []).flatMap((r) => r.fields)].map((f) => f.kind)
    for (const kind of kinds) expect(isFieldKind(kind)).toBe(true)
    expect(FIELD_KINDS.length).toBeGreaterThan(0)
  })

  it('groups every field into a declared section', () => {
    const keys = new Set(manifest.sections.map((s) => s.key))
    for (const f of manifest.fields) expect(keys.has(f.section)).toBe(true)
    for (const r of manifest.repeats ?? []) expect(keys.has(r.section)).toBe(true)
  })

  it('builds a model from an EMPTY draft without throwing (the cold-start path)', () => {
    const model = buildFieldModel(manifest, {})
    expect(model.summary.blocked).toBe(false)
    expect(Array.isArray(model.sections)).toBe(true)
  })

  it('can clear its commercial facts (a gated field with verify:none could never publish)', () => {
    const hasCommercial =
      manifest.fields.some((f) => f.commercial) || (manifest.repeats ?? []).some((r) => r.fields.some((f) => f.commercial))
    if (hasCommercial) expect(manifest.verify ?? 'none').not.toBe('none')
  })
})

describe('validateManifest', () => {
  it('reports an unknown field kind rather than throwing', () => {
    const problems = validateManifest({
      entity: 'broken',
      label: 'Broken',
      sections: [{ key: 'a', title: 'A', desc: 'x' }],
      fields: [{ path: 'p', label: 'P', kind: 'not-a-kind' as never, section: 'a' }],
    })
    expect(problems.join(' ')).toContain('unknown kind')
  })

  it('reports a field pointing at an undeclared section', () => {
    const problems = validateManifest({
      entity: 'broken',
      label: 'Broken',
      sections: [{ key: 'a', title: 'A', desc: 'x' }],
      fields: [{ path: 'p', label: 'P', kind: 'text', section: 'nope' }],
    })
    expect(problems.join(' ')).toContain('not declared')
  })

  it('reports a commercial field that could never clear', () => {
    const problems = validateManifest({
      entity: 'broken',
      label: 'Broken',
      sections: [{ key: 'a', title: 'A', desc: 'x' }],
      fields: [{ path: 'p', label: 'P', kind: 'price', section: 'a', commercial: true }],
    })
    expect(problems.join(' ')).toContain('could never clear')
  })
})
