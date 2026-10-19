import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { resolveSpaceAuthoredContent } from '@/lib/spaces/authored-content'
import { data, space, GOLDEN_DOCS } from './space-profile-modules.fixture'

// The two reads the renderer awaits reach the database; the fixture stands in for both.
vi.mock('@/lib/spaces/content-data', () => ({ getSpaceContentData: async () => data() }))
vi.mock('@/lib/spaces/page-doc', () => ({
  loadSpaceAuthoredContent: async (prefs: unknown, name: string) => resolveSpaceAuthoredContent(prefs, name),
}))

import { SpaceProfileModules } from './space-profile-modules'
import { parseEntityLayout } from '@/lib/entity-blocks/layout'

// E0 TASK 12 RENDER GATE (docs/EDITOR-E0.md §8 row 12: "old ⇄ new renderToStaticMarkup equal per block").
// space-profile-modules.golden.json was written by the TYPE-KEYED renderer (resolveRows + content[id]) on
// 2026-10-19, before the grid path switched to nodes, over the stored shapes a Space grid takes (two
// columns, a lead ratio, a row header, hidden and unknown types, a refused second data block). The node
// renderer must reproduce each one byte for byte. Rewrite a golden only with a reason in the PR body.

const GOLDEN: Record<string, string> = JSON.parse(
  readFileSync('components/widgets/space-profile/space-profile-modules.golden.json', 'utf8'),
)

async function render(raw: unknown): Promise<string> {
  return renderToStaticMarkup(await SpaceProfileModules({ space: space(), grid: parseEntityLayout(raw) }))
}

describe('SpaceProfileModules renders nodes byte-identically to the type-keyed renderer', () => {
  for (const [name, raw] of Object.entries(GOLDEN_DOCS)) {
    it(name, async () => {
      expect(GOLDEN[name], 'golden missing').toBeTypeOf('string')
      expect(await render(raw)).toBe(GOLDEN[name])
    })
  }
})

describe('what nodes make possible', () => {
  it('two text blocks in two columns each draw their own words and their own style', async () => {
    const html = await render({
      rows: [
        {
          id: 'r0',
          columns: 2,
          cells: [
            [{ nid: 'naaaaaaaaa1', type: 'text', content: { text: '<p>Left words</p>' }, style: { align: 'center' } }],
            [{ nid: 'naaaaaaaaa2', type: 'text', content: { text: '<p>Right words</p>' } }],
          ],
        },
      ],
      bench: [],
    })
    expect(html).toContain('Left words')
    expect(html).toContain('Right words')
    expect(html.split('text-center').length - 1).toBe(1)
  })

  it('a benched node and an unknown type draw nothing, and the page still renders', async () => {
    const html = await render({
      rows: [{ id: 'r0', columns: 1, cells: [[{ nid: 'naaaaaaaaa1', type: 'retiredBlock', content: { x: 1 } }, 'about']] }],
      bench: [{ nid: 'naaaaaaaaa3', type: 'heading', content: { text: 'Benched heading' } }],
    })
    expect(html).toContain('id="about"')
    expect(html).not.toContain('Benched heading')
  })
})
