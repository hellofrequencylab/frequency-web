import { describe, expect, it } from 'vitest'
import { resolveRows } from '@/lib/entity-blocks/layout'
import { readTypeKeyedGrid } from '@/lib/entity-blocks/node-projection'
import { upgradeLayout } from '@/lib/entity-blocks/node-tree'
import { siteHasContactPage, planHouseSections } from '@/lib/sites/house-theme'
import { readContactFormContent } from '@/lib/spaces/contact-tab'
import { seedWebsiteHome } from '@/lib/sites/editor/seed'
import type { Space } from '@/lib/spaces/types'

// E0 task 12b. The readers that ask "which block types does this Space place" read a stored node document
// through its type-keyed view, so switching the render path on does not blank them.

const legacy = { rows: [{ id: 'r0', columns: 1, cells: [['text', 'contactForm']] }], content: { contactForm: { heading: 'Say hi' } } }
const native = () => {
  const nodes = upgradeLayout(legacy)!
  return { rows: nodes.rows, bench: nodes.bench }
}

describe('readTypeKeyedGrid', () => {
  it('reads a legacy document exactly as parseEntityLayout does', () => {
    const grid = readTypeKeyedGrid(legacy)!
    expect(resolveRows(grid, 'space').flatMap((r) => r.cells.flat())).toEqual(['text', 'contactForm'])
  })

  it('projects a native node document to its shown types with their bags', () => {
    const grid = readTypeKeyedGrid(native())!
    expect(grid.rows!.flatMap((r) => r.cells.flat())).toEqual(['text', 'contactForm'])
    expect(grid.content?.contactForm).toEqual({ heading: 'Say hi' })
    expect(grid.nodes).toBeDefined()
  })

  it('leaves a hidden node out of the projection', () => {
    const doc = native()
    doc.rows[0].cells[0][1] = { ...doc.rows[0].cells[0][1], hidden: true }
    expect(readTypeKeyedGrid(doc)!.rows!.flatMap((r) => r.cells.flat())).toEqual(['text'])
  })
})

describe('type-keyed readers on a native document', () => {
  const prefs = { profileLayout: native() }
  it('finds the Contact form for the website', () => {
    expect(siteHasContactPage(prefs)).toBe(true)
    expect(siteHasContactPage({ profileLayout: legacy })).toBe(true)
  })
  it('reads the Contact form words', () => {
    expect(readContactFormContent(prefs)).toEqual({ heading: 'Say hi' })
  })
  it('plans the house sections from the placed types', () => {
    const rows = readTypeKeyedGrid(prefs.profileLayout)!.rows!
    expect(planHouseSections(rows).length).toBeGreaterThan(0)
  })
  it('seeds the website home from the placed types', () => {
    const space = { name: 'Calm', preferences: prefs } as unknown as Space
    const doc = seedWebsiteHome(space, { root: {}, content: [] })
    expect(doc.content.map((c) => c.type)).toContain('SpaceContact')
  })
})
