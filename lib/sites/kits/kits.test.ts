import { describe, expect, it } from 'vitest'
import { validWebsiteSnapshot, WEBSITE_THEMES_LIVE, type WebsiteSnapshot } from '@/lib/sites/editor/state'
import { applyKit, kitChanges } from './apply'
import { KIT_INDEX, loadKit } from './registry'

const page = (slug: string) => ({ slug, label: slug, doc: { root: {}, content: [{ type: 'Text', props: { id: 'a', text: 'Mine' } }] }, seo: { title: '', description: '' }, comments: [] })
const site = (slugs: string[], theme: WebsiteSnapshot['theme'] = 'Menswork'): WebsiteSnapshot => ({ theme, pages: slugs.map(page) })

describe('site kits', () => {
  it('every indexed kit loads, matches its summary, and uses a live theme', async () => {
    for (const s of KIT_INDEX) {
      const kit = await loadKit(s.id)
      expect(kit, s.id).not.toBeNull()
      expect([kit!.niche, kit!.theme, kit!.label]).toEqual([s.niche, s.theme, s.label])
      // Default wears DAWN, which the public site does not serve a stored document for (its house look is the Default look).
      if (kit!.theme !== 'DAWN') expect(WEBSITE_THEMES_LIVE.has(kit!.theme), `${s.id} must wear a theme the public site serves`).toBe(true)
    }
  })
  it('rejects an unknown or inherited kit id', async () => {
    expect(await loadKit('nope')).toBeNull()
    expect(await loadKit('constructor')).toBeNull()
  })
  it('replace makes a valid site of the kit pages, all flagged as sample', async () => {
    const kit = (await loadKit('wildheart-coaches'))!
    const r = applyKit(site(['home', 'old']), kit, 'replace')
    expect(r.ok && validWebsiteSnapshot(r.snapshot)).toBe(true)
    if (r.ok) {
      expect(r.snapshot.theme).toBe('Wildheart')
      expect(r.snapshot.pages.map((p) => p.slug)).toEqual(['home', 'about', 'sessions'])
      expect(r.snapshot.pages.every((p) => p.doc.content.every((b) => b.props.sample === true))).toBe(true)
    }
  })
  it('add keeps every existing page and renames clashes', async () => {
    const kit = (await loadKit('wildheart-coaches'))!
    const r = applyKit(site(['home', 'about']), kit, 'add')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.snapshot.pages.slice(0, 2).map((p) => p.doc.content[0].props.text)).toEqual(['Mine', 'Mine'])
      expect(r.renamed).toEqual({ home: 'home-kit', about: 'about-kit' })
      expect(r.snapshot.pages.map((p) => p.slug)).toEqual(['home', 'about', 'home-kit', 'about-kit', 'sessions'])
    }
  })
  it('names the pages each mode would leave, and why a mode cannot run', async () => {
    const kit = (await loadKit('wildheart-coaches'))!
    const changes = kitChanges(site(['home', 'old']), kit)
    expect(changes.now).toEqual(['home', 'old'])
    expect(changes.add).toHaveLength(5)
    expect(changes.replace).toHaveLength(3)
    expect(changes.theme).toBe('Wildheart')
    const full = kitChanges(site(Array.from({ length: 29 }, (_, i) => `p${i}`)), kit)
    expect(typeof full.add).toBe('string')
  })
  it('add refuses past 30 pages and changes nothing', async () => {
    const kit = (await loadKit('wildheart-coaches'))!
    const many = site(['home', ...Array.from({ length: 28 }, (_, i) => `p${i}`)])
    const r = applyKit(many, kit, 'add')
    expect(r.ok).toBe(false)
    expect(many.pages).toHaveLength(29)
  })
  it('theme mode swaps the theme and leaves content alone', async () => {
    const kit = (await loadKit('wildheart-coaches'))!
    const before = site(['home'])
    const r = applyKit(before, kit, 'theme')
    expect(r.ok && r.snapshot.theme === 'Wildheart' && r.snapshot.pages[0].doc.content[0].props.text === 'Mine').toBe(true)
    expect(before.theme).toBe('Menswork')
  })
})

describe('kit block defaults', () => {
  it('fills registered defaults under the kit’s own props, and the kit wins', async () => {
    const kit = (await loadKit('wildheart-coaches'))!
    const r = applyKit(site(['home']), kit, 'replace', (type) => ({ fromDefaults: type, title: 'default title' }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      const hero = r.snapshot.pages[0].doc.content.find((b) => b.type === 'PhotoHero')!
      expect(hero.props.fromDefaults).toBe('PhotoHero')
      expect(hero.props.title).toBe('You do not have to carry it alone.')
    }
  })
})

describe('niche variants', () => {
  it.each(['Midnight', 'DAWN', 'Menswork'] as const)('there is one %s kit for each niche door', async (theme) => {
    const kits = KIT_INDEX.filter((k) => k.theme === theme)
    expect(kits.map((k) => k.niche).sort()).toEqual(['coaches', 'hosts', 'networks', 'nonprofits', 'studios', 'venues'])
  })
  it('every kit block is a registered block, and the applied site is valid with registry defaults', async () => {
    const { config } = await import('@/lib/page-editor/config')
    for (const s of KIT_INDEX) {
      const kit = (await loadKit(s.id))!
      for (const p of kit.pages) for (const b of p.blocks) expect(config.components[b.type], `${s.id}/${p.slug}: ${b.type}`).toBeTruthy()
      const r = applyKit(site(['home']), kit, 'replace', (type) => config.components[type]?.defaultProps)
      expect(r.ok && validWebsiteSnapshot(r.snapshot), s.id).toBe(true)
    }
  })
  it('kit copy holds no prices, photos or real names', async () => {
    for (const s of KIT_INDEX.filter((k) => k.theme !== 'Wildheart')) {
      const json = JSON.stringify(await loadKit(s.id))
      expect(json, s.id).not.toMatch(/\$\d|\.jpg|\.png|Nocturne|—/)
    }
  })
  it('every link points at a page of the same kit or a platform page', async () => {
    for (const s of KIT_INDEX.filter((k) => k.theme !== 'Wildheart')) {
      const kit = (await loadKit(s.id))!
      const own = new Set([...kit.pages.map((p) => p.slug), 'book', 'contact'])
      const links = [...JSON.stringify(kit).matchAll(/~\/([a-z-]+)/g)].map((m) => m[1])
      expect(links.filter((l) => !own.has(l)), s.id).toEqual([])
    }
  })
})
