// FIXTURE RENDER: the six Services Spotlight layouts (components/spotlight/services-kit-layouts.tsx) for chosen kits, Night and Day, as
// bare HTML pages for a design check. Run:
// RENDER_OUT=<dir> RENDER_KITS=general,trades pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/services-spotlight-layouts.render.tsx
// then open each <kit>__<layout>__<register>.html at 390 wide (scripts/render/services-kit-pages-shots.mjs reads the same folder).
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => h('img', { src: p.src as string, alt: p.alt as string, className: p.className as string, style: (p.fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' } : undefined) as never }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => h('a', { href: p.href as string, className: p.className as string }, p.children as never) }))

const ROOT = process.cwd()
const face = (fam: string, f: string, style = 'normal', w = '100 900') => `@font-face{font-family:"${fam}";src:url("file://${ROOT}/app/fonts/${f}") format("woff2");font-style:${style};font-weight:${w}}`
const FACES = face('Bricolage Grotesque', 'bricolage-grotesque/bricolage-grotesque.woff2', 'normal', '200 800') + face('Lora', 'lora/lora.woff2', 'normal', '400 700') + face('Lora', 'lora/lora-italic.woff2', 'italic', '400 700') + face('DM Mono', 'dm-mono/dm-mono-400.woff2', 'normal', '400') + face('DM Mono', 'dm-mono/dm-mono-500.woff2', 'normal', '500')
const VARS = '--font-sv-bricolage:"Bricolage Grotesque";--font-sv-lora:"Lora";--font-sv-mono:"DM Mono"'

it('renders the Services Spotlight layouts', async () => {
  const out = process.env.RENDER_OUT
  if (!out) throw new Error('set RENDER_OUT')
  const { ServicesKitSpotlightLayout } = await import('@/components/spotlight/services-kit-layouts')
  const { servicesKitSpotlightContent, SERVICES_SPOTLIGHT_KIT_IDS } = await import('@/lib/spotlight/services-kit-content')
  const kits = process.env.RENDER_KITS ? process.env.RENDER_KITS.split(',') : SERVICES_SPOTLIGHT_KIT_IDS
  for (const kit of kits) {
    const c = servicesKitSpotlightContent(kit, { photo: process.env.RENDER_PHOTO ? `file://${ROOT}/public${process.env.RENDER_PHOTO}` : undefined })
    for (const layout of c.layouts) {
      for (const register of ['night', 'day'] as const) {
        const body = renderToStaticMarkup(h(ServicesKitSpotlightLayout as never, { layout: `services-kit:${layout}`, content: c, register }))
        writeFileSync(`${out}/${kit}__${layout}__${register}.html`, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${FACES}body{margin:0}</style></head><body><div style='${VARS}'>${body}</div></body></html>`)
      }
    }
  }
})
