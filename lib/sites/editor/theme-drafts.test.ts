import { describe, expect, it } from 'vitest'
import { nextWebsiteState, validWebsiteSnapshot, type WebsiteEditorState, type WebsiteSnapshot } from './state'
import { activeThemeDraftId, addThemeDraft, draftLook, liveThemeDraftId, removeThemeDraft, renameThemeDraft, switchThemeDraft, themeDrafts } from './theme-drafts'

const page = { slug: 'home', label: 'Home', doc: { root: {}, content: [{ type: 'Heading', props: { id: 'h1', text: 'Same words' } }] }, seo: { title: '', description: '' }, comments: [] }
const base: WebsiteSnapshot = { theme: 'Midnight', brand: { accent: '#B377AF' }, pages: [page] }
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { expect(r.ok).toBe(true); return r as Extract<T, { ok: true }> }

describe('theme drafts', () => {
  it('a website that never used drafts has one implicit draft and carries nothing extra', () => {
    expect(themeDrafts(base)).toEqual([{ id: 'main', label: 'Nocturne', theme: 'Midnight', brand: { accent: '#B377AF' } }])
    expect(base).not.toHaveProperty('themes')
  })

  it('adds a draft over the same pages and shows it, keeping the first one as it was', () => {
    const added = ok(addThemeDraft(base, 'Designer', 'Light try'))
    expect(added.snapshot.theme).toBe('Designer')
    expect(added.snapshot.brand).toBeUndefined()
    expect(added.snapshot.pages).toEqual(base.pages)
    expect(added.snapshot.themes?.map((t) => t.id)).toEqual(['main', 'light-try'])
    expect(validWebsiteSnapshot(added.snapshot)).toBe(true)
    const back = ok(switchThemeDraft(added.snapshot, 'main'))
    expect(back.snapshot.theme).toBe('Midnight')
    expect(back.snapshot.brand).toEqual({ accent: '#B377AF' })
    expect(back.snapshot.pages).toEqual(base.pages)
  })

  it('settles edits to the active draft before switching away, so none are lost', () => {
    const two = ok(addThemeDraft(base, 'Designer')).snapshot
    const edited = { ...two, brand: { accent: '#112233' }, look: { corners: 'square' } }
    const home = ok(switchThemeDraft(edited, 'main')).snapshot
    const again = ok(switchThemeDraft(home, 'designer')).snapshot
    expect(again.brand).toEqual({ accent: '#112233' })
    expect(again.look).toEqual({ corners: 'square' })
  })

  it('makes a variant of a theme that starts from another draft of the same theme', () => {
    const variant = ok(addThemeDraft(base, 'Midnight', 'House of Fates', 'main')).snapshot
    expect(variant.theme).toBe('Midnight')
    expect(variant.brand).toEqual({ accent: '#B377AF' })
    expect(themeDrafts(variant).map((t) => t.label)).toEqual(['Nocturne', 'House of Fates'])
    // A different theme never inherits another theme's accent.
    expect(ok(addThemeDraft(base, 'Temple', 'Warm', 'main')).snapshot.brand).toBeUndefined()
  })

  it('caps the list, refuses to remove the live or last draft, and renames', () => {
    let s = base
    for (let n = 0; n < 5; n++) s = ok(addThemeDraft(s, 'Temple', `T${n}`)).snapshot
    expect(addThemeDraft(s, 'Temple', 'One too many').ok).toBe(false)
    expect(removeThemeDraft(base, 'main', null).ok).toBe(false)
    const two = ok(addThemeDraft(base, 'Designer')).snapshot
    expect(removeThemeDraft(two, 'designer', 'designer').ok).toBe(false)
    const gone = ok(removeThemeDraft(two, 'designer', 'main'))
    expect(gone.snapshot.theme).toBe('Midnight')
    expect(gone.snapshot).not.toHaveProperty('themes')
    expect(renameThemeDraft(two, 'main', '   ').ok).toBe(false)
    expect(themeDrafts(ok(renameThemeDraft(two, 'main', ' House  of Fates ')).snapshot)[0].label).toBe('House of Fates')
  })

  it('publishing marks the live draft and keeps the other drafts off the public snapshot', () => {
    const two = ok(addThemeDraft(base, 'Designer', 'Light try')).snapshot
    const state: WebsiteEditorState = { v: 1, revision: 1, draft: base, published: base, versions: [] }
    const next = nextWebsiteState(state, two, true, 'Owner')
    expect(next.published).not.toHaveProperty('themes')
    expect(next.published).not.toHaveProperty('activeTheme')
    expect(next.published?.liveTheme).toBe('light-try')
    expect(next.draft.themes).toHaveLength(2)
    expect(liveThemeDraftId(next.draft, next.published)).toBe('light-try')
    expect(validWebsiteSnapshot(next.published)).toBe(true)
  })

  it('finds the live draft of a website published before drafts existed by its theme and accent', () => {
    const two = ok(addThemeDraft(base, 'Designer')).snapshot
    expect(liveThemeDraftId(two, base)).toBe('main')
    expect(activeThemeDraftId(two)).toBe('designer')
  })

  it('rejects malformed draft data', () => {
    const two = ok(addThemeDraft(base, 'Designer')).snapshot
    expect(validWebsiteSnapshot({ ...two, activeTheme: 'missing' })).toBe(false)
    expect(validWebsiteSnapshot({ ...two, themes: [two.themes![0]] })).toBe(false)
    expect(validWebsiteSnapshot({ ...two, themes: two.themes!.map((t) => ({ ...t, theme: 'Nope' })) })).toBe(false)
    expect(validWebsiteSnapshot({ ...base, look: { corners: 'round' } })).toBe(false)
  })

  it('turns a draft look into the full set of global styles, null where the theme decides', () => {
    expect(draftLook(undefined)).toBeUndefined()
    expect(draftLook({ corners: 'square' })).toEqual({ corners: 'square', spacing: null, header: null, footer: null })
  })
})
