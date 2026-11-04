import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { config } from '@/lib/page-editor/config'
import type { Config, Data } from '@/lib/page-editor/types'
import { ROLES, ROLE_IDS } from '@/lib/blocks/roles/roles'
import { rolePreviewMetadata } from '@/components/page-editor/blocks/roles'
import { makeItem } from '@/components/page-editor/mobile/data-ops'
import { addCards, addSheet, insertSection } from './add'

const page = (types: string[] = []): Data => ({ root: { props: {} }, content: types.map((type, i) => ({ type, props: { id: `${type}-${i}` } })) } as Data)

describe('add a section by intent (BLD-202)', () => {
  it('offers every role on the site, named by its intent, in the five groups', () => {
    const cards = addCards(config, page(), { surface: 'site', theme: 'NewWorld' })
    expect(cards.map((c) => c.role).sort()).toEqual([...ROLE_IDS].sort())
    for (const c of cards) expect(c.intent).toBe(ROLES[c.role].intent)
    const { groups } = addSheet(cards, page())
    expect(groups.map((g) => g.group)).toEqual(['Welcome', 'Show up', 'Trust', 'Answer', 'More'])
  })
  it('offers only what the surface can show: no email-hidden role while the builder shows email', () => {
    const hidden = ROLE_IDS.filter((r) => ROLES[r].surfaces.email === 'hide')
    const email = addCards(config, page(), { surface: 'email', theme: 'NewWorld' }).map((c) => c.role)
    for (const r of hidden) expect(email).not.toContain(r)
    expect(email.length).toBe(ROLE_IDS.length - hidden.length)
  })
  it('offers only what the page kind allows: roles filed under a category the website palette lacks are not offered', () => {
    // `circles` is a marketing-only category (lib/page-editor/palette-scope.ts); file the roles there and the site has none.
    const categories = { ...(config.categories ?? {}), circles: { title: 'Circles', components: config.categories?.roles?.components ?? [] } } as Config['categories']
    delete (categories as Record<string, unknown>).roles
    const offered = addCards({ ...config, categories } as Config, page(), { surface: 'site', theme: 'NewWorld' })
    expect(offered).toEqual([])
  })
  it('suggests up to three roles the page lacks, in page order, and search narrows the groups', () => {
    const cards = addCards(config, page([ROLES.hero.type]), { surface: 'site', theme: 'NewWorld' })
    const { suggested } = addSheet(cards, page([ROLES.hero.type]))
    expect(suggested.map((c) => c.role)).toEqual(['stats', 'story', 'statement'])
    const found = addSheet(cards, page(), 'questions')
    expect(found.suggested).toEqual([])
    expect(found.groups.flatMap((g) => g.cards.map((c) => c.role))).toContain('faq')
    expect(addSheet(cards, page(), 'zzzz').groups).toEqual([])
  })
  it('inserts at the chosen place as one new document, and the new section is the one to select', () => {
    const doc = page([ROLES.hero.type, ROLES.cta.type])
    const { doc: next, id } = insertSection(doc, config, ROLES.faq.type, 1)
    expect(next.content.map((b) => b.type)).toEqual([ROLES.hero.type, ROLES.faq.type, ROLES.cta.type])
    expect(next.content[1].props.id).toBe(id)
    expect(doc.content).toHaveLength(2)
    expect(insertSection(doc, config, ROLES.faq.type, 99).doc.content.at(-1)?.type).toBe(ROLES.faq.type)
  })
})

describe('the Add preview (BLD-202): Space data when present, else the flagged sample', () => {
  const live = { space: { spaceId: 'sp1', stats: [{ label: 'Members', value: 312 }] } }
  // The preview draws exactly what Add inserts: a fresh item from the registry.
  const fresh = makeItem(config, ROLES.stats.type)
  const draw = (metadata: Record<string, unknown> | undefined) => renderToStaticMarkup(createElement(() => config.components[ROLES.stats.type].render({ ...fresh.props, puck: { metadata } } as never)))
  it('keeps the Space for a live role that has rows, and the preview draws them', () => {
    expect(rolePreviewMetadata('stats', live)).toBe(live)
    expect(draw(rolePreviewMetadata('stats', live))).toContain('312')
  })
  it('drops the Space when it has no rows, so the sample draws instead of nothing', () => {
    const empty = { space: { spaceId: 'sp1', stats: [] }, websiteFeatures: {} }
    const meta = rolePreviewMetadata('stats', empty)
    expect(meta).toEqual({ websiteFeatures: {} })
    const sample = (ROLES.stats.sample.items as { value: string }[])[0].value
    expect(draw(meta)).toContain(sample)
    // Rendered with the empty Space, a fresh block still showing sample words would draw nothing at all.
    if (fresh.props.sample === true) expect(draw(empty)).toBe('')
  })
  it('never hands a role that does not read the Space its rows', () => {
    expect(rolePreviewMetadata('hero', live)).toEqual({})
  })
})
