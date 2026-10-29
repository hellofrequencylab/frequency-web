// Render matrix for `pnpm audit:themes` (LIVE-1850). Not a *.test.tsx on purpose: the normal suite must not render
// every block on every theme. scripts/theme-audit.mjs runs it through scripts/theme-audit/vitest.config.ts.
//
// For each of the nine skins it renders every block in the page-editor config with the real-content fixture,
// writes one HTML file per palette category (the shots read these), scores coverage, and checks the hole
// baseline. THEME_AUDIT_UPDATE=1 rewrites the baseline, and only when that makes it smaller.
import fs from 'node:fs'
import { it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { config } from '@/lib/page-editor/config'
import { WebsiteDocument } from '@/components/sites/website-document'
import { websiteThemeVars, WEBSITE_TOKEN_CSS } from '@/lib/sites/editor/theme'
import { HOUSE_CSS } from '@/components/sites/house-css'
import { FREQUENCY_PAGE_CSS } from '@/components/sites/frequency-page-css'
import { MENSWORK_CSS } from '@/components/sites/menswork-css'
import { MENSWORK_PAGE_CSS } from '@/components/sites/menswork-page-css'
import { WILDHEART_CSS } from '@/components/sites/wildheart-css'
import { NETWORK_CSS, NETWORK_BLOCK_CSS } from '@/components/sites/network-css'
import { NETWORK_KIT_CSS } from '@/components/sites/network-kit-css'
import { TEMPLE_CSS } from '@/components/sites/temple-css'
import { TEMPLE_KIT_CSS } from '@/components/sites/temple-kit-css'
import { MIDNIGHT_CSS } from '@/components/sites/midnight-css'
import { DESIGNER_CSS } from '@/components/sites/designer-css'
import { realContentProps } from '@/lib/theme-audit/fixture'
import { HOLE_BELOW, classesOf, compareToBaseline, coverageOf, holeId, selectorClasses } from '@/lib/theme-audit/coverage'

const THEMES = [
  { id: 'frequency', ed: 'DAWN', skin: null, css: FREQUENCY_PAGE_CSS },
  { id: 'bold', ed: 'Menswork', skin: 'menswork', css: MENSWORK_CSS + MENSWORK_PAGE_CSS },
  { id: 'wildheart', ed: 'Wildheart', skin: 'wildheart', css: FREQUENCY_PAGE_CSS + WILDHEART_CSS },
  { id: 'network', ed: 'Network', skin: 'network', css: FREQUENCY_PAGE_CSS + NETWORK_CSS },
  { id: 'network-kit', ed: 'NetworkKit', skin: 'network-kit', css: FREQUENCY_PAGE_CSS + NETWORK_KIT_CSS },
  { id: 'temple', ed: 'Temple', skin: 'temple', css: FREQUENCY_PAGE_CSS + TEMPLE_CSS },
  { id: 'temple-kit', ed: 'TempleKit', skin: 'temple-kit', css: FREQUENCY_PAGE_CSS + TEMPLE_KIT_CSS },
  { id: 'midnight', ed: 'Midnight', skin: 'midnight', css: FREQUENCY_PAGE_CSS + MIDNIGHT_CSS },
  { id: 'designer', ed: 'Designer', skin: 'designer', css: FREQUENCY_PAGE_CSS + DESIGNER_CSS },
] as const

const live = { events: [], circles: [], journeys: [] }
const links = { origin: 'https://frequency.example', slug: 'demo', siteBase: '', pages: ['home'], contactHref: null, bookHref: null, email: null }
const review = (id: string, rating: number, body: string, name: string) => ({ id, rating, body, createdAt: '2026-06-01T10:00:00Z', author: { displayName: name, avatarUrl: null }, response: null })
const reviews = [review('r1', 5, 'I came alone and left with three friends.', 'Maya'), review('r2', 4, 'Unhurried, warm, and the tea is good.', 'Jo')]
const meta = {
  space: {
    name: 'Demo Space',
    faqs: [{ id: 'q', question: 'Can I come alone?', answer: 'Yes. Most people do.' }],
    reviews: { average: 4.5, count: 2, latest: reviews, all: reviews, distribution: { 5: 1, 4: 1, 3: 0, 2: 0, 1: 0 } },
  },
}

const OUT = process.env.THEME_AUDIT_OUT ?? '.theme-audit'
const BASELINE = 'docs/design-systems/theme-cohesion/baseline.json'

function read(p: string): string {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return ''
  }
}

it('renders every block on every theme and holds the hole baseline', () => {
  const cats = config.categories as Record<string, { components: string[] }>
  const catOf: Record<string, string> = {}
  for (const [k, c] of Object.entries(cats)) for (const t of c.components) catOf[t] = k
  const global = read(`${OUT}/global.css`)
  const base = ['core.css', '../frequency.css', 'kit-site.css', 'site-blocks.css'].map((f) => read(`app/themes/frequency/${f}`)).join('\n')

  const sheets = THEMES.map((t) => ({ ...t, full: `${HOUSE_CSS}\n${t.skin ? WEBSITE_TOKEN_CSS : ''}\n${t.css}\n${t.id !== 'network' ? NETWORK_BLOCK_CSS : ''}` }))
  const own = new Map(sheets.map((t) => [t.id, selectorClasses(t.full)]))
  const themed = new Set([...own.values()].flatMap((s) => [...s]))

  const blocks: Record<string, { cat: string; coverage: Record<string, number | null>; errors: Record<string, string> }> = {}
  for (const t of sheets) {
    const sections: Record<string, string[]> = {}
    for (const [type, comp] of Object.entries(config.components)) {
      const doc = { root: {}, content: [{ type, props: realContentProps(comp as never, `b-${type}`) }] }
      let html = ''
      let err = ''
      try {
        html = renderToStaticMarkup(<WebsiteDocument doc={doc as never} theme={t.ed as never} config={config as never} live={live as never} links={links as never} origin={links.origin} title="Home" metadata={meta as never} />)
      } catch (e) {
        err = String((e as Error)?.message ?? e).slice(0, 160)
      }
      const cat = catOf[type] ?? 'none'
      ;(sections[cat] ??= []).push(`<div class="audit-row" data-block="${type}"><div class="audit-tag">${type}${err ? ` - ERROR ${err}` : ''}</div>${html}</div>`)
      const row = (blocks[type] ??= { cat, coverage: {}, errors: {} })
      row.coverage[t.id] = html ? coverageOf(classesOf(html), themed, own.get(t.id)!) : null
      if (err) row.errors[t.id] = err
    }
    const vars = Object.entries(websiteThemeVars(t.ed as never, null, new Date('2026-07-01'))).map(([k, v]) => `${k}:${v}`).join(';')
    const wrap = `${t.skin ? `data-website-theme="${t.ed}" data-house-theme="${t.skin}" data-house-site data-season="summer" data-scheme="marigold"` : ''} style="${t.skin ? vars.replace(/"/g, "'") : ''}"`
    const css = `${global}\n${base}\n${t.full}\n.audit-tag{font:600 12px/1 monospace;background:#222;color:#fff;padding:6px 10px;position:sticky;top:0;z-index:5}.audit-row{border-bottom:3px solid #f0f;min-height:40px}`
    fs.mkdirSync(`${OUT}/${t.id}`, { recursive: true })
    for (const [cat, rows] of Object.entries(sections)) {
      fs.writeFileSync(`${OUT}/${t.id}/${cat}.html`, `<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>${css}</style></head><body style="margin:0"><div ${wrap} class="audit-root">${rows.join('\n')}</div></body></html>`)
    }
  }

  const holes = Object.entries(blocks)
    .flatMap(([b, r]) => THEMES.filter((t) => r.coverage[t.id] != null && r.coverage[t.id]! < HOLE_BELOW).map((t) => holeId(b, t.id)))
    .sort()
  const errors = Object.entries(blocks).flatMap(([b, r]) => Object.keys(r.errors).map((t) => holeId(b, t)))
  const stored = JSON.parse(read(BASELINE) || '{"holes":[]}') as { holes: string[] }
  const diff = compareToBaseline(stored.holes, holes)
  fs.writeFileSync(`${OUT}/coverage.json`, JSON.stringify({ themes: THEMES.map((t) => t.id), holeBelow: HOLE_BELOW, blocks, holes, errors, ...diff }, null, 1))

  if (process.env.THEME_AUDIT_UPDATE === '1') {
    // The baseline only shrinks. The one exception is the first write, when there is no file to shrink.
    expect(stored.holes.length === 0 ? [] : diff.added, 'update-baseline refuses to add holes').toEqual([])
    fs.mkdirSync('docs/design-systems/theme-cohesion', { recursive: true })
    fs.writeFileSync(BASELINE, JSON.stringify({ ledger: 'LIVE-1850', holeBelow: HOLE_BELOW, holes }, null, 1) + '\n')
    return
  }
  expect(diff.added, `new theme holes (run pnpm audit:themes to see the sheets): ${diff.added.slice(0, 8).join(', ')}`).toEqual([])
  expect(errors, 'blocks that throw on a theme').toEqual([])
}, 300_000)
