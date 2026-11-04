import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { config } from '@/lib/page-editor/config'
import type { Data } from '@/lib/page-editor/types'
import { ROLES } from '@/lib/blocks/roles/roles'
import { builderInit, builderReducer } from './state'
import { applyLegacy, legacyPlan } from './legacy'

// A legacy page: two blocks the map converts (a Midnight hero and a Network-kit call to action) and one it keeps (its tiers do not fit the role yet).
const legacyDoc = (): Data => ({
  root: { props: {} },
  content: [
    { type: 'MidnightHero', props: { id: 'h', eyebrow: 'Thursdays', title: 'Come as you are', lead: 'A small room, a big table.', primaryLabel: 'Join us', primaryHref: '/join', glow: 'violet' } },
    { type: 'NetworkKitCTA', props: { id: 'c', title: 'Bring a friend', buttonLabel: 'Save a seat', buttonHref: '/book' } },
    { type: 'MidnightMembership', props: { id: 'p', title: 'Ways in', tiers: [] } },
  ],
} as unknown as Data)

const known = (type: string) => !!config.components[type]
const render = (doc: Data) => doc.content.map((b) => {
  const r = config.components[b.type]?.render as ((p: unknown) => React.ReactElement) | undefined
  return r ? renderToStaticMarkup(createElement(() => r({ ...b.props, puck: { metadata: { theme: 'Midnight' } } }))) : `<missing ${b.type}>`
}).join('\n')

describe('update to new layouts in the builder (BLD-205)', () => {
  it('plans each convertible section with its role version beside it, and lists what stays', () => {
    const doc = legacyDoc()
    const plan = legacyPlan(doc, config)
    expect(plan.rows.map((r) => [r.id, r.role])).toEqual([['h', 'hero'], ['c', 'cta']])
    const hero = plan.rows[0]
    expect(hero.before).toBe(doc.content[0])
    expect(hero.after.type).toBe(ROLES.hero.type)
    expect(hero.after.props).toMatchObject({ id: 'h', title: 'Come as you are', lead: 'A small room, a big table.', primaryLabel: 'Join us', primaryHref: '/join' })
    expect(hero.to).toBe(ROLES.hero.intent)
    expect(hero.carried.length).toBeGreaterThan(0)
    expect(hero.dropped).toEqual(['glow'])
    expect(plan.rows[1].after.props).toMatchObject({ primaryLabel: 'Save a seat', primaryHref: '/book' })
    expect(plan.kept.map((k) => k.id)).toEqual(['p'])
  })

  it('applies only the picked sections, as one new document; a pick of nothing changes nothing', () => {
    const doc = legacyDoc()
    expect(applyLegacy(doc, new Set())).toBe(doc)
    const one = applyLegacy(doc, new Set(['c']))
    expect(one.content.map((b) => b.type)).toEqual(['MidnightHero', ROLES.cta.type, 'MidnightMembership'])
    expect(doc.content[1].type).toBe('NetworkKitCTA')
  })

  it('a legacy page renders identically before the action and after undo', () => {
    const doc = legacyDoc()
    const page = { slug: 'home', label: 'Home', doc, seo: { title: '', description: '' }, comments: [] }
    const draft = { pages: [page] } as never
    const start = builderInit({ draft, revision: 1, published: null } as never)
    const before = render(doc)
    const applied = applyLegacy(doc, new Set(legacyPlan(doc, config).rows.map((r) => r.id)))
    const edited = builderReducer(start, { type: 'edit', draft: { ...start.draft, pages: [{ ...page, doc: applied }] } })
    expect(edited.past).toHaveLength(1)
    expect(render(edited.draft.pages[0].doc)).not.toBe(before)
    const undone = builderReducer(edited, { type: 'undo' })
    expect(undone.draft.pages[0].doc).toEqual(doc)
    expect(render(undone.draft.pages[0].doc)).toBe(before)
    // Every type on the page before and after names a block the editor knows (the stored-blocks rule).
    for (const b of [...doc.content, ...applied.content]) expect(known(b.type), b.type).toBe(true)
  })
})
