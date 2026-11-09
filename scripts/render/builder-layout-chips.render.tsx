// FIXTURE RENDER: the builder's Layout chips (BLD-203) for a Hero with no photo (Full-bleed is blocked) following the
// theme, and the same Hero with a layout kept, to $RENDER_OUT/layout-chips.html. Run: node scripts/render/build-css.mjs
// $RENDER_OUT/app.css, then RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts
// scripts/render/builder-layout-chips.render.tsx, then node scripts/render/builder-roles-themes-shots.mjs <dir>.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('@/components/builder/canvas/variants/layout-chips.module.css', () => ({ default: new Proxy({}, { get: (_, k) => `lc-${String(k)}` }) }))

it('renders the Layout chips', async () => {
  const out = process.env.RENDER_OUT
  if (!out) throw new Error('set RENDER_OUT')
  const { LayoutChips } = await import('@/components/builder/canvas/variants/layout-chips')
  const { ROLES } = await import('@/lib/blocks/roles/roles')
  const css = readFileSync('components/builder/canvas/variants/layout-chips.module.css', 'utf8').replace(/\.([a-z][A-Za-z]*)(?=[\s{,:.\[)])/g, '.lc-$1')
  const base = { ...ROLES.hero.sample, image: '' }
  const panel = (props: Record<string, unknown>, title: string) => `<aside style="width:360px;padding:16px;background:var(--fq-surface-raised);border-radius:12px"><h2 style="margin:0 0 12px;font-size:16px">${title}</h2>${renderToStaticMarkup(createElement(LayoutChips, { type: ROLES.hero.type, props, theme: 'NewWorld', onChange() {}, onFill() {} }))}</aside>`
  const body = `<div data-builder="v3" style="display:flex;flex-wrap:wrap;gap:24px;padding:24px;background:var(--editor-canvas);min-height:100vh">${panel({ ...base, variant: '' }, 'Following the theme, no photo yet')}${panel({ ...base, image: '/p.jpg', variant: 'center', variantSet: true }, 'Layout kept')}</div>`
  writeFileSync(`${out}/layout-chips.html`, `<!doctype html><html data-design="frequency"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${readFileSync(`${out}/app.css`, 'utf8')}${readFileSync('app/themes/frequency/editor-shell.css', 'utf8')}${css}*,*::before,*::after{box-sizing:border-box}body{margin:0}</style></head><body>${body}</body></html>`)
})
