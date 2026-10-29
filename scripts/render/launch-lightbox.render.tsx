// FIXTURE RENDER: the launch lightbox (LIVE-1913) around the real launch pieces, written to $RENDER_OUT/lightbox-<screen>.html.
// Screens: resume (the launch page's own "Welcome back" card inside the lightbox). The shared Dialog portals to <body>, which a server render
// never reaches, so it is mocked with the SAME overlay container and panel classes components/ui/dialog.tsx draws at
// align="overlay"; everything inside is the real LaunchLightbox and the real launch components.
// Run: RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/launch-lightbox.render.tsx
import { createElement as h, type ReactNode } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/launch', useSearchParams: () => new URLSearchParams() }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => h('a', { href: p.href as string, className: p.className as string, style: p.style as never }, p.children as never) }))
vi.mock('@/lib/theme/design', () => ({ SITE_DESIGN: 'frequency' }))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: (p: { children: ReactNode; className?: string }) =>
    h(
      'div',
      { className: 'fixed inset-0 flex justify-center bg-ink/60 z-[70] overflow-hidden items-stretch pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pl-[max(2.5vmin,env(safe-area-inset-left))] sm:pr-[max(2.5vmin,env(safe-area-inset-right))] sm:pt-[max(2.5vmin,env(safe-area-inset-top))] sm:pb-[max(2.5vmin,env(safe-area-inset-bottom))]' },
      h('div', { role: 'dialog', 'aria-modal': 'true', className: `w-full outline-none min-h-0 ${p.className ?? ''}` }, p.children),
    ),
}))

const out = process.env.RENDER_OUT

async function page(inner: unknown, behind: string): Promise<string> {
  const { prelude } = await prerenderToNodeStream(inner as never)
  const chunks: Buffer[] = []
  for await (const c of prelude) chunks.push(Buffer.from(c))
  return `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"><style>@font-face{font-family:Unbounded;src:url(file:///home/user/frequency-web/app/fonts/unbounded/unbounded.woff2);font-weight:200 900}@font-face{font-family:'Hanken Grotesk';src:url(file:///home/user/frequency-web/public/fonts/stage/HankenGrotesk-Medium.ttf);font-weight:400 600}@font-face{font-family:'Hanken Grotesk';src:url(file:///home/user/frequency-web/public/fonts/stage/HankenGrotesk-Bold.ttf);font-weight:700}@font-face{font-family:'Instrument Serif';src:url(file:///home/user/frequency-web/public/fonts/stage/InstrumentSerif-Italic.ttf);font-style:italic}:root{--font-unbounded:Unbounded;--font-hanken:'Hanken Grotesk';--font-instrument-serif:'Instrument Serif'}body{overflow:hidden}</style></head><body><div data-kit="members" class="fq-members">${behind}${Buffer.concat(chunks).toString()}</div></body></html>`
}

// The page the person came from, dimmed behind the overlay (the Venues door).
const BEHIND = '<main style="padding:24px"><p class="eyebrow">Venues and rooms</p><h1 class="h1" style="margin:10px 0 14px">Your room, your rules.</h1><div class="card" style="padding:20px"><p>Fill your calendar with people who love your space.</p><a class="btn pa">Open your Space</a></div></main>'

it('renders the launch lightbox', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { LaunchLightbox } = await import('@/components/launch/launch-lightbox')
  const { Button } = await import('@/components/ui/button')
  const { Suspense } = await import('react')
  const resume = h(
    Suspense,
    { fallback: null },
    h(
      LaunchLightbox,
      null,
      h(
        'div',
        { style: { maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 } },
        h('h1', { className: 'h1' }, 'Welcome back'),
        h('p', { className: 't2' }, 'You stopped at Spotlight. Saved a moment ago.'),
        h('div', null, h(Button as never, null, 'Pick up where I left off')),
      ),
    ),
  )
  writeFileSync(`${out}/lightbox-resume.html`, await page(resume, BEHIND))
})
