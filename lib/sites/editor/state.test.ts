import { describe, expect, it } from 'vitest'
import { nextWebsiteState, publishedWebsitePage, publishedWebsiteSnapshot, readWebsiteEditor, resolveWebsiteBrand, resolveWebsiteChrome, resolveWebsiteChromeCta, RESERVED_WEBSITE_SLUGS, WEBSITE_THEMES, sectionDisplay, updateSectionDisplay, validWebsiteSnapshot, withoutWebsiteDrafts, type WebsiteEditorState, type WebsiteSnapshot, type SiteComment, type SectionDisplay } from './state'
const comment = (): SiteComment => ({ id: 'c1', blockId: 'text', text: 'Private review', author: 'owner', createdAt: '2026-10-08T12:00:00Z', resolved: false })
const snapshot = (): WebsiteSnapshot => ({ theme: 'Menswork', pages: [{ slug: 'home', label: 'Home', doc: { root: {}, content: [{ type: 'Text', props: { id: 'text', text: 'Original' } }] }, seo: { title: '', description: '' }, comments: [comment()] }] })
const state = (): WebsiteEditorState => ({ v: 1, revision: 0, draft: snapshot(), published: null, versions: [] })
describe('website draft boundary', () => {
  it('accepts every supported theme and rejects routing collisions', () => {
    for (const theme of WEBSITE_THEMES) expect(validWebsiteSnapshot({ ...snapshot(), theme })).toBe(true)
    expect(validWebsiteSnapshot({ ...snapshot(), theme: 'Unknown' })).toBe(false)
    for (const slug of RESERVED_WEBSITE_SLUGS) {
      const draft = snapshot()
      draft.pages.push({ ...draft.pages[0], slug })
      expect(validWebsiteSnapshot(draft), slug).toBe(false)
    }
  })
  it('validates website-only branding and captures it independently when publishing', () => {
    const draft = snapshot(); draft.brand = { logo: 'https://assets.example/logo.png', accent: '#2b8050' }
    expect(validWebsiteSnapshot(draft)).toBe(true)
    expect(resolveWebsiteBrand(draft, { logo: '/original.png', accent: '#123456' })).toEqual(draft.brand)
    const live = nextWebsiteState(state(), draft, true, 'owner')
    draft.brand.logo = '/later.png'
    expect(live.published?.brand?.logo).toBe('https://assets.example/logo.png')
    expect(resolveWebsiteBrand({ ...snapshot(), brand: { logo: null } }, { logo: '/old.png', accent: '#123456' })).toEqual({ logo: null, accent: '#123456' })
    for (const logo of ['javascript:alert(1)', '//foreign.example/logo', 'https://']) expect(validWebsiteSnapshot({ ...snapshot(), brand: { logo } })).toBe(false)
    expect(validWebsiteSnapshot({ ...snapshot(), brand: { accent: 'red' } })).toBe(false)
  })
  it('bounds positioned comment threads and strips every reply from public snapshots', () => {
    const draft = snapshot(); draft.pages[0].comments[0] = { ...draft.pages[0].comments[0], x: 0.3, y: 0.7, replies: [{ id: 'reply', body: 'Thread reply', author: 'Editor', createdAt: '2026-10-08T12:00:00Z' }] }
    expect(validWebsiteSnapshot(draft)).toBe(true)
    expect(nextWebsiteState(state(), draft, true, 'Owner').published?.pages[0].comments).toEqual([])
    draft.pages[0].comments[0].x = 1.1
    expect(validWebsiteSnapshot(draft)).toBe(false)
    draft.pages[0].comments[0].x = 0.3
    draft.pages[0].comments[0].replies!.push({ ...draft.pages[0].comments[0].replies![0] })
    expect(validWebsiteSnapshot(draft)).toBe(false)
  })
  it('isolates returned draft, published, scheduled and version documents from later mutation', () => {
    const live = nextWebsiteState(state(), snapshot(), true, 'Owner')
    live.draft.pages[0].doc.content[0].props.text = 'Changed draft'
    expect(live.published?.pages[0].doc.content[0].props.text).toBe('Original')
    live.published!.pages[0].doc.content[0].props.text = 'Changed live reference'
    expect(live.versions[0].snapshot.pages[0].doc.content[0].props.text).toBe('Original')
    const scheduled = nextWebsiteState(state(), snapshot(), false, 'Owner', '2026-10-08T12:00:00Z', '2026-10-09T12:00:00Z')
    scheduled.draft.pages[0].doc.content[0].props.text = 'Changed after scheduling'
    expect(scheduled.scheduled?.snapshot.pages[0].doc.content[0].props.text).toBe('Original')
  })
  it('refuses invalid persisted element heights while retaining valid responsive placements', () => {
    const draft = snapshot()
    draft.pages[0].doc.root.props = { websiteLayout: { text: { desktop: { placements: { '1.0': { column: 1, span: 6, row: 1, height: 200 } } } } } }
    expect(validWebsiteSnapshot(draft)).toBe(true)
    draft.pages[0].doc.root.props.websiteLayout.text.desktop.placements['1.0'].height = 2000
    expect(validWebsiteSnapshot(draft)).toBe(false)
  })
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
  it('reads public pages only from the published snapshot, excluding subsequent draft edits', () => {
    const live = nextWebsiteState(state(), snapshot(), true, 'owner')
    live.draft.pages[0].doc.content[0].props.text = 'Private later draft'
    expect(publishedWebsitePage({ websiteEditor: live }, 'home')?.doc.content[0].props.text).toBe('Original')
    expect(publishedWebsitePage({ websiteEditor: live }, 'missing')).toBeNull()
    expect(publishedWebsitePage({ websiteEditor: state() }, 'home')).toBeNull()
  })
  it('resets phone overrides to inherited desktop settings without mutating the saved document', () => {
    const original = snapshot().pages[0].doc
    const settings: SectionDisplay = { padding: 32, textSize: 48 }
    const desktop = updateSectionDisplay(original, 'text', 'desktop', settings)
    const phone = updateSectionDisplay(desktop, 'text', 'phone', { padding: 8, textSize: 48 })
    expect(sectionDisplay(phone, 'text', 'phone')).toEqual({ padding: 8, textSize: 48 })
    const reset = updateSectionDisplay(phone, 'text', 'phone', null)
    expect(sectionDisplay(reset, 'text', 'phone')).toEqual({ padding: 32, textSize: 48 })
    expect(sectionDisplay(phone, 'text', 'phone').padding).toBe(8)
    expect(sectionDisplay(original, 'text', 'desktop')).toEqual({})
  })
  it('inherits desktop display settings while clamping invalid numeric controls', () => {
    const doc = { root: { props: { websiteLayout: { text: { desktop: { padding: 32, gap: 16, animation: 'rise' }, phone: { padding: 8, hidden: true, columns: 90, textSize: Infinity } } } } }, content: [] }
    expect(sectionDisplay(doc, 'text', 'phone')).toEqual({ padding: 8, gap: 16, animation: 'rise', hidden: true, columns: 4 })
  })
})


it('keeps chrome website-only, publishes independent overrides, and rejects unsafe destinations', () => {
  const original = { name: 'Space', tagline: 'Original', cta: { label: 'Book', href: '/sites/space/book', external: false } }
  const draft = snapshot(); draft.chrome = { name: 'Website', tagline: null, cta: { label: 'Contact', href: '/contact' } }
  expect(validWebsiteSnapshot(draft)).toBe(true)
  expect(resolveWebsiteChrome(draft, original)).toEqual(draft.chrome)
  expect(resolveWebsiteChrome(null, original)).toEqual(original)
  expect(resolveWebsiteChromeCta(draft.chrome, original.cta, '/sites/space')).toEqual({ label: 'Contact', href: '/sites/space/contact', external: false })
  expect(resolveWebsiteChromeCta(undefined, original.cta, '/sites/space')).toEqual(original.cta)
  const live = nextWebsiteState(state(), draft, true, 'Owner'); live.draft.chrome!.name = 'Later'
  expect(live.published?.chrome?.name).toBe('Website')
  for (const href of ['javascript:alert(1)', '//evil.example', '/\\evil.example', 'https://user:password@example.org', 'data:text/html,test']) expect(validWebsiteSnapshot({ ...snapshot(), chrome: { cta: { label: 'Click', href } } })).toBe(false)
  for (const chrome of [{ name: '' }, { tagline: 'x'.repeat(501) }, { cta: { label: '', href: '/' } }, { css: 'unsafe' }]) expect(validWebsiteSnapshot({ ...snapshot(), chrome })).toBe(false)
  expect(original.name).toBe('Space')
})


it('cancels a scheduled publication while keeping the current public website and version history', () => {
  const live = nextWebsiteState(state(), snapshot(), true, 'Owner')
  const scheduled = nextWebsiteState(live, snapshot(), false, 'Owner', '2026-10-08T12:00:00Z', '2026-10-09T12:00:00Z')
  const nextDraft = snapshot(); nextDraft.chrome = { name: 'Private next name' }
  const cancelled = nextWebsiteState(scheduled, nextDraft, false, 'Owner', '2026-10-08T13:00:00Z', null)
  expect(cancelled.scheduled).toBeNull()
  expect(cancelled.revision).toBe(scheduled.revision + 1)
  expect(cancelled.published).toEqual(live.published)
  expect(cancelled.versions).toEqual(live.versions)
  expect(cancelled.draft.chrome?.name).toBe('Private next name')
  expect(nextWebsiteState(scheduled, nextDraft, false, 'Owner').scheduled).toEqual(scheduled.scheduled)
})
