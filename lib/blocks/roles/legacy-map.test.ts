import { describe, it, expect } from 'vitest'
import { upgradeDocument } from './legacy-map'
import { ROLES, type RoleId } from './roles'

const one = (type: string, props: Record<string, unknown> = {}) => upgradeDocument({ content: [{ type, props: { id: 'x', ...props } }] })

describe('legacy map (LIVE-1860)', () => {
  it('only converts to a role that claims the old type', () => {
    const claimed = new Map((Object.keys(ROLES) as RoleId[]).flatMap((r) => ROLES[r].replaces.map((t) => [t, ROLES[r].type] as const)))
    for (const [type, roleType] of claimed) {
      const r = one(type)
      if (r.changes.length) expect(r.doc.content?.[0].type, type).toBe(roleType)
    }
  })

  it('carries words and buttons over and keeps the block id', () => {
    const r = upgradeDocument({ content: [{ type: 'MidnightCTA', props: { id: 'b1', title: 'Join us', buttonLabel: 'Go', buttonHref: '/x', frame: 'x' } }] })
    expect(r.doc.content?.[0]).toEqual({ type: 'RoleCta', props: { id: 'b1', title: 'Join us', primaryLabel: 'Go', primaryHref: '/x' } })
  })

  it('turns a Space-fed block into a live role block', () => {
    expect(one('LiveEvents').doc.content?.[0].props.live).toBe(true)
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
