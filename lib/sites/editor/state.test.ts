import { describe, expect, it } from 'vitest'
import { nextWebsiteState, publishedWebsiteSnapshot, readWebsiteEditor, sectionDisplay, validWebsiteSnapshot, withoutWebsiteDrafts, type WebsiteEditorState, type WebsiteSnapshot } from './state'
const snapshot = (): WebsiteSnapshot => ({ theme: 'Menswork', pages: [{ slug: 'home', label: 'Home', doc: { root: {}, content: [{ type: 'Text', props: { id: 'text', text: 'Original' } }] }, seo: { title: '', description: '' }, comments: [{ id: 'c1', blockId: 'text', text: 'Private review', author: 'owner', createdAt: '2026-10-08T12:00:00Z', resolved: false }] }] })
const state = (): WebsiteEditorState => ({ v: 1, revision: 0, draft: snapshot(), published: null, versions: [] })
describe('website draft boundary', () => {
  it('keeps draft saves off the live site and strips review comments when published', () => {
    const saved = nextWebsiteState(state(), snapshot(), false, 'owner')
    expect(publishedWebsiteSnapshot({ websiteEditor: saved })).toBeNull()
    const live = nextWebsiteState(saved, snapshot(), true, 'owner')
    expect(live.published?.pages[0].comments).toEqual([])
    expect(live.draft.pages[0].comments).toHaveLength(1)
    expect(withoutWebsiteDrafts({ websiteEditor: live, profileLayout: 'unchanged' })).toEqual({ profileLayout: 'unchanged' })
  })
  it('captures scheduled content independently from subsequent autosaves', () => {
    const scheduled = nextWebsiteState(state(), snapshot(), false, 'owner', '2026-10-08T12:00:00Z', '2026-10-09T12:00:00Z')
    const changed = snapshot(); changed.pages[0].label = 'Unsaved later changes'
    const saved = nextWebsiteState(scheduled, changed, false, 'owner')
    expect(saved.published).toBeNull()
    expect(saved.scheduled?.snapshot.pages[0].label).toBe('Home')
    expect(saved.scheduled?.snapshot.pages[0].comments).toEqual([])
    expect(nextWebsiteState(saved, changed, true, 'owner').scheduled).toBeNull()
  })
  it('accepts comments pinned to nested blocks while rejecting duplicate child IDs', () => {
    const nested = snapshot()
    nested.pages[0].doc.content[0].props.children = [{ type: 'Text', props: { id: 'nested', text: 'Nested content' } }]
    nested.pages[0].comments[0].blockId = 'nested'
    expect(validWebsiteSnapshot(nested)).toBe(true)
    nested.pages[0].doc.content[0].props.children[0].props.id = 'text'
    expect(validWebsiteSnapshot(nested)).toBe(false)
  })
  it('bounds versions and validates retained state rather than blindly casting', () => {
    let current = state()
    for (let n = 0; n < 20; n++) current = nextWebsiteState(current, snapshot(), true, 'owner')
    expect(current.versions).toHaveLength(8)
    expect(readWebsiteEditor({ websiteEditor: current })).toEqual(current)
    expect(readWebsiteEditor({ websiteEditor: { ...current, versions: [{ snapshot: 'bad' }] } })).toBeNull()
    expect(validWebsiteSnapshot({ ...snapshot(), pages: [...snapshot().pages, ...snapshot().pages] })).toBe(false)
  })
  it('inherits desktop display settings while clamping invalid numeric controls', () => {
    const doc = { root: { props: { websiteLayout: { text: { desktop: { padding: 32, gap: 16, animation: 'rise' }, phone: { padding: 8, hidden: true, columns: 90, textSize: Infinity } } } } }, content: [] }
    expect(sectionDisplay(doc, 'text', 'phone')).toEqual({ padding: 8, gap: 16, animation: 'rise', hidden: true, columns: 4 })
  })
})
