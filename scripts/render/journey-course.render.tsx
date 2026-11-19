// FIXTURE RENDER: the Journey course home on The Business of Community 101's real copy, written to
// $RENDER_OUT/journey-course-<done>.html. RENDER_DONE marks that many steps done; RENDER_LOCK=1
// drips the weeks (week 1 open). See contacts.render.tsx for the run steps.
import { createElement } from 'react'
import { it, vi } from 'vitest'
import { bocFixture, writePage } from './journey-fixture'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => createElement('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => createElement('a', { href: p.href as string, className: p.className as string, 'aria-current': p['aria-current'] as never }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/journeys/x/learn', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/app/themes/active/members-c', () => ({}))

it('renders the course home', async () => {
  const done = Number(process.env.RENDER_DONE ?? 0)
  const f = await bocFixture(done)
  const { JourneyCourseBody } = await import('@/components/frequency/members/journey/journey-course-body')
  const { OnThisJourneyPanel, GuidePanel, MoreJourneysPanel } = await import('@/components/frequency/members/journey/journey-side')
  const { JourneyDock } = await import('@/components/journey/nav/journey-dock')
  const { phaseLockStates } = await import('@/lib/journeys/schedule')
  const start = process.env.RENDER_LOCK ? new Date(Date.now() - 2 * 86400000).toISOString() : null
  const locks = phaseLockStates(f.tree.phases.length, start, 7)
  const btn = (label: string) => createElement('span', { className: 'btn sm', key: label }, label)
  const el = createElement(
    'div',
    { className: 'ap-main', style: { maxWidth: 1200, margin: '0 auto', padding: '32px 24px' } },
    createElement(JourneyCourseBody, {
      slug: 'x', title: f.plan.title, summary: f.plan.summary, eyebrow: 'Creator Lab · Course', tree: f.tree, locks, unit: 'week', cycle: null,
      anchorLessonId: null, phaseFocusById: f.phaseFocusById, pillarByLesson: {}, phaseEvents: {}, kickoff: null,
      runLine: start ? 'Your Run runs Jan 7 through Feb 4.' : null,
      actions: [btn('Manage'), btn('Set a price'), btn('Sales page'), btn('Share')],
      side: [
        createElement(OnThisJourneyPanel, { key: 'on', friends: [], adoptCount: 14 }),
        createElement(GuidePanel, { key: 'g', guides: [{ handle: 'danieltyack', displayName: 'Daniel Tyack', avatarUrl: null }, { handle: 'feargal', displayName: 'Feargal Walsh', avatarUrl: null }], host: { slug: 'frequency', name: 'Frequency', logoUrl: null } }),
        createElement(MoreJourneysPanel, { key: 'm', more: [{ slug: 'a', title: 'Morning light', coverImage: null, adoptCount: 22 }, { slug: 'b', title: 'Cold water', coverImage: null, adoptCount: 9 }] }),
      ],
      details: null, leave: createElement('span', { className: 't2' }, 'Leave this Journey'), coverImage: null,
    } as never),
    createElement(JourneyDock, { slug: 'x', active: 'course', percent: f.tree.percent }),
  )
  await writePage(`journey-course-${done}`, el)
})
