// FIXTURE RENDER (LIVE-2097): the real website editor shell under the Frequency design, server-rendered with a
// real page, and Vera's layout proposal (the real VeraLayoutProposal) drawn into the Vera bar's reply card the way
// the editor shows it after an ask. Writes $RENDER_OUT/vera-layout.html; shoot it with
// scripts/render/builder-roles-themes-shots.mjs <dir> (390, 1280, 1440, 1920, 2000 plus overflow report).
// Run: RENDER_OUT=<dir> RENDER_CSS=<compiled.css> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/vera-layout-editor.render.tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('@/lib/theme/design', () => ({ SITE_DESIGN: 'frequency' }))
// The canvas is client-only in the editor; a still frame of the page stands in for it here.
vi.mock('next/dynamic', () => ({ default: () => () => null }))

it('renders the editor with a Vera layout proposal', async () => {
  const out = process.env.RENDER_OUT, cssFile = process.env.RENDER_CSS
  if (!out || !cssFile) throw new Error('set RENDER_OUT and RENDER_CSS')
  const { WebsiteEditorShell } = await import('@/components/sites/editor/shell')
  const { VeraLayoutProposal } = await import('@/components/sites/editor/vera-dock')
  const { config } = await import('@/lib/page-editor/config')
  const { websiteTemplateSections } = await import('@/lib/sites/editor/templates')
  const { withWebsiteIds } = await import('@/lib/sites/editor/seed')
  const { describeWebsiteVeraChange } = await import('@/lib/sites/editor/vera-layout')
  const sections = websiteTemplateSections('NewWorld', 'Program')
  const doc = withWebsiteIds({ root: {}, content: sections.map((s) => ({ type: s.type, props: { ...(config.components[s.type]?.defaultProps ?? {}), ...(s.props ?? {}) } })) } as never) as { root: object; content: { type: string; props: { id: string } }[] }
  const ids = doc.content.map((b) => b.props.id)
  const { themeAccents } = await import('@/lib/themes/editor-dials')
  const accents = themeAccents('NewWorld').map((a) => ({ id: a.id, label: a.label }))
  const changes = [
    { kind: 'move' as const, sectionId: ids[2] ?? ids[0], toPosition: 2 },
    { kind: 'visibility' as const, sectionId: ids[ids.length - 1], device: 'phone' as const, visible: false },
    { kind: 'tone' as const, sectionId: ids[1] ?? ids[0], tone: 'sand' as const },
    // LIVE-2098: site style picked from the theme's own menu.
    { kind: 'style' as const, dial: 'corners', option: 'square' },
    { kind: 'accent' as const, accent: accents[1]?.id ?? 'tide' },
  ]
  const menu = { dials: [{ id: 'corners', label: 'Corners', options: [{ id: 'soft', label: 'Soft' }, { id: 'square', label: 'Square' }], current: 'soft', own: 'soft' }], accents, accent: null, looks: [] }
  const lines = changes.map((c, i) => ({ line: describeWebsiteVeraChange(c, doc as never, config, menu), ticked: i !== 2 }))
  const proposal = renderToStaticMarkup(<VeraLayoutProposal note="Your offerings move up under the hero, the last section stays off phones, and the site gets square corners and a new accent." lines={lines} refused={['Change 4: Vera does not write or rewrite your words, so that line was left out. Select the text and ask for coaching questions instead.']} onToggle={() => {}} onApply={() => {}} onDismiss={() => {}} previewing onPreview={() => {}} buttonClass="btn sm ink" dismissClass="btn sm txt" />)
  const initial = { v: 1 as const, revision: 0, published: null, versions: [], draft: { theme: 'NewWorld' as const, pages: [{ slug: 'home', label: 'Home', seo: { title: '', description: '' }, comments: [], doc }] } }
  let html = renderToStaticMarkup(<WebsiteEditorShell host="sunrise.frequencylocal.com" brandName="Sunrise Studio" author="Owner Person" initial={initial as never} config={config} live={{ events: [], circles: [], journeys: [] }} links={{ origin: 'https://frequencylocal.com', slug: 'sunrise', siteBase: '', pages: ['home'], contactHref: null, bookHref: null, email: null }} origin="https://frequencylocal.com" onSave={async () => ({ ok: false, error: '' })} onLayout={async () => ({ ok: false, error: '' })} />)
  const reply = '<div class="reply" role="status">'
  if (!html.includes(reply)) throw new Error('reply card not found')
  html = html.replace(reply, `<div class="reply on" role="status">${proposal}`)
  // On a phone the editor folds both rails after mount (a matchMedia effect a server render does not run).
  const page = (body: string) => `<!doctype html><html data-design="frequency"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${readFileSync(cssFile, 'utf8')}</style></head><body>${body}</body></html>`
  writeFileSync(`${out}/vera-layout-phone.html`, page(html.replace('data-lf="0" data-rf="0"', 'data-lf="1" data-rf="1"')))
  writeFileSync(`${out}/vera-layout.html`, `<!doctype html><html data-design="frequency"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${readFileSync(cssFile, 'utf8')}</style></head><body>${html}</body></html>`)
})
