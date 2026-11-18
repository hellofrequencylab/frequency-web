import { describe, expect, it } from 'vitest'
import { preferencesPatch } from './preferences-patch'

// LIVE-2347: the Page panel and page editor send only the top-level preference keys a mutator changed.
describe('preferencesPatch (LIVE-2347)', () => {
  it('sends only the keys that changed, and nothing for an unchanged blob', () => {
    const before = { spotlight: { published: true }, coverFocus: '50% 50%', pages: [{ slug: 'home' }] }
    expect(preferencesPatch(before, { ...before })).toEqual({})
    expect(preferencesPatch(before, { ...before, coverFocus: '20% 80%' })).toEqual({ coverFocus: '20% 80%' })
  })

  it('patches every key a multi-key change touches, and nulls a removed key', () => {
    const before = { pages: [{ slug: 'home' }, { slug: 'about' }], pageDocs: { about: { content: [] } }, theme: 'classic' }
    const after = { pages: [{ slug: 'home' }], pageDocs: {}, theme: 'classic', added: 1 }
    expect(preferencesPatch(before, after)).toEqual({ pages: [{ slug: 'home' }], pageDocs: {}, added: 1 })
    const rest: Record<string, unknown> = { ...before }
    delete rest.theme
    expect(preferencesPatch(before, rest)).toEqual({ theme: null })
    expect(preferencesPatch(before, { ...before, theme: undefined })).toEqual({ theme: null })
  })

  it('treats a structurally equal clone as unchanged (key order ignored)', () => {
    const before = { hero: { height: 'tall', buttonOrientation: 'row' } }
    expect(preferencesPatch(before, { hero: { buttonOrientation: 'row', height: 'tall' } })).toEqual({})
  })

  it('never sends websiteEditor or programOverview (save_website_editor and space_private_state own them)', () => {
    const before = { websiteEditor: { revision: 1 }, programOverview: { a: 1 }, x: 1 }
    expect(preferencesPatch(before, { x: 2 })).toEqual({ x: 2 })
  })
})
