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

// The eight role blocks (LIVE-1858). The contract each *.role.json declares is proved here against the real markup and
// the real sheet: every variant renders, every part is declared and styled, the sheet reads only declared core tokens,
// and the same markup wears all nine themes' mappings with nothing unresolved (coverage 1.00).
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
  it('ships eight roles with three layouts each, registered as page-editor blocks', () => {
    expect(ROLE_IDS).toHaveLength(8)
    for (const id of ROLE_IDS) {
      const def = ROLES[id]
      expect(Object.keys(def.variants), id).toHaveLength(3)
      expect(def.variants[def.default], `${id} default is one of its variants`).toBeTruthy()
      expect(config.components[def.type], `${def.type} is in the editor config`).toBeTruthy()
      expect(def.sample.sample, `${id} sample is flagged`).toBe(true)
      expect(def.replaces.length, `${id} names the legacy blocks it stands in for`).toBeGreaterThan(0)
    }
    expect(ROLE_CATEGORY_COMPONENTS).toHaveLength(8)
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

describe('the nine themes', () => {
  it('map every token the role sheet reads, with a real value', () => {
    const read = new Set(ROLE_IDS.flatMap((id) => varsRead(cssFor(id))))
    expect(CONTRACT_THEME_IDS).toHaveLength(9)
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
