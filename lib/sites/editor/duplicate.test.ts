import { expect, it } from 'vitest'
import type { Config, Data } from '@/lib/page-editor/types'
import { duplicateWebsiteSection } from './duplicate'

const config: Config = { components: {
  Section: { fields: { children: { type: 'slot' } }, render: () => null },
  Text: { render: () => null },
} }

it('duplicates authored responsive design for the whole subtree without stealing anchors', () => {
  const doc: Data = { root: { props: { websiteLayout: {
    section: { desktop: { padding: 64, tone: 'sand', anchor: 'welcome', placements: { '0.0': { column: 2, span: 6, row: 1 } } }, phone: { padding: 16, hidden: true } },
    child: { desktop: { textSize: 48, anchor: 'story' }, tablet: { textSize: 32 } },
  } } }, content: [{ type: 'Section', props: { id: 'section', children: [{ type: 'Text', props: { id: 'child', text: 'Keep this copy' } }] } }] }
  const before = structuredClone(doc)
  const result = duplicateWebsiteSection(doc, config, 'section')
  const copy = result.data.content[1]
  const child = copy.props.children[0]
  expect(copy.props.id).not.toBe('section')
  expect(child.props.id).not.toBe('child')
  const layout = result.data.root.props!.websiteLayout
  expect(layout[copy.props.id!]).toEqual({ desktop: { padding: 64, tone: 'sand', placements: { '0.0': { column: 2, span: 6, row: 1 } } }, phone: { padding: 16, hidden: true } })
  expect(layout[child.props.id]).toEqual({ desktop: { textSize: 48 }, tablet: { textSize: 32 } })
  expect(child.props.text).toBe('Keep this copy')
  layout[copy.props.id!].desktop.padding = 8
  expect(doc).toEqual(before)
})

it('retains no-op and unstyled document behavior', () => {
  const doc: Data = { root: {}, content: [{ type: 'Text', props: { id: 'text' } }] }
  expect(duplicateWebsiteSection(doc, config, 'missing')).toEqual({ data: doc, id: '' })
  expect(duplicateWebsiteSection(doc, config, 'text').data.content).toHaveLength(2)
})
