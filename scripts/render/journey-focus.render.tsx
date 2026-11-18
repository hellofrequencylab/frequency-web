// FIXTURE RENDER: the Journey Focus player on The Business of Community 101's real lesson copy
// (scripts/seed-frequency-hq-boc.mts), written to $RENDER_OUT/journey-focus-<state>.html. RENDER_LESSON
// picks the step (0-based, default 0); RENDER_DONE marks that many steps done. See contacts.render.tsx
// for the run steps.
import { createElement, type ReactNode } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => createElement('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => createElement('a', { href: p.href as string, className: p.className as string, 'aria-current': p['aria-current'] as never }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/journeys/x/play', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/components/on-air/mindless', () => ({ useMindless: () => ({ open() {} }) }))
vi.mock('@/app/(main)/journeys/[slug]/learn/actions', () => ({ completeJourneyLessonAction: async () => ({}), uncompleteJourneyLessonAction: async () => ({}) }))
vi.mock('@/components/layout/page-admin-bar', () => ({ PageAdminBar: () => null }))
vi.mock('@/app/themes/active/members-c', () => ({}))

const out = process.env.RENDER_OUT
// The three Frequency faces, read from the repo, so a render carries the real type.
const face = (family: string, file: string, style = 'normal') =>
  `@font-face{font-family:'${family}';font-style:${style};font-weight:100 900;src:url('file://${process.cwd()}/app/fonts/${file}') format('woff2')}`
const FONTS = [
  face('Unbounded', 'unbounded/unbounded.woff2'),
  face('Hanken Grotesk', 'hanken-grotesk/hanken-grotesk.woff2'),
  face('Instrument Serif', 'instrument-serif/instrument-serif.woff2'),
  face('Instrument Serif', 'instrument-serif/instrument-serif-italic.woff2', 'italic'),
].join('')

export async function bocFixture(doneCount: number) {
  const { BOC_101 } = await import('../seed-frequency-hq-boc.mts')
  const { buildJourneyTree } = await import('@/lib/journeys/tree')
  const blocks: Parameters<typeof buildJourneyTree>[0][number][] = []
  const lessonsById: Record<string, unknown> = {}
  const phaseFocusById: Record<string, string> = {}
  const order: string[] = []
  BOC_101.modules.forEach((m, mi) => {
    const pid = `w${mi + 1}`
    blocks.push({ id: pid, parent_id: null, block_type: 'phase', sort_order: mi, title: m.title, required: true, est_minutes: null, practice_id: null })
    phaseFocusById[pid] = m.body
    m.lessons.forEach((l, li) => {
      const id = `${pid}l${li + 1}`
      order.push(id)
      blocks.push({ id, parent_id: pid, block_type: l.type ?? 'lesson', sort_order: li, title: l.title, required: true, est_minutes: l.minutes, practice_id: null })
      lessonsById[id] = { id, type: l.type ?? 'lesson', title: l.title, body: l.body, media: null, estMinutes: l.minutes, practiceId: null, required: true, check: null, coachingPrompt: null, warmupMessage: null, extraCredit: false, bonusZaps: 0 }
    })
  })
  const tree = buildJourneyTree(blocks, order.slice(0, doneCount))
  return { plan: BOC_101, tree, lessonsById, phaseFocusById, order }
}

export async function writePage(name: string, el: ReactNode) {
  if (!out) throw new Error('set RENDER_OUT')
  const { prelude } = await prerenderToNodeStream(el)
  const chunks: Buffer[] = []
  for await (const c of prelude) chunks.push(Buffer.from(c))
  writeFileSync(
    `${out}/${name}.html`,
    `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"><style>${FONTS}</style></head><body><div data-kit="members" class="fq-members">${Buffer.concat(chunks).toString()}</div></body></html>`,
  )
}

it('renders the focus player', async () => {
  const done = Number(process.env.RENDER_DONE ?? 0)
  const at = Number(process.env.RENDER_LESSON ?? 0)
  const f = await bocFixture(done)
  const { FocusTemplate } = await import('@/components/templates')
  const { LessonProse } = await import('@/components/journey/v2/learn/lesson-prose')
  const bodyById = Object.fromEntries(Object.entries(f.lessonsById).map(([id, l]) => [id, createElement(LessonProse, null, (l as { body: string }).body)]))
  const { LearnPlayer } = await import('@/components/journey/v2/learn/learn-player')
  const { JourneyDock } = await import('@/components/journey/nav/journey-dock')
  const el = createElement(
    'div',
    { className: 'px-4 pb-2 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6' },
    createElement(
      FocusTemplate,
      { width: 'wide' } as never,
      createElement(LearnPlayer, { slug: 'x', title: f.plan.title, tree: f.tree, lessonsById: f.lessonsById, bodyById, phaseFocusById: f.phaseFocusById, initialLessonId: f.order[at] } as never),
      createElement(JourneyDock, { slug: 'x', active: 'focus', percent: f.tree.percent, focus: true }),
    ),
  )
  await writePage(`journey-focus-${at}`, el)
})
