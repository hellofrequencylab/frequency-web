// FIXTURE RENDER, step 2: the Space Contacts "Workspace" view (the shared MemberViewer, CRM variant) with
// fixture people, written to $RENDER_OUT/contacts.html. Run: node scripts/render/build-css.mjs $RENDER_OUT/app.css,
// then RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts, then shot.mjs on the html.
import { createElement } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => createElement('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => createElement('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/site-design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))

const out = process.env.RENDER_OUT
const people = [
  ['Audrey Lin', 'audrey', 'Host · 38 visits', ['resonant']],
  ['Priya Shah', 'priya', 'Circle member · 22 visits', ['resonant']],
  ['Sunny Ortega', 'sunny', 'Friend invite · 1 visit', ['new']],
  ['Jonah Park', 'jonah', 'Event guest · 9 visits', ['cooling']],
  ['Lena Cruz', 'lena', 'Circle member · 14 visits', ['cooling']],
  ['Sam Wells', 'sam', 'Walk-in · 3 visits', ['at_risk']],
] as const

it('renders the contacts workspace', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { MemberViewer } = await import('@/components/people/member-viewer')
  const members = people.map(([displayName, handle, headline, badges], i) => ({
    id: `m${i}`, handle, displayName, headline, badges: [...badges], stats: [{ label: 'Visits', value: String(40 - i * 6) }],
  }))
  const el = createElement(MemberViewer, {
    members, loadDetail: async () => null, detailVariant: 'crm', defaultView: 'list', pageSize: 24,
    initialSelectedId: 'm0', sortOptions: [{ key: 'recent', label: 'Newest', spec: { key: 'joined', direction: 'desc' } }],
    search: { placeholder: 'Search members', facets: [] },
  } as never)
  const { prelude } = await prerenderToNodeStream(el)
  const chunks: Buffer[] = []
  for await (const c of prelude) chunks.push(Buffer.from(c))
  const body = Buffer.concat(chunks).toString()
  writeFileSync(`${out}/contacts.html`,
    `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"></head><body><div data-kit="admin"><div class="adp" style="padding:24px">${body}</div></div></body></html>`)
})
