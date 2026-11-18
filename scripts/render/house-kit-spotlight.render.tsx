// FIXTURE RENDER: the six shared house kit Spotlight layouts (components/spotlight/house-kit-layouts.tsx) for Bold, Wildheart and
// Nocturne, as the preview (coaching copy) and as a live page (sample off), for a design check. Run:
// RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/house-kit-spotlight.render.tsx
// then open each <theme>__<layout>__<sample|live>.html (scripts/render/shot.mjs or any Playwright pass reads the folder).
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => h('img', { src: p.src as string, alt: p.alt as string, style: (p.fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' } : undefined) as never }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => h('a', { href: p.href as string, className: p.className as string }, p.children as never) }))

const ROOT = process.cwd()
const face = (fam: string, f: string, style = 'normal', w = '100 900') => `@font-face{font-family:"${fam}";src:url("file://${ROOT}/${f}");font-style:${style};font-weight:${w}}`
const FACES = face('Sofia XC', 'app/fonts/sofia-sans-extra-condensed/sofia-sans-extra-condensed.woff2', 'normal', '1 1000') + face('Barlow', 'app/fonts/barlow/barlow-400.woff2', 'normal', '400') + face('Plex Mono', 'app/fonts/ibm-plex-mono/ibm-plex-mono-400.woff2', 'normal', '400')
  + face('IM Fell English', 'public/fonts/wildheart/IMFellEnglish-Regular.ttf', 'normal', '400') + face('IM Fell English', 'public/fonts/wildheart/IMFellEnglish-Italic.ttf', 'italic', '400') + face('EB Garamond', 'app/fonts/eb-garamond/eb-garamond.woff2', 'normal', '400 800') + face('Hanken Grotesk', 'app/fonts/hanken-grotesk/hanken-grotesk.woff2')
const VARS = '--font-sofia-xc:"Sofia XC";--font-barlow:"Barlow";--font-plex-mono:"Plex Mono";--font-wh-fell:"IM Fell English";--font-wh-garamond:"EB Garamond";--font-wh-hanken:"Hanken Grotesk"'

it('renders the house kit Spotlight layouts', async () => {
  const out = process.env.RENDER_OUT
  if (!out) throw new Error('set RENDER_OUT')
  const { HouseKitSpotlightLayout } = await import('@/components/spotlight/house-kit-layouts')
  const { houseKitSpotlightContent, HOUSE_KIT_LAYOUT_KEYS, HOUSE_KIT_PREFIX } = await import('@/lib/spotlight/house-kit-content')
  const pub = (s: string | null) => (s?.startsWith('/') ? `file://${ROOT}/public${s}` : s)
  for (const theme of ['bold', 'wildheart', 'midnight'] as const) {
    for (const mode of ['sample', 'live'] as const) {
      const raw = houseKitSpotlightContent(theme, mode === 'live' ? { name: 'Salt House', sample: false } : {})
      const c = { ...raw, portrait: pub(raw.portrait), hero: { ...raw.hero, photo: pub(raw.hero.photo) } }
      for (const k of HOUSE_KIT_LAYOUT_KEYS) {
        const body = renderToStaticMarkup(h(HouseKitSpotlightLayout as never, { layout: `${HOUSE_KIT_PREFIX[theme]}:${k}`, content: c }))
        writeFileSync(`${out}/${theme}__${k}__${mode}.html`, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${FACES}body{margin:0}</style></head><body><div style='${VARS}'><main style="position:relative;margin:0 auto;max-width:36rem">${body}</main></div></body></html>`)
      }
    }
  }
})
