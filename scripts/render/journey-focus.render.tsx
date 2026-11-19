// FIXTURE RENDER: the Journey Focus player on The Business of Community 101's real lesson copy
// (scripts/seed-frequency-hq-boc.mts), written to $RENDER_OUT/journey-focus-<state>.html. RENDER_LESSON
// picks the step (0-based, default 0); RENDER_DONE marks that many steps done. See contacts.render.tsx
// for the run steps.
import { createElement } from 'react'
import { it, vi } from 'vitest'
import { bocFixture, writePage } from './journey-fixture'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => createElement('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => createElement('a', { href: p.href as string, className: p.className as string, 'aria-current': p['aria-current'] as never }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/journeys/x/play', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/components/on-air/mindless', () => ({ useMindless: () => ({ open() {} }) }))
vi.mock('@/app/(main)/journeys/[slug]/learn/actions', () => ({ completeJourneyLessonAction: async () => ({}), uncompleteJourneyLessonAction: async () => ({}) }))
vi.mock('@/components/layout/page-admin-bar', () => ({ PageAdminBar: () => null }))
vi.mock('@/app/themes/active/members-c', () => ({}))

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
