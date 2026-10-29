// FIXTURE RENDER: every page of a published Designer website snapshot (a JSON file), drawn with the real blocks, the real
// token block and the Space's own accent vars, the way the stand-alone site wears them. Used for before/after passes on a
// live Designer site. Writes $RENDER_OUT/<slug>.html.
// Run: RENDER_FIXTURE=<snapshot.json> RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/designer-site-fixture.render.tsx
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => h('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => h('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))

const out = process.env.RENDER_OUT
const fixture = process.env.RENDER_FIXTURE

it('renders a Designer site snapshot', async () => {
  if (!out || !fixture) throw new Error('set RENDER_OUT and RENDER_FIXTURE')
  const snap = JSON.parse(readFileSync(fixture, 'utf8')) as { brand?: { accent?: string }; pages: { slug: string; doc: unknown }[] }
  const { BlockRender } = await import('@/lib/page-editor/block-render')
  const { config } = await import('@/lib/page-editor/config')
  const { DESIGNER_CSS } = await import('@/components/sites/designer-css')
  const { DESIGNER_BLOCKS_CSS } = await import('@/components/sites/designer-blocks-css')
  const { designerAccentVars } = await import('@/lib/theme/designer')
  const vars = Object.entries(designerAccentVars(snap.brand?.accent)).map(([k, v]) => `${k}:${v}`).join(';')
  for (const page of snap.pages) {
    const body = renderToStaticMarkup(h(BlockRender, { config, data: page.doc } as never))
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${DESIGNER_CSS}${DESIGNER_BLOCKS_CSS}body{margin:0}</style></head><body><div data-house-theme="designer" style="${vars}"><main class="mw-page">${body}</main></div></body></html>`
    writeFileSync(`${out}/${page.slug}.html`, html)
  }
})
