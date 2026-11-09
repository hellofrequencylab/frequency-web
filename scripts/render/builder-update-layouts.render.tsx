// FIXTURE RENDER: the builder's Update to new layouts sheet (BLD-205) for a Midnight page with a hero and a call to
// action that convert and a membership block that stays, to $RENDER_OUT/update-layouts.html. The before and after
// frames draw each block through the editor config on the Midnight theme. Run: node scripts/render/build-css.mjs
// $RENDER_OUT/app.css, then RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts
// scripts/render/builder-update-layouts.render.tsx, then node scripts/render/builder-roles-themes-shots.mjs <dir>.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('@/components/builder/legacy/update-layouts-sheet.module.css', () => ({ default: new Proxy({}, { get: (_, k) => `ul-${String(k)}` }) }))

it('renders the Update to new layouts sheet', async () => {
  const out = process.env.RENDER_OUT
  if (!out) throw new Error('set RENDER_OUT')
  const { UpdateLayoutsSheet } = await import('@/components/builder/legacy/update-layouts-sheet')
  const { legacyPlan } = await import('@/lib/builder/legacy')
  const { config } = await import('@/lib/page-editor/config')
  const css = readFileSync('components/builder/legacy/update-layouts-sheet.module.css', 'utf8').replace(/\.([a-z][A-Za-z]*)(?=[\s{,:.\[)])/g, '.ul-$1')
  const doc = { root: { props: {} }, content: [
    { type: 'MidnightHero', props: { id: 'h', eyebrow: 'Thursdays', title: 'Come as you are', lead: 'A small room, a big table, and people glad you came.', primaryLabel: 'Join us', primaryHref: '/join', image: '/brand/frequency/photos/hero.jpg' } },
    { type: 'NetworkKitCTA', props: { id: 'c', title: 'Bring a friend', buttonLabel: 'Save a seat', buttonHref: '/book' } },
    { type: 'MidnightMembership', props: { id: 'p', title: 'Ways in' } },
  ] } as never
  const plan = legacyPlan(doc, config)
  const preview = (b: { type: string; props: Record<string, unknown> }) => {
    const r = config.components[b.type]?.render as (p: unknown) => React.ReactElement
    return createElement('div', { 'data-website-theme': 'Midnight', style: { zoom: 0.5 } }, createElement(() => r({ ...b.props, puck: { metadata: { theme: 'Midnight' } } })))
  }
  const body = renderToStaticMarkup(createElement(UpdateLayoutsSheet, { plan, pageLabel: 'Home', preview, onApply() {}, onClose() {} }))
  writeFileSync(`${out}/update-layouts.html`, `<!doctype html><html data-design="frequency"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${readFileSync(`${out}/app.css`, 'utf8')}${readFileSync('app/themes/frequency/editor-shell.css', 'utf8')}${css}*,*::before,*::after{box-sizing:border-box}body{margin:0;font-family:var(--fq-font-sans);background:var(--editor-canvas)}.ul-scrim{position:static;min-height:100vh}</style></head><body data-builder="v3">${body}</body></html>`)
})
