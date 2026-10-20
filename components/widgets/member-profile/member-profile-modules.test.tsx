import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemberProfileModules } from './member-profile-modules'
import { parseEntityLayout } from '@/lib/entity-blocks/layout'
import { GOLDEN_DOCS, member } from './member-profile-modules.fixture'

// E0 TASK 12 RENDER GATE (docs/EDITOR-E0.md §8 row 12: "old ⇄ new renderToStaticMarkup equal per block").
// member-profile-modules.golden.json was written by the TYPE-KEYED renderer (resolveRows + content[id]) on
// 2026-10-19, before the grid path switched to nodes, over every stored shape a member grid takes. The
// node renderer must reproduce each one byte for byte. Rewrite a golden only with a reason in the PR body.

const GOLDEN: Record<string, string> = JSON.parse(
  readFileSync('components/widgets/member-profile/member-profile-modules.golden.json', 'utf8'),
)

function render(raw: unknown): string {
  const grid = raw === null ? null : parseEntityLayout(raw)
  return renderToStaticMarkup(<MemberProfileModules member={member()} grid={grid} />)
}

describe('MemberProfileModules renders nodes byte-identically to the type-keyed renderer', () => {
  for (const [name, raw] of Object.entries(GOLDEN_DOCS)) {
    if (name === 'rows wider than a member may hold') continue
    it(name, () => {
      expect(GOLDEN[name], 'golden missing').toBeTypeOf('string')
      expect(render(raw)).toBe(GOLDEN[name])
    })
  }

  it('the one documented difference: a row wider than the kind allows FOLDS its overflow instead of dropping it', () => {
    // The legacy clamp dropped column two (`stats`); the node resolver folds it onto the kept column, as the
    // write guard does (ADR-1831: a node carries a bag, and dropping a bag is loss). A stored member document
    // is sanitized to one column on write, so this only ever applies to a hand-written document.
    const html = render(GOLDEN_DOCS['rows wider than a member may hold'])
    expect(html).toContain('id="about"')
    expect(html).toContain('id="stats"')
    expect(GOLDEN['rows wider than a member may hold']).not.toContain('id="stats"')
  })
})

describe('what nodes make possible', () => {
  it('two text blocks on one page each draw their own words from a native node document', () => {
    const html = render({
      rows: [
        {
          id: 'r0',
          columns: 1,
          cells: [
            [
              { nid: 'naaaaaaaaa1', type: 'text', content: { text: '<p>First words</p>' } },
              { nid: 'naaaaaaaaa2', type: 'text', content: { text: '<p>Second words</p>' } },
            ],
          ],
        },
      ],
      bench: [],
    })
    expect(html).toContain('First words')
    expect(html).toContain('Second words')
  })

  it('a legacy document with a repeated type gives the sibling bag to the first placement only', () => {
    const html = render({
      rows: [{ id: 'r0', columns: 1, cells: [['text', 'text']] }],
      content: { text: { text: '<p>Only once</p>' } },
    })
    expect(html.split('Only once').length - 1).toBe(1)
  })

  it('a hidden node and a benched node draw nothing', () => {
    const html = render({
      rows: [
        {
          id: 'r0',
          columns: 1,
          cells: [
            [
              { nid: 'naaaaaaaaa1', type: 'heading', content: { text: 'Shown' } },
              { nid: 'naaaaaaaaa2', type: 'quote', content: { text: 'Hidden' }, hidden: true },
            ],
          ],
        },
      ],
      bench: [{ nid: 'naaaaaaaaa3', type: 'text', content: { text: '<p>Benched</p>' } }],
    })
    expect(html).toContain('Shown')
    expect(html).not.toContain('Hidden')
    expect(html).not.toContain('Benched')
  })
})
