// FIXTURE RENDER: the builder's Add sheet (BLD-202) on a page that has a hero, with the New World theme's preview of the
// focused card, to $RENDER_OUT/add-sheet-<state>.html. Run: node scripts/render/build-css.mjs $RENDER_OUT/app.css, then
// RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/builder-add-sheet.render.tsx
// then node scripts/render/builder-roles-themes-shots.mjs <dir>. The live canvas draws the preview in its frame; here the
// same block markup is drawn inline with the theme's sheet, which is what the frame holds.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('@/components/builder/add/add-sheet.module.css', () => ({ default: new Proxy({}, { get: (_, k) => `as-${String(k)}` }) }))

it('renders the Add sheet', async () => {
  const out = process.env.RENDER_OUT
  if (!out) throw new Error('set RENDER_OUT')
  const { AddSheet } = await import('@/components/builder/add/add-sheet')
  const { config } = await import('@/lib/page-editor/config')
  const { addCards } = await import('@/lib/builder/add')
  const { ROLES } = await import('@/lib/blocks/roles/roles')
  const { roleBlocksCss } = await import('@/components/sites/role-blocks-css')
  const { NEW_WORLD_CSS } = await import('@/components/sites/new-world-css')
  const { rolePreviewMetadata } = await import('@/components/page-editor/blocks/roles')
  const { makeItem } = await import('@/components/page-editor/mobile/data-ops')
  const appCss = readFileSync(`${out}/app.css`, 'utf8')
  // CSS modules hash their names in the app; prefix them here so a global class of the same name cannot leak in.
  const sheetCss = readFileSync('components/builder/add/add-sheet.module.css', 'utf8').replace(/\.([a-z][A-Za-z]*)(?=[\s{,:.\[)])/g, '.as-$1')
  const doc = { root: { props: {} }, content: [makeItem(config, ROLES.hero.type)] }
  const cards = addCards(config, doc as never, { surface: 'site', theme: 'NewWorld' })
  const space = { spaceId: 's1', stats: [{ label: 'Members', value: 312 }, { label: 'Gatherings this year', value: 48 }, { label: 'Cities', value: 3 }] }
  const states: Record<string, { query?: string }> = { suggested: {}, empty: { query: 'zzz' } }
  for (const [name] of Object.entries(states)) {
    const preview = (card: (typeof cards)[number]) => {
      const item = makeItem(config, card.type)
      const render = config.components[card.type].render as (p: unknown) => React.ReactElement
      const meta = rolePreviewMetadata(card.role, { theme: 'NewWorld', space })
      return createElement('div', { 'data-house-theme': 'new-world', style: { background: 'var(--c-canvas)', color: 'var(--c-text)', width: 390 }, dangerouslySetInnerHTML: { __html: renderToStaticMarkup(render({ ...item.props, puck: { metadata: meta } })) } })
    }
    let html = renderToStaticMarkup(createElement('div', { 'data-builder': 'v3', 'data-design': 'frequency' }, createElement(AddSheet, { cards, doc: doc as never, at: 1, onPick() {}, onAsk() {}, onClose() {}, preview })))
    if (name === 'empty') html = html.replace(/<section aria-label="[^"]+">[\s\S]*?<\/section>/g, '').replace(/<figure[\s\S]*<\/figure>/, '<div class="as-empty"><p>Nothing matches “zzz”. Vera can help you work out what this part should do.</p><button type="button" class="as-close">Ask Vera</button></div>')
    // The sprite is fetched by URL in the app; a file page cannot, so it is inlined and referenced by fragment.
    html = html.replace(/\/brand\/frequency\/frequency-(editor-)?icons\.svg#/g, '#') + readFileSync('public/brand/frequency/frequency-icons.svg', 'utf8').replace('<svg', '<svg style="display:none"')
    writeFileSync(`${out}/add-sheet-${name}.html`, `<!doctype html><html data-design="frequency"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${appCss}${readFileSync('app/themes/frequency/editor-shell.css', 'utf8')}${sheetCss}${NEW_WORLD_CSS}${roleBlocksCss('NewWorld')}*,*::before,*::after{box-sizing:border-box}body{margin:0;min-height:900px}</style></head><body>${html}</body></html>`)
  }
})
