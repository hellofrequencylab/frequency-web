import { describe, expect, it } from 'vitest'
import type { Config, Data } from '@/lib/page-editor/types'
import { cleanSectionAnchor, patchSectionBase, sectionDisplay, sectionVisibility, setSectionVisibility, type WebsiteSnapshot } from './state'
import { editorBlockMeta, editorPickerGroups, VERA_SUGGESTIONS } from './block-meta'
import { pendingChangeLabels, publishChecks } from './publish-checks'

// The Frequency page editor handoff's data model (HANDOFF-PAGE-EDITOR.md §6) mapped onto the website document:
// tone, width and anchor are optional base fields; visibility is per device; the change log seeds from what
// the draft holds that is not live.

const doc = (): Data => ({ root: {}, content: [{ type: 'Hero', props: { id: 'hero', title: 'Royal Temple' } }, { type: 'SpaceFAQ', props: { id: 'faq' } }] })

describe('per-device visibility (hide applies to the current device only)', () => {
  it('hides on tablet alone and leaves desktop and phone showing', () => {
    const next = setSectionVisibility(doc(), 'hero', 'tablet', false)
    expect(sectionVisibility(next, 'hero')).toEqual({ desktop: true, tablet: false, phone: true })
  })
  it('hides on desktop without hiding the devices that inherit desktop', () => {
    const next = setSectionVisibility(doc(), 'hero', 'desktop', false)
    expect(sectionVisibility(next, 'hero')).toEqual({ desktop: false, tablet: true, phone: true })
    expect(sectionDisplay(next, 'hero', 'tablet').hidden).toBe(false)
    const shown = setSectionVisibility(next, 'hero', 'desktop', true)
    expect(sectionVisibility(shown, 'hero')).toEqual({ desktop: true, tablet: true, phone: true })
  })
  it('keeps a device that was already hidden hidden when desktop changes', () => {
    const phoneHidden = setSectionVisibility(doc(), 'hero', 'phone', false)
    const next = setSectionVisibility(phoneHidden, 'hero', 'desktop', false)
    expect(sectionVisibility(next, 'hero')).toEqual({ desktop: false, tablet: true, phone: false })
  })
})

describe('tone, width and anchor are optional base fields', () => {
  it('writes them on the desktop entry, clears them with undefined, and cleans what is read back', () => {
    const toned = patchSectionBase(doc(), 'hero', { tone: 'ink', width: 'narrow', anchor: 'visit' })
    expect(sectionDisplay(toned, 'hero', 'phone')).toMatchObject({ tone: 'ink', width: 'narrow', anchor: 'visit' })
    const cleared = patchSectionBase(toned, 'hero', { tone: undefined, width: undefined })
    expect(sectionDisplay(cleared, 'hero', 'desktop')).toEqual({ anchor: 'visit' })
    const hostile = { root: { props: { websiteLayout: { hero: { desktop: { tone: 'neon', width: 'huge', anchor: '  My Section!! ' } } } } }, content: [] } as unknown as Data
    expect(sectionDisplay(hostile, 'hero', 'desktop')).toEqual({ anchor: 'my-section' })
  })
  it('turns any text into a link-safe anchor, or nothing', () => {
    expect(cleanSectionAnchor('Visit us')).toBe('visit-us')
    expect(cleanSectionAnchor('---')).toBeUndefined()
    expect(cleanSectionAnchor(7)).toBeUndefined()
  })
})

describe('block presentation comes from the registry, not a second registry', () => {
  const config: Config = { components: { Hero: { render: () => null, label: 'Hero' }, SpaceFAQ: { render: () => null, label: 'FAQ' }, Gallery: { render: () => null, label: 'Gallery' }, Text: { render: () => null, label: 'Text' }, Spacer: { render: () => null, label: 'Spacer' } }, categories: { sections: { title: 'Sections', components: ['Hero'] }, spaceContent: { title: 'Space content', components: ['SpaceFAQ'] }, media: { title: 'Media', components: ['Gallery'] }, content: { title: 'Content', components: ['Text'] }, layout: { title: 'Layout', components: ['Spacer'] } } }
  it('derives icon, group, live and suggestion kind per type', () => {
    expect(editorBlockMeta(config, 'Hero')).toEqual({ icon: 'photo', group: 'Sections', live: false, kind: 'Hero' })
    expect(editorBlockMeta(config, 'SpaceFAQ')).toEqual({ icon: 'help', group: 'Live', live: true, kind: 'FAQ' })
    expect(editorBlockMeta(config, 'Gallery').group).toBe('Media')
    expect(editorBlockMeta(config, 'Spacer')).toMatchObject({ group: 'Content', icon: 'layers' })
  })
  it('regroups the picker under the design four headings, keeping disabled items and their reasons', () => {
    const groups = editorPickerGroups(config, [
      { items: [{ type: 'Spacer', label: 'Spacer' }, { type: 'Text', label: 'Text' }] },
      { items: [{ type: 'Hero', label: 'Hero', disabled: true, reason: 'One per page' }] },
      { items: [{ type: 'Gallery', label: 'Gallery' }, { type: 'SpaceFAQ', label: 'FAQ' }] },
    ])
    expect(groups.map((g) => [g.title, g.items.map((i) => i.type)])).toEqual([['Sections', ['Hero']], ['Content', ['Spacer', 'Text']], ['Live', ['SpaceFAQ']], ['Media', ['Gallery']]])
    expect(groups[0].items[0]).toMatchObject({ disabled: true, reason: 'One per page' })
  })
  it('offers only rewrite suggestions, each naming the fields it prefers', () => {
    for (const set of Object.values(VERA_SUGGESTIONS)) for (const chip of set) expect(chip.fields.length).toBeGreaterThan(0)
  })
})

describe('the change log and the publish modal checks', () => {
  const page = (slug: string, label: string, title = 'Hi'): WebsiteSnapshot['pages'][number] => ({ slug, label, seo: { title: '', description: 'Set' }, comments: [], doc: { root: {}, content: [{ type: 'Hero', props: { id: `${slug}-hero`, title } }] } })
  const published: WebsiteSnapshot = { theme: 'DAWN', pages: [page('home', 'Home'), page('visit', 'Visit')] }
  it('labels what the draft holds that is not live, and nothing for an unchanged draft', () => {
    expect(pendingChangeLabels(structuredClone(published), published)).toEqual([])
    const draft: WebsiteSnapshot = { theme: 'Menswork', pages: [page('home', 'Home', 'Changed'), page('join', 'Join')] }
    expect(pendingChangeLabels(draft, published)).toEqual(['Updated Home', 'Updated Join', 'Removed page Visit', 'Navigation', 'Theme'])
  })
  it('ignores comments, which never publish', () => {
    const draft = structuredClone(published)
    draft.pages[0].comments = [{ id: 'c', blockId: 'home-hero', x: 0.5, y: 0.5, text: 'note', author: 'A', createdAt: '2026-01-01T00:00:00Z', resolved: false }]
    expect(pendingChangeLabels(draft, published)).toEqual([])
  })
  it('warns that other pages with unpublished changes go live too', () => {
    const checks = publishChecks(published.pages, { components: {} }, { otherChanged: ['Memberships'] })
    expect(checks.at(-1)).toEqual({ ok: false, text: 'Memberships page has unpublished changes that go live too' })
    expect(publishChecks(published.pages, { components: {} })).toHaveLength(2)
  })
})
