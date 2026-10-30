import { describe, it, expect } from 'vitest'
import { LEGACY_RULES, legacyCoverage, upgradeBlock, upgradeDocument } from './legacy-map'
import { ROLES } from './roles'

describe('legacy map (LIVE-1860)', () => {
  it('every rule names a legacy type its role claims', () => {
    for (const type of Object.keys(LEGACY_RULES)) {
      expect(legacyCoverage().find((c) => c.type === type), type).toBeTruthy()
      expect(ROLES[LEGACY_RULES[type].role].replaces, type).toContain(type)
    }
  })

  it('carries words and buttons over and keeps the block id', () => {
    const out = upgradeBlock({ type: 'MidnightCTA', props: { id: 'b1', title: 'Join us', buttonLabel: 'Go', buttonHref: '/x', frame: 'x' } })
    expect(out).toEqual({ type: 'RoleCta', props: { id: 'b1', title: 'Join us', primaryLabel: 'Go', primaryHref: '/x' } })
  })

  it('turns a Space-fed block into a live role block', () => {
    expect(upgradeBlock({ type: 'LiveEvents', props: { id: 'e' } })?.props.live).toBe(true)
  })

  it('leaves blocks it cannot carry over untouched and says so', () => {
    const doc = { content: [{ type: 'MidnightOfferings', props: { id: 'o', title: 'T', offerings: [{}] } }, { type: 'Paragraph', props: { id: 'p' } }] }
    const r = upgradeDocument(doc)
    expect(r.doc).toBe(doc)
    expect(r.changes).toEqual([])
    expect(r.kept).toEqual([{ id: 'o', type: 'MidnightOfferings' }])
  })

  it('is pure, reports a diff, and can be limited to chosen blocks', () => {
    const doc = { content: [{ type: 'MidnightHero', props: { id: 'h', title: 'Hi' } }, { type: 'MidnightBand', props: { id: 'k', title: 'Band' } }] }
    const snapshot = JSON.stringify(doc)
    const r = upgradeDocument(doc, new Set(['h']))
    expect(JSON.stringify(doc)).toBe(snapshot)
    expect(r.changes).toEqual([{ id: 'h', from: 'MidnightHero', to: 'RoleHero', role: 'hero' }])
    expect(r.doc.content?.[1]).toBe(doc.content[1])
  })
})
