// FIXTURE RENDER: the Frequency Journeys index with fixture plans, written to $RENDER_OUT/journeys.html
// (query via RENDER_Q). See contacts.render.tsx for the run steps.
import { createElement } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => createElement('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => createElement('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/journeys', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/components/studio/journey/new-journey-button', () => ({ NewJourneyButton: ({ className }: { className?: string }) => createElement('span', { className }, 'New journey') }))

const out = process.env.RENDER_OUT
const plan = (i: number, title: string, summary: string) => ({ id: `p${i}`, slug: `j${i}`, title, summary, cover_image: null, visibility: 'public', adopt_count: 30 - i * 4, author_id: 'x' })

it('renders the journeys index', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { JourneysIndexBody } = await import('@/components/frequency/members/journey/journeys-index-body')
  const lib = [plan(1, 'Morning light', 'Seven mornings of sun, breath and a slow start.'), plan(2, 'Cold water', 'A month of cold showers and what they teach.'), plan(3, 'Evening wind down', 'Five practices for sleeping better.')]
  const el = createElement(JourneysIndexBody, {
    title: 'Journeys', description: 'Guided tracks of practices across Mind, Body, Spirit, and Expression.', intro: null, cta: null, canBuild: true,
    order: ['journeys-start', 'journeys-mine', 'journeys-library'], progress: [], mine: [], library: lib, query: process.env.RENDER_Q ?? '',
  } as never)
  const { prelude } = await prerenderToNodeStream(el)
  const chunks: Buffer[] = []
  for await (const c of prelude) chunks.push(Buffer.from(c))
  writeFileSync(`${out}/journeys.html`,
    `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"></head><body><div data-kit="members" class="fq-members">${Buffer.concat(chunks).toString()}</div></body></html>`)
})
