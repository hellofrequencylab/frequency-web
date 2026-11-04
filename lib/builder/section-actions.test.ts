import { describe, expect, it } from 'vitest'
import { config } from '@/lib/page-editor/config'
import { sectionVisibility, type WebsiteEditorState } from '@/lib/sites/editor/state'
import type { Data } from '@/lib/page-editor/types'
import { builderInit, builderPage, builderReducer } from './state'
import { sectionCommand } from './section-actions'

const doc: Data = { root: { props: {} }, content: [
  { type: 'ServicesHero', props: { id: 'hero', title: 'Hi' } },
  { type: 'ServicesStory', props: { id: 'story', title: 'Story', paragraphs: ['One'] } },
  { type: 'ServicesBand', props: { id: 'band', title: 'Bye' } },
] } as Data
const editorState = { revision: 1, draft: { theme: 'NewWorld', pages: [{ slug: 'home', label: 'Home', doc, comments: [] }] }, published: null, versions: [] } as unknown as WebsiteEditorState

describe('section actions (BLD-104)', () => {
  it.each(['up', 'down', 'copy', 'hide', 'delete'] as const)('%s is one undo step', (action) => {
    let state = builderInit(editorState)
    const result = sectionCommand(builderPage(state).doc, config, 'story', action, 'phone')!
    expect(result.doc).not.toBe(doc)
    state = builderReducer(state, { type: 'edit', draft: { ...state.draft, pages: [{ ...state.draft.pages[0], doc: result.doc }] } })
    expect(state.past).toHaveLength(1)
    state = builderReducer(state, { type: 'undo' })
    expect(builderPage(state).doc).toBe(doc)
  })
  it('duplicate selects the copy, delete selects nothing and offers Undo', () => {
    const copy = sectionCommand(doc, config, 'story', 'copy', 'desktop')!
    expect(copy.doc.content).toHaveLength(4)
    expect(copy.select).toBe(copy.doc.content[2].props.id)
    expect(copy.select).not.toBe('story')
    const gone = sectionCommand(doc, config, 'story', 'delete', 'desktop')!
    expect(gone.doc.content.map((s) => s.props.id)).toEqual(['hero', 'band'])
    expect(gone).toMatchObject({ select: null, undo: true })
  })
  it('hide touches only the device being edited, and a second press shows it again', () => {
    const hidden = sectionCommand(doc, config, 'story', 'hide', 'phone')!
    expect(sectionVisibility(hidden.doc, 'story')).toEqual({ desktop: true, tablet: true, phone: false })
    expect(sectionVisibility(sectionCommand(hidden.doc, config, 'story', 'hide', 'phone')!.doc, 'story').phone).toBe(true)
  })
  it('ignores a section that is not on the page', () => expect(sectionCommand(doc, config, 'nope', 'delete', 'desktop')).toBeNull())
})
