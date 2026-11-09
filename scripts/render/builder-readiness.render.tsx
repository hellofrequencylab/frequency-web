// FIXTURE RENDER: the builder's readiness (BLD-204): the Publish ring in its four gates, the Publish sheet for sample
// words (an explicit keep) and for a missing number (no way through), and the canvas tags, to $RENDER_OUT/readiness.html.
// Run: node scripts/render/build-css.mjs $RENDER_OUT/app.css, then RENDER_OUT=<dir> pnpm exec vitest run -c
// scripts/render/vitest.render.config.ts scripts/render/builder-readiness.render.tsx, then
// node scripts/render/builder-roles-themes-shots.mjs <dir>.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('@/components/builder/readiness/readiness.module.css', () => ({ default: new Proxy({}, { get: (_, k) => `rd-${String(k)}` }) }))

it('renders readiness', async () => {
  const out = process.env.RENDER_OUT
  if (!out) throw new Error('set RENDER_OUT')
  const { PublishRing } = await import('@/components/builder/readiness/publish-ring')
  const { PublishSheet } = await import('@/components/builder/readiness/publish-sheet')
  const { readiness, TAG_SAY } = await import('@/lib/builder/readiness')
  const css = readFileSync('components/builder/readiness/readiness.module.css', 'utf8').replace(/\.([a-z][A-Za-z]*)(?=[\s{,:.\[)])/g, '.rd-$1')
  const config = { components: { RoleHero: { label: 'Say who you are', fields: { image: { type: 'text' }, alt: { type: 'text' } } }, RoleStats: { label: 'Show your numbers', fields: {} }, RoleProof: { label: 'Show what members say', fields: {} } } } as never
  const page = (content: unknown[], description = 'Come as you are') => ({ slug: 'home', label: 'Home', doc: { root: {}, content } as never, seo: { title: '', description } })
  const hero = { type: 'RoleHero', props: { id: 'h', image: '/p.jpg', alt: '' } }
  const sample = { type: 'RoleProof', props: { id: 'q', sample: true } }
  const nullFig = { type: 'RoleStats', props: { id: 'n', items: [{ value: '', label: 'Members' }, { value: '', label: 'Nights a year' }] } }
  const states = [
    ['Ready', readiness([page([])], config)],
    ['Warnings only', readiness([page([hero], '')], config)],
    ['Sample words', readiness([page([sample, hero])], config)],
    ['A figure with no number', readiness([page([sample, nullFig, hero])], config)],
  ] as const
  const bar = states.map(([title, r]) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-radius:12px;background:var(--fq-surface-raised)"><span style="font-size:13px;color:var(--fq-text-muted)">${title}</span>${renderToStaticMarkup(createElement(PublishRing, { readiness: r, dirty: true, saving: false, onStep() {}, onPublish() {} }))}</div>`).join('')
  const sheet = (r: (typeof states)[number][1]) => renderToStaticMarkup(createElement(PublishSheet, { readiness: r, onFix() {}, onPublish() {}, onClose() {} }))
  const tag = (say: string, title: string) => `<section style="position:relative;padding:48px 24px 32px;border-radius:12px;background:var(--fq-bg-sunken)"><h3 style="margin:0;font-size:22px">${title}</h3><p style="margin:6px 0 0;color:var(--fq-text-muted)">A section on the canvas</p><button type="button" style="position:absolute;right:12px;top:8px;min-height:28px;padding:0 10px;border:1px solid var(--fq-border-hair);border-radius:999px;background:var(--fq-surface-raised);color:var(--fq-text-strong);font:600 12px var(--fq-font-sans)">${say}</button></section>`
  const body = `<div data-builder="v3" style="display:grid;gap:24px;padding:24px;background:var(--editor-canvas);min-height:100vh;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));align-items:start">
    <div style="display:grid;gap:10px"><h2 style="margin:0;font-size:16px">Publish ring</h2>${bar}<h2 style="margin:12px 0 0;font-size:16px">Canvas tags</h2>${tag(TAG_SAY.sample, 'Show what members say')}${tag(TAG_SAY.number, 'Show your numbers')}</div>
    <div class="static">${sheet(states[2][1])}</div>
    <div class="static">${sheet(states[3][1])}</div>
  </div>`
  writeFileSync(`${out}/readiness.html`, `<!doctype html><html data-design="frequency"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${readFileSync(`${out}/app.css`, 'utf8')}${readFileSync('app/themes/frequency/editor-shell.css', 'utf8')}${css}*,*::before,*::after{box-sizing:border-box}body{margin:0;font-family:var(--fq-font-sans)}.static .rd-scrim{position:static;padding:0;background:none}</style></head><body>${body}</body></html>`)
})
