// FIXTURE RENDER: pages of the Designer Theme Kit's profile kits, drawn with the real blocks and the real skin sheet.
// Writes $RENDER_OUT/<profile>__<slug>.html for each profile in RENDER_PROFILES (default general,studios) and each page
// in RENDER_PAGES (default services). Photos load from /public through the static server in scripts/render/shot.mjs.
// Run: RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/designer-kit-pages.render.tsx
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => h('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => h('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))

const out = process.env.RENDER_OUT
const profiles = (process.env.RENDER_PROFILES ?? 'general').split(',')
const slugs = (process.env.RENDER_PAGES ?? 'home').split(',')

it('renders New World kit pages', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { BlockRender } = await import('@/lib/page-editor/block-render')
  const { config } = await import('@/lib/page-editor/config')
  const { applyKit } = await import('@/lib/sites/kits/apply')
  const { loadKit } = await import('@/lib/sites/kits/registry')
  const { NEW_WORLD_CSS } = await import('@/components/sites/new-world-css')
  const { newWorldAccentVars } = await import('@/lib/theme/new-world')
  const accent = newWorldAccentVars(null)
  for (const profile of profiles) {
    const kit = (await loadKit(`new-world-${profile}`))!
    const r = applyKit({ theme: 'NewWorld', pages: [] } as never, kit, 'replace', (type) => config.components[type]?.defaultProps)
    if (!r.ok) throw new Error(r.error)
    for (const slug of slugs) {
      const page = r.snapshot.pages.find((p) => p.slug === slug)
      if (!page) continue
      const body = renderToStaticMarkup(h(BlockRender, { config, data: page.doc } as never))
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${NEW_WORLD_CSS}body{margin:0}</style></head><body><div data-house-theme="new-world" data-th="night" style="${Object.entries(accent).map(([k, v]) => `${k}:${v}`).join(';')}"><main>${body}</main></div></body></html>`
      writeFileSync(`${out}/${profile}__${slug}.html`, html)
    }
  }
})
