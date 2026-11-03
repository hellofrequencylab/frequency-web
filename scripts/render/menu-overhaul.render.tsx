// FIXTURE RENDER: the public header and footer (LIVE-2090) in the real kit root with the real CSS.
// Writes $RENDER_OUT/menu-header.html, menu-footer-closed.html and menu-footer-open.html.
// Run: RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/menu-overhaul.render.tsx
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('@/app/themes/active/kit-site', () => ({}))
vi.mock('@/app/themes/active/site-shell', () => ({}))
vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => h('img', { src: p.src as string, alt: p.alt as string, className: p.className as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => h('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/pricing', useSearchParams: () => new URLSearchParams() }))

const out = process.env.RENDER_OUT
it('renders the public header and footer', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { SiteRoot } = await import('@/components/frequency/site/shell/site-root')
  const { SiteHeader } = await import('@/components/frequency/site/shell/site-header')
  const { SiteFooter } = await import('@/components/frequency/site/shell/site-footer')
  const css = readFileSync(`${out}/app.css`, 'utf8')
  const wrap = (kids: unknown[]) => renderToStaticMarkup(h(SiteRoot as never, { surface: 'stage' } as never, ...(kids as never[])))
  const doc = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body data-design="frequency">${body.replace(/(src|href)="\/(brand|fonts)\//g, '$1="file:///home/user/frequency-web/public/$2/')}</body></html>`
  const main = h('main', { style: { minHeight: 300 } })
  writeFileSync(`${out}/menu-header.html`, doc(wrap([h('div', { 'data-surface': 'stage', className: 'fq-stage-band' }, h(SiteHeader)), main])))
  const footer = wrap([main, h('div', { 'data-surface': 'stage', className: 'fq-stage-band' }, h(SiteFooter))])
  writeFileSync(`${out}/menu-footer-closed.html`, doc(footer))
  writeFileSync(`${out}/menu-footer-open.html`, doc(footer.replace('<details class="ft2-more">', '<details class="ft2-more" open="">')))
})
