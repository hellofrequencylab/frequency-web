import fs from 'node:fs'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { config } from '@/lib/page-editor/config'
import { rolesComponents, ROLE_CATEGORY_COMPONENTS } from '@/components/page-editor/blocks/roles'
import { ROLES, ROLE_IDS, type RoleId } from '@/lib/blocks/roles/roles'
import { ROLE_CSS_CHUNKS, docHasRoleBlocks, roleBlocksCss } from '@/components/sites/role-blocks-css'
import { CONTRACT_THEME_IDS, CORE_TOKEN_NAMES, coreTokenMap } from '@/lib/theme/block-contract-tokens'
import { SURFACE_CATEGORIES } from '@/lib/page-editor/palette-scope'
import { WebsiteDocument } from '@/components/sites/website-document'

// The seventeen role blocks (LIVE-1858, LIVE-1859). The contract each *.role.json declares is proved here against the real markup and
// the real sheet: every variant renders, every part is declared and styled, the sheet reads only declared core tokens,
// and the same markup wears all ten themes' mappings with nothing unresolved (coverage 1.00).
// `UPDATE_ROLE_MANIFEST=1 pnpm vitest run components/page-editor/blocks/roles.test.tsx` rewrites `tokens` and `parts`
// in each role file from what the markup and the sheet really use; it never touches the hand-written fields.

const THEME_EDITOR_IDS = ['DAWN', 'Menswork', 'Wildheart', 'Network', 'NetworkKit', 'Temple', 'TempleKit', 'Midnight', 'Designer'] as const

/** A fixture that exercises every optional slot, so every part shows up. */
function fixture(id: RoleId, variant: string, extra: Record<string, unknown> = {}) {
  const base = { ...ROLES[id].sample } as Record<string, unknown>
  delete base.sample
  const items = (base.items ?? []) as Record<string, unknown>[]
  const withPhoto: Record<string, unknown> =
    {
      hero: { image: '/images/hero.jpg', alt: 'People around a table' },
      offerings: { actionLabel: 'See all', actionHref: '~/book', items: items.map((i) => ({ ...i, image: '/images/hero.jpg' })) },
      gatherings: { image: '/images/hero.jpg', alt: 'A supper table', actionLabel: 'Full calendar', actionHref: '~/events' },
      proof: { items: items.map((i) => ({ ...i, photo: '/images/hero.jpg' })) },
      shop: { actionLabel: 'See all', actionHref: '~/shop', items: items.map((i) => ({ ...i, image: '/images/hero.jpg', badge: 'New', href: '~/shop' })) },
      library: { actionLabel: 'See all', actionHref: '~/library', items: items.map((i) => ({ ...i, image: '/images/hero.jpg', href: '~/library' })) },
      people: { items: items.map((i) => ({ ...i, photo: '/images/hero.jpg', href: '~/about' })) },
      gallery: { actionLabel: 'See all', actionHref: '~/gallery', items: items.map((i) => ({ ...i, image: '/images/hero.jpg', alt: 'A room' })) },
      chapters: { actionLabel: 'See all', actionHref: '~/circles', items: items.map((i) => ({ ...i, image: '/images/hero.jpg', href: '~/circles' })) },
      statement: { primaryLabel: 'Join', primaryHref: '~/join', secondaryLabel: 'Learn more', secondaryHref: '~/about' },
      letter: { eyebrow: 'The letter', note: 'No spam.' },
      contact: { secondaryLabel: 'Book a call', secondaryHref: '~/book', note: 'We reply in two days.' },
    }[id as string] ?? {}
  return { ...base, ...withPhoto, ...extra, variant }
}

const render = (id: RoleId, props: Record<string, unknown>, metadata?: Record<string, unknown>) =>
  renderToStaticMarkup((rolesComponents[ROLES[id].type].render as (p: unknown) => React.ReactElement)({ ...props, puck: { metadata } }))

const attrs = (html: string, name: string) => [...new Set([...html.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map((m) => m[1]))]
const cssFor = (id: RoleId) => ROLE_CSS_CHUNKS.base + ROLE_CSS_CHUNKS[id]
/** Contract names the sheet reads. `--rb-*` are the sheet's own local knobs (declared and read inside it), not tokens. */
const varsRead = (css: string) => [...new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))].filter((v) => !v.startsWith('--rb-')).sort()

describe('role registry', () => {
  it('ships seventeen roles with three layouts each, registered as page-editor blocks', () => {
    expect(ROLE_IDS).toHaveLength(17)
    for (const id of ROLE_IDS) {
      const def = ROLES[id]
      expect(Object.keys(def.variants), id).toHaveLength(3)
      expect(def.variants[def.default], `${id} default is one of its variants`).toBeTruthy()
      expect(config.components[def.type], `${def.type} is in the editor config`).toBeTruthy()
      expect(def.sample.sample, `${id} sample is flagged`).toBe(true)
      expect(def.replaces.length, `${id} names the legacy blocks it stands in for`).toBeGreaterThan(0)
    }
    expect(ROLE_CATEGORY_COMPONENTS).toHaveLength(17)
    expect(config.categories?.roles?.components).toEqual(ROLE_CATEGORY_COMPONENTS)
  })

  it('is offered on website pages only, and takes no legacy block type', () => {
    expect(SURFACE_CATEGORIES.website).toContain('roles')
    expect(SURFACE_CATEGORIES.marketing).not.toContain('roles')
    expect(SURFACE_CATEGORIES.space).not.toContain('roles')
    for (const id of ROLE_IDS) for (const legacy of ROLES[id].replaces) expect(ROLES[id].type).not.toBe(legacy)
  })
})

describe.each(ROLE_IDS)('role %s', (id) => {
  const def = ROLES[id]
  const css = cssFor(id)

  it('renders every layout with role, variant and part hooks, and no class', () => {
    for (const variant of Object.keys(def.variants)) {
      const html = render(id, fixture(id, variant))
      expect(html, `${id}/${variant} root`).toContain(`data-role="${id}"`)
      expect(html).toContain(`data-variant="${variant}"`)
      expect(html, 'no theme or utility classes').not.toMatch(/\sclass=/)
      expect(html, 'no inline style').not.toMatch(/\sstyle=/)
      expect(html).toContain('data-part="inner"')
    }
  })

  it('draws the role default for an empty or unknown layout (the theme default)', () => {
    for (const picked of ['', 'nope', undefined]) expect(render(id, fixture(id, picked as string))).toContain(`data-variant="${def.default}"`)
  })

  it('exposes exactly the parts it declares, each one styled (coverage 1.00)', () => {
    const seen = new Set<string>()
    for (const variant of Object.keys(def.variants)) for (const p of attrs(render(id, fixture(id, variant, id === 'proof' ? {} : {})), 'data-part')) seen.add(p)
    if (id === 'membership') for (const p of attrs(render(id, fixture(id, 'spotlight')), 'data-part')) seen.add(p)
    expect([...seen].sort(), `${id} parts (run with UPDATE_ROLE_MANIFEST=1 after a markup change)`).toEqual([...def.parts].sort())
    for (const part of seen) expect(css, `${id} has no rule for part ${part}`).toContain(`data-part="${part}"`)
    for (const variant of Object.keys(def.variants)) expect(css, `${id}/${variant} has no rule`).toContain(`data-variant="${variant}"`)
  })

  it('reads only the core tokens it declares, and the sheet holds no raw colour, font or private token', () => {
    const read = varsRead(css)
    const names = new Set<string>(CORE_TOKEN_NAMES)
    for (const v of read) expect(names.has(v), `${id} reads ${v}, which is not a core token`).toBe(true)
    expect(read.map((v) => v.slice(2)), `${id} tokens (run with UPDATE_ROLE_MANIFEST=1 after a style change)`).toEqual([...def.tokens].sort())
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/)
    expect(css).not.toMatch(/--(?:color|mn|nk|dz|th|sk|fq|wh|tk)-/)
    expect(css).not.toMatch(/font-family:\s*(?!var\()/)
  })
})

describe('the ten themes', () => {
  it('map every token the role sheet reads, with a real value', () => {
    const read = new Set(ROLE_IDS.flatMap((id) => varsRead(cssFor(id))))
    expect(CONTRACT_THEME_IDS).toHaveLength(10)
    for (const theme of CONTRACT_THEME_IDS) {
      const map = coreTokenMap(theme)
      for (const v of read) expect(map[v as keyof typeof map]?.trim(), `${theme} has no value for ${v}`).toBeTruthy()
    }
  })

  it('emit the active theme mapping beside the structure, on a page that has a role block', () => {
    for (const t of THEME_EDITOR_IDS) {
      const css = roleBlocksCss(t)
      expect(css).toContain('--c-accent:')
      expect(css).toContain('[data-role]')
    }
    expect(roleBlocksCss('Menswork')).toContain('[data-house-theme="menswork"]')
    expect(roleBlocksCss('Designer')).toContain('[data-house-theme="designer"]')
  })
})

describe('opt in', () => {
  const links = { origin: 'https://frequency.example', slug: 'demo', siteBase: '', pages: ['home'], contactHref: null, bookHref: null, email: null }
  const live = { events: [], circles: [], journeys: [] }
  const doc = (type: string) => ({ root: {}, content: [{ type, props: { ...(type === 'RoleProof' ? fixture('proof', 'wall') : { title: 'Plain', body: 'Plain' }) } }] })
  const page = (d: unknown) => renderToStaticMarkup(<WebsiteDocument doc={d as never} theme="Midnight" config={config as never} live={live as never} links={links as never} origin={links.origin} title="Home" metadata={{ space: { name: 'Demo' } } as never} />)

  it('adds the role sheet only to a page that carries a role block', () => {
    expect(docHasRoleBlocks(doc('RoleProof'))).toBe(true)
    expect(docHasRoleBlocks(doc('Heading'))).toBe(false)
    expect(page(doc('RoleProof'))).toContain('[data-house-theme="midnight"]')
    expect(page(doc('Heading'))).not.toContain('data-role')
    expect(page(doc('Heading'))).not.toContain('--c-canvas')
  })

  it('renders through the site document with its hooks', () => {
    const html = page(doc('RoleProof'))
    expect(html).toContain('data-role="proof"')
    expect(html).toContain('data-part="quote"')
  })
})

describe('live rows', () => {
  const metadata = {
    links: { origin: 'https://frequency.example', slug: 'demo', siteBase: '', pages: ['home'], contactHref: null, bookHref: null, email: null },
    space: {
      events: [
        { id: 'e2', slug: 'later', title: 'Later one', startsAt: '2099-02-03T19:00:00', location: 'Hall' },
        { id: 'e1', slug: 'soon', title: 'Sooner one', startsAt: '2099-01-02T18:30:00', location: 'Porch' },
        { id: 'e0', slug: 'gone', title: 'Cancelled one', startsAt: '2099-01-01T18:30:00', isCancelled: true },
        { id: 'old', slug: 'old', title: 'Past one', startsAt: '2001-01-01T18:30:00' },
      ],
      faqs: [{ id: 'q', question: 'Is parking free?', answer: 'Yes, on the side street.' }],
    },
  }

  it('Gatherings draws the Space events soonest first, and the written dates when asked not to or when there are none', () => {
    const live = render('gatherings', fixture('gatherings', 'rows'), metadata)
    expect(live.indexOf('Sooner one')).toBeGreaterThan(-1)
    expect(live.indexOf('Sooner one')).toBeLessThan(live.indexOf('Later one'))
    expect(live).not.toContain('Cancelled one')
    expect(live).not.toContain('Past one')
    expect(live).not.toContain('Thursday supper table')
    expect(live).toContain('href="https://frequency.example/events/soon"')
    expect(render('gatherings', fixture('gatherings', 'rows', { live: false }), metadata)).toContain('Thursday supper table')
    expect(render('gatherings', fixture('gatherings', 'rows'))).toContain('Thursday supper table')
  })

  it('shows the empty line when there is nothing to list', () => {
    expect(render('gatherings', fixture('gatherings', 'rows', { items: [] }))).toContain('data-part="empty"')
  })

  it('FAQ draws the Space questions, else the written ones', () => {
    expect(render('faq', fixture('faq', 'split'), metadata)).toContain('Is parking free?')
    expect(render('faq', fixture('faq', 'split', { live: false }), metadata)).toContain('Can I come alone?')
    expect(render('faq', fixture('faq', 'split'))).toContain('Can I come alone?')
  })
})

describe('the nine roles that complete the set (LIVE-1859)', () => {
  const metadata = { links: { origin: 'https://frequency.example', slug: 'demo', siteBase: '', pages: ['home'], contactHref: '/spaces/demo/contact', bookHref: null, email: null } }

  it('Statement draws its phrases in the line layout only', () => {
    expect(render('statement', fixture('statement', 'ticker'))).toContain('Show up')
    expect(render('statement', fixture('statement', 'band'))).not.toContain('Show up')
    expect(render('statement', fixture('statement', 'pull'))).not.toContain('data-part="list"')
  })

  it('Contact sends an email address through the site contact page, and carries no form of its own', () => {
    const html = render('contact', fixture('contact', 'split'), metadata)
    expect(html).toContain('href="/spaces/demo/contact"')
    expect(html).not.toContain('mailto:')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('<input')
  })

  it('People shows one person in the founder layout and all of them otherwise', () => {
    const three = (variant: string) => render('people', fixture('people', variant))
    expect(three('founder')).toContain('First name')
    expect(three('founder')).not.toContain('Second name')
    expect(three('grid')).toContain('Third name')
  })

  it('Stats drops a figure with no label, and Library, Shop and Chapters drop an item with no name', () => {
    expect(render('stats', fixture('stats', 'row', { items: [{ value: '12', label: '' }, { value: '34', label: 'Members' }] }))).not.toContain('>12<')
    expect(render('shop', fixture('shop', 'grid', { items: [{ name: '', price: '$1' }] }))).not.toContain('data-part="item"')
    expect(render('library', fixture('library', 'grid', { items: [{ title: '' }] }))).not.toContain('data-part="item"')
    expect(render('chapters', fixture('chapters', 'grid', { items: [{ name: '' }] }))).not.toContain('data-part="item"')
  })

  it('Gallery keeps a captioned frame when the photo is missing, so a fresh block is not empty', () => {
    const html = render('gallery', fixture('gallery', 'grid', { items: [{ image: '', caption: 'Soon' }] }))
    expect(html).toContain('data-part="caption"')
    expect(html).not.toContain('<img')
  })
})

describe('content that is not the owner\'s to trust', () => {
  it('drops an unsafe link and an unsafe photo', () => {
    const html = render('offerings', fixture('offerings', 'cards', { items: [{ title: 'Bad', body: 'x', href: 'javascript:alert(1)', image: 'javascript:alert(1)' }] }))
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<img')
  })
})

if (process.env.UPDATE_ROLE_MANIFEST === '1') {
  it('rewrites tokens and parts in the role files', () => {
    for (const id of ROLE_IDS) {
      const file = `lib/blocks/roles/${id}.role.json`
      const def = JSON.parse(fs.readFileSync(file, 'utf8'))
      const parts = new Set<string>()
      for (const variant of Object.keys(def.variants)) for (const p of attrs(render(id, fixture(id, variant)), 'data-part')) parts.add(p)
      if (id === 'membership') for (const p of attrs(render(id, fixture(id, 'spotlight')), 'data-part')) parts.add(p)
      def.parts = [...parts].sort()
      def.tokens = varsRead(cssFor(id)).map((v) => v.slice(2))
      fs.writeFileSync(file, JSON.stringify(def, null, 2) + '\n')
    }
  })
}
