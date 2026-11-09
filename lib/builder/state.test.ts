import { describe, it, expect } from 'vitest'
import { builderInit, builderReducer, builderDirty, builderSaveLabel, builderV3Cohort, builderV3Requested, BUILDER_HISTORY_DEPTH, type BuilderState } from './state'
import type { WebsiteEditorState, WebsiteSnapshot } from '@/lib/sites/editor/state'

const snap = (title: string): WebsiteSnapshot => ({ theme: 'NewWorld', pages: [{ slug: 'home', label: 'Home', seo: { title: '', description: '' }, comments: [], doc: { root: { props: {} }, content: [{ type: 'PhotoHero', props: { id: 'a', title } }, { type: 'SpaceFAQ', props: { id: 'b' } }] } }, { slug: 'about', label: 'About', seo: { title: '', description: '' }, comments: [], doc: { root: { props: {} }, content: [{ type: 'Zigzag', props: { id: 'c' } }] } }] } as unknown as WebsiteSnapshot)
const initial: WebsiteEditorState = { v: 1, revision: 4, draft: snap('One'), published: snap('One'), versions: [] }

describe('builder state', () => {
  it('opens on the first page with its first section selected, clean and live', () => {
    const s = builderInit(initial)
    expect([s.pageSlug, s.selectedId, s.save, s.device, s.surface, s.preview]).toEqual(['home', 'a', 'saved', 'desktop', 'site', false])
    expect(builderDirty(s)).toBe(false)
  })
  it('records an edit as one undo step, and undo and redo walk it', () => {
    let s = builderReducer(builderInit(initial), { type: 'edit', draft: snap('Two') })
    expect([s.save, s.past.length, builderDirty(s)]).toEqual(['unsaved', 1, true])
    s = builderReducer(s, { type: 'undo' })
    expect([s.draft.pages[0].doc.content[0].props.title, s.future.length]).toEqual(['One', 1])
    s = builderReducer(s, { type: 'redo' })
    expect(s.draft.pages[0].doc.content[0].props.title).toBe('Two')
  })
  it('keeps at most 60 undo steps', () => {
    let s: BuilderState = builderInit(initial)
    for (let i = 0; i < 70; i++) s = builderReducer(s, { type: 'edit', draft: snap(String(i)) })
    expect(s.past.length).toBe(BUILDER_HISTORY_DEPTH)
  })
  it('a save that lands while a later edit waits keeps that edit unsaved', () => {
    let s = builderReducer(builderInit(initial), { type: 'edit', draft: snap('Two') })
    s = builderReducer(s, { type: 'saving' })
    s = builderReducer(s, { type: 'edit', draft: snap('Three') })
    s = builderReducer(s, { type: 'saved', state: { ...initial, revision: 5 }, publish: false })
    expect([s.revision, s.save]).toEqual([5, 'unsaved'])
  })
  it('switching page selects that page\'s first section; preview clears the selection', () => {
    let s = builderReducer(builderInit(initial), { type: 'page', slug: 'about' })
    expect([s.pageSlug, s.selectedId]).toEqual(['about', 'c'])
    s = builderReducer(s, { type: 'preview', on: true })
    expect(s.selectedId).toBeNull()
  })
  it('goes offline and comes back unsaved, and names each state', () => {
    let s = builderReducer(builderInit(initial), { type: 'offline', offline: true })
    expect(builderSaveLabel(s.save)).toBe('Offline · changes kept here')
    s = builderReducer(s, { type: 'offline', offline: false })
    expect(s.save).toBe('unsaved')
  })
  it('opens only when asked: ?builder=v3 or the switch; classic always wins', () => {
    expect(builderV3Requested(undefined, false)).toBe(false)
    expect(builderV3Requested('v3', false)).toBe(true)
    expect(builderV3Requested(undefined, true)).toBe(true)
    expect(builderV3Requested('classic', true)).toBe(false)
  })

  it('opens for a Space in the cohort, and classic still wins there (BLD-108)', () => {
    const cohort = builderV3Cohort(' danieltyack, Frequency\nmoflow ')
    expect([...cohort]).toEqual(['danieltyack', 'frequency', 'moflow'])
    expect(builderV3Cohort(undefined).size).toBe(0)
    expect(builderV3Cohort('   ').size).toBe(0)
    expect(builderV3Requested(undefined, false, cohort, 'danieltyack')).toBe(true)
    expect(builderV3Requested(undefined, false, cohort, 'Frequency')).toBe(true)
    expect(builderV3Requested(undefined, false, cohort, 'someone-else')).toBe(false)
    expect(builderV3Requested(undefined, false, cohort, null)).toBe(false)
    expect(builderV3Requested('classic', false, cohort, 'danieltyack')).toBe(false)
    // The flag off and no cohort: the current editor, exactly as before.
    expect(builderV3Requested(undefined, false, builderV3Cohort(null), 'danieltyack')).toBe(false)
  })
})

describe('typing bursts (BLD-105)', () => {
  it('folds keys in one field into one undo step, and a new field starts a new one', () => {
    const doc = { root: { props: {} }, content: [] }
    const init = { revision: 1, draft: { theme: 'NewWorld', pages: [{ slug: 'home', label: 'Home', doc, comments: [] }] }, published: null, versions: [] }
    let s = builderInit(init as never)
    const original = s.draft
    const typed = (text: string, burst: string) => { s = builderReducer(s, { type: 'edit', draft: { ...s.draft, theme: text } as never, burst }) }
    typed('a', 'props:x:title'); typed('ab', 'props:x:title'); typed('abc', 'props:x:title')
    expect(s.past).toHaveLength(1)
    typed('abcd', 'props:x:lead')
    expect(s.past).toHaveLength(2)
    s = builderReducer(builderReducer(s, { type: 'undo' }), { type: 'undo' })
    expect(s.draft).toBe(original)
  })
})
