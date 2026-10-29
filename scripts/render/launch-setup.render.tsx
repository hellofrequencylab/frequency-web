// FIXTURE RENDER: Finish setup (LIVE-1914 to 1917), written to $RENDER_OUT/setup-<screen>.html. Screens: sheet (the pill and the
// Finish setup sheet), hide1 and hide2 (the two hide steps), intent (the first question inside the lightbox). The real LaunchPill,
// LaunchSheet and LaunchIntent on the app's compiled CSS. The hide step is local state, so React's useState is wrapped to start the
// hide panel on the step the screen names; nothing else about it is faked.
// Run: RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/launch-setup.render.tsx
import { createElement as h, type ReactNode } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

const hide = vi.hoisted(() => ({ step: 0 }))
vi.mock('react', async (orig) => {
  const a = (await orig()) as typeof import('react')
  return { ...a, useState: ((init: unknown) => (init === 0 && hide.step > 0 ? [hide.step, () => {}] : a.useState(init as never))) as unknown as typeof a.useState }
})
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => h('a', { href: p.href as string, className: p.className as string, style: p.style as never }, p.children as never) }))
vi.mock('@/lib/theme/design', () => ({ SITE_DESIGN: 'frequency' }))
vi.mock('@/lib/launch/actions', () => ({ setMinimizedAction: async () => ({}), requestCancelAction: async () => ({}), confirmCancelAction: async () => ({}), askHideSetupAction: async () => ({}), confirmHideSetupAction: async () => ({}) }))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: (p: { children: ReactNode; className?: string }) =>
    h(
      'div',
      { className: 'fixed inset-0 flex justify-center bg-ink/60 z-[70] overflow-hidden items-stretch pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pl-[max(2.5vmin,env(safe-area-inset-left))] sm:pr-[max(2.5vmin,env(safe-area-inset-right))] sm:pt-[max(2.5vmin,env(safe-area-inset-top))] sm:pb-[max(2.5vmin,env(safe-area-inset-bottom))]' },
      h('div', { role: 'dialog', 'aria-modal': 'true', className: `w-full outline-none min-h-0 ${p.className ?? ''}` }, p.children),
    ),
}))

const out = process.env.RENDER_OUT
const FONTS = `@font-face{font-family:Unbounded;src:url(file:///home/user/frequency-web/app/fonts/unbounded/unbounded.woff2);font-weight:200 900}@font-face{font-family:'Hanken Grotesk';src:url(file:///home/user/frequency-web/public/fonts/stage/HankenGrotesk-Medium.ttf);font-weight:400 600}@font-face{font-family:'Hanken Grotesk';src:url(file:///home/user/frequency-web/public/fonts/stage/HankenGrotesk-Bold.ttf);font-weight:700}@font-face{font-family:'Instrument Serif';src:url(file:///home/user/frequency-web/public/fonts/stage/InstrumentSerif-Italic.ttf);font-style:italic}:root{--font-unbounded:Unbounded;--font-hanken:'Hanken Grotesk';--font-instrument-serif:'Instrument Serif'}body{overflow:hidden}`

async function page(inner: unknown, behind = ''): Promise<string> {
  const { prelude } = await prerenderToNodeStream(inner as never)
  const chunks: Buffer[] = []
  for await (const c of prelude) chunks.push(Buffer.from(c))
  return `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"><style>${FONTS}</style></head><body><div data-kit="members" class="fq-members">${behind}${Buffer.concat(chunks).toString()}</div></body></html>`
}

const view = {
  total: 9, done: 4, pct: 44, minimized: false, stopAsked: false, current: null, stages: [],
  setup: {
    done: 4, total: 17, left: 13, pct: 24,
    sections: [
      { id: 'space', title: 'Space', done: 3, total: 5 },
      { id: 'money', title: 'Money', done: 0, total: 4 },
      { id: 'reach', title: 'Reach', done: 1, total: 4 },
    ],
    todo: [
      { id: 'sc-cover', label: 'Cover image', href: '/launch/step/space', photo: true, skipped: false },
      { id: 'm-booking', label: 'Set the weekly times people can book', href: '/spaces/a/settings/offerings#booking', photo: false, skipped: false },
      { id: 'm-product', label: 'List your first product or service', href: '/spaces/a/settings/shop', photo: false, skipped: false },
      { id: 'r-campaign', label: 'Draft your first email campaign', href: '/spaces/a/settings/email', photo: false, skipped: false },
    ],
  },
}

const BAR = '<header style="height:64px;display:flex;align-items:center;gap:12px;padding:0 20px;border-bottom:1px solid var(--fq-border-hair)"><b style="font:500 18px var(--fq-font-display);letter-spacing:-.04em;text-transform:uppercase">Frequency</b><span style="flex:1"></span>'
const HOME = '<main style="padding:24px"><h1 class="h1">Welcome home</h1><div class="card" style="padding:18px 20px;margin-top:14px"><b>Your Space is live.</b></div></main>'

it('renders Finish setup', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { LaunchPill, LaunchSheet } = await import('@/components/frequency/members/shell/launch-box')
  const { LaunchLightbox } = await import('@/components/launch/launch-lightbox')
  const { LaunchIntent } = await import('@/components/launch/launch-intent')
  const { Suspense } = await import('react')
  const sheetScreen = async (step: number) => {
    hide.step = step
    const el = h('div', { style: { ['--fq-hdr' as string]: '64px' } as never }, h('div', { className: 'ap-hdr-r', style: { position: 'fixed', top: 12, right: 20, zIndex: 50 } }, h(LaunchPill, { view: view as never, open: true, onToggle() {} })), h('div', { className: 'ap-sheets' }, h('div', { className: 'ap-sheet on fqm-launch', role: 'dialog' }, h(LaunchSheet, { view: view as never, onClose() {} }))))
    const html = await page(el, `${BAR}</header>${HOME}`)
    hide.step = 0
    return html
  }
  writeFileSync(`${out}/setup-sheet.html`, await sheetScreen(0))
  writeFileSync(`${out}/setup-hide1.html`, await sheetScreen(1))
  writeFileSync(`${out}/setup-hide2.html`, await sheetScreen(2))
  const intent = h(Suspense, { fallback: null }, h(LaunchLightbox, null, h('div', { style: { maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 } }, h('h1', { className: 'h1' }, 'Welcome back'), h(LaunchIntent, { spaceHref: '/launch/step/spotlight?go=1' }))))
  writeFileSync(`${out}/setup-intent.html`, await page(intent, `${BAR}</header>${HOME}`))
})
