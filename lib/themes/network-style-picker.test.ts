import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { NEW_WORLD_FUNCTIONS } from '@/lib/sites/new-world-functions'
import { matchLook } from '@/lib/theme/dials'
import { NETWORK_KIT_SCHEME_ORDER, NETWORK_KIT_SCHEMES, networkKitScheme } from '@/lib/theme/network-kit'
import { nextWebsiteState, publishedWebsiteSnapshot, resolveWebsiteBrand, type WebsiteSnapshot } from '@/lib/sites/editor/state'
import { themeAccents, themeEditor } from './editor-dials'
import schema from './editor-schema2.json'

const snapshot: WebsiteSnapshot = { theme: 'NetworkKit', pages: [] }

describe('Network style picker', () => {
  it('maps each shared function only to existing Network Kit block registrations', () => {
    const { functions } = schema['network-kit']
    const blocks = ['', '-inner', '-more'].map((suffix) => readFileSync(new URL(`../../components/page-editor/blocks/network-kit${suffix}.tsx`, import.meta.url), 'utf8')).join('\n')
    expect(Object.keys(functions).sort()).toEqual(NEW_WORLD_FUNCTIONS.map(({ id }) => id).sort())
    for (const block of Object.values(functions).flat()) {
      expect(blocks).toMatch(new RegExp(`^  ${block}: block\\(`, 'm'))
    }
  })

  it('offers the four existing schemes as both swatches and usable Looks', () => {
    const { dials, looks } = themeEditor('network-kit')
    expect(dials.map((dial) => dial.id).sort()).toEqual(['accent', 'corners', 'footer', 'header', 'spacing'])
    expect(themeAccents('NetworkKit').map(({ id }) => id)).toEqual(NETWORK_KIT_SCHEME_ORDER)
    expect(looks.map(({ id }) => id)).toEqual(['own', ...NETWORK_KIT_SCHEME_ORDER])
    for (const id of NETWORK_KIT_SCHEME_ORDER) {
      const look = looks.find((item) => item.id === id)!
      expect(look.dials).toEqual({ accent: id })
      expect(matchLook(looks, look.dials, { accent: '' })).toBe(id)
      const accent = resolveWebsiteBrand({ ...snapshot, look: look.dials }, {}).accent
      expect(accent).toBe(NETWORK_KIT_SCHEMES[id].accent)
      expect(networkKitScheme(accent)).toBe(id)
    }
  })

  it('keeps a named selection on the published snapshot without changing a legacy website', () => {
    const legacy = { accent: '#123456' }
    const draft = {
      ...snapshot,
      look: { accent: 'ocean' },
      pages: [{ slug: 'home', label: 'Home', doc: { root: {}, content: [] }, seo: { title: '', description: '' }, comments: [] }],
    }
    const state = nextWebsiteState({ v: 1, revision: 0, draft, published: null, versions: [] }, draft, true, 'Owner')
    const published = publishedWebsiteSnapshot({ siteStyle: { theme: 'network-kit' }, websiteEditor: state })
    expect(published?.look?.accent).toBe('ocean')
    expect(resolveWebsiteBrand(published, legacy).accent).toBe(NETWORK_KIT_SCHEMES.ocean.accent)
    expect(resolveWebsiteBrand(snapshot, legacy).accent).toBe(legacy.accent)
    expect(resolveWebsiteBrand({ ...snapshot, look: { accent: 'unknown' } }, legacy).accent).toBe(legacy.accent)
    expect(resolveWebsiteBrand({ ...snapshot, theme: 'Network', look: { accent: 'ocean' } }, legacy).accent).toBe(legacy.accent)
  })
})
