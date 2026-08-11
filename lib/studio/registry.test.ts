import { describe, it, expect } from 'vitest'

// DRIFT GUARDS for the Studio catalog (ADR-986), the same posture as the menu-contract tests
// (lib/admin/modules/registry.test.ts). These fail the build when an entity is declared in a
// way the kernel cannot render, so a broken manifest never reaches a wizard.
//
// The STRUCTURAL half of the contract (no kernel -> entities import) is asserted by
// `pnpm check:studio`, because it is a filesystem property, not a runtime one.

import { STUDIO_ENTITIES, studioEntityIds, studioManifest } from './registry'
import { FIELD_KINDS, isCatalogOnly, isFieldKind, validateManifest } from './kernel/manifest'
import { buildFieldModel, sparkFields } from './kernel/review-kernel'

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

  it('gives every choice field a source of choices', () => {
    const all = [...manifest.fields, ...(manifest.repeats ?? []).flatMap((r) => r.fields)]
    for (const f of all.filter((x) => x.kind === 'select' || x.kind === 'reference')) {
      expect(Boolean(f.options) !== Boolean(f.optionsFrom), `${manifest.entity}.${f.path}`).toBe(true)
    }
  })

  it('asks the Spark for a SHORT list (a guided flow people abandon is worse than a form)', () => {
    // Not a style rule: the research on guided creation is consistent that time-to-first-output is
    // what decides completion. A Spark that asks twelve questions is a form wearing a costume.
    expect(sparkFields(manifest).length).toBeLessThanOrEqual(8)
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

describe('catalog-only vs wizard entities', () => {
  it('splits the catalog on what a manifest DECLARES, not a separate flag', () => {
    const catalogOnly = STUDIO_ENTITIES.filter(isCatalogOnly).map((m) => m.entity)
    const withWizards = STUDIO_ENTITIES.filter((m) => !isCatalogOnly(m)).map((m) => m.entity)
    // Owner decision 2026-08-11: these five get a catalog row so the universal Create affordance is
    // complete, but no guided flow. A name and a description do not need two doors and a mood dial.
    expect(catalogOnly.sort()).toEqual(['broadcast', 'channel', 'hub', 'nexus', 'room'])
    expect(withWizards.length).toBeGreaterThan(0)
  })

  it('never lets a catalog-only entity declare wizard capabilities', () => {
    for (const m of STUDIO_ENTITIES.filter(isCatalogOnly)) {
      expect(m.accepts ?? [], m.entity).toEqual([])
      expect(m.steer?.mood ?? false, m.entity).toBe(false)
    }
  })

  it('gives every WIZARD entity the mood dial (owner decision: moods are in)', () => {
    for (const m of STUDIO_ENTITIES.filter((x) => !isCatalogOnly(x))) {
      expect(m.steer?.mood, m.entity).toBe(true)
    }
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

  it('reports a choice field with no source of choices', () => {
    const problems = validateManifest({
      entity: 'broken',
      label: 'Broken',
      sections: [{ key: 'a', title: 'A', desc: 'x' }],
      fields: [{ path: 'p', label: 'P', kind: 'select', section: 'a' }],
    })
    expect(problems.join(' ')).toContain('no choices')
  })

  it('reports a choice field that declares BOTH options and optionsFrom', () => {
    const problems = validateManifest({
      entity: 'broken',
      label: 'Broken',
      sections: [{ key: 'a', title: 'A', desc: 'x' }],
      fields: [
        { path: 'p', label: 'P', kind: 'select', section: 'a', options: [{ value: 'x', label: 'X' }], optionsFrom: 'things' },
      ],
    })
    expect(problems.join(' ')).toContain('BOTH')
  })

  it('reports an EMPTY option set (a field that exists but could never be set)', () => {
    const problems = validateManifest({
      entity: 'broken',
      label: 'Broken',
      sections: [{ key: 'a', title: 'A', desc: 'x' }],
      fields: [{ path: 'p', label: 'P', kind: 'select', section: 'a', options: [] }],
    })
    expect(problems.join(' ')).toContain('EMPTY')
  })

  it('reports options hung on a kind that has no dropdown', () => {
    const problems = validateManifest({
      entity: 'broken',
      label: 'Broken',
      sections: [{ key: 'a', title: 'A', desc: 'x' }],
      fields: [{ path: 'p', label: 'P', kind: 'text', section: 'a', options: [{ value: 'x', label: 'X' }] }],
    })
    expect(problems.join(' ')).toContain('no dropdown')
  })

  it('accepts a reference that loads its choices from the surface', () => {
    expect(
      validateManifest({
        entity: 'fine',
        label: 'Fine',
        sections: [{ key: 'a', title: 'A', desc: 'x' }],
        fields: [{ path: 'p', label: 'P', kind: 'reference', section: 'a', optionsFrom: 'circles' }],
      }),
    ).toEqual([])
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
