import { describe, expect, it } from 'vitest'
import { config } from '@/lib/page-editor/config'
import { ROLES, ROLE_IDS } from '@/lib/blocks/roles/roles'
import { tuneDeclared, tuneProjection } from './tune'

describe('tuneProjection (BLD-105)', () => {
  const adopted = ROLE_IDS.filter((r) => config.components[ROLES[r].type])
  it('covers the adopted roles', () => expect(adopted.length).toBeGreaterThan(15))

  it.each(adopted)('%s: the rendered fields equal the projection, no more and no fewer', (role) => {
    const type = ROLES[role].type
    const p = tuneProjection(type, config)
    const drawn = [...p.layer1, ...p.layer2].map((f) => f.key)
    expect(new Set(drawn).size).toBe(drawn.length)
    expect([...drawn].sort()).toEqual([...tuneDeclared(type, config)].sort())
    expect(p.role).toBe(role)
  })

  it.each(adopted)('%s: layer 1 is the role slots, required first', (role) => {
    const p = tuneProjection(ROLES[role].type, config)
    const required = p.layer1.filter((f) => f.required)
    expect(p.layer1.slice(0, required.length)).toEqual(required)
    expect(p.layer2.some((f) => f.key === 'title' || f.key === 'eyebrow')).toBe(false)
  })

  it('reads the slot limits', () => {
    const story = tuneProjection(ROLES.story.type, config)
    expect(story.layer1[0]).toMatchObject({ key: 'items', kind: 'list', required: true, min: 1, max: 5 })
    expect(story.layer1.find((f) => f.key === 'eyebrow')).toMatchObject({ limit: 40 })
    expect(story.layer1.find((f) => f.key === 'title')).toMatchObject({ limit: 120 })
    const hero = tuneProjection(ROLES.hero.type, config)
    expect(hero.layer1.slice(0, 1)).toMatchObject([{ key: 'title', required: true, limit: 120 }])
    expect(hero.layer1.map((f) => f.key)).toContain('primaryHref')
  })

  it('draws a block with no role from its own fields: words first, looks under More', () => {
    const p = tuneProjection('ServicesStory', config)
    expect(p.role).toBeNull()
    expect(p.layer1.map((f) => f.key)).toEqual(['eyebrow', 'title', 'paragraphs', 'buttonLabel', 'buttonHref', 'image', 'alt'])
    expect(p.layer2.map((f) => f.key)).toEqual(['frame'])
  })
})
