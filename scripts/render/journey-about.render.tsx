// FIXTURE RENDER: the Journey About page body on The Business of Community 101's real copy, written
// to $RENDER_OUT/journey-about-<done>.html. RENDER_DONE marks that many steps done; RENDER_VISITOR=1
// draws it as someone not yet on the Journey sees it.
import { createElement } from 'react'
import { it, vi } from 'vitest'
import { bocFixture, writePage } from './journey-fixture'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => createElement('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => createElement('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/journeys/x', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/app/themes/active/members-c', () => ({}))

it('renders the About page', async () => {
  const done = Number(process.env.RENDER_DONE ?? 0)
  const visitor = !!process.env.RENDER_VISITOR
  const f = await bocFixture(visitor ? 0 : done)
  const { JourneyBody } = await import('@/components/frequency/members/journey/journey-body')
  const { JourneyDock } = await import('@/components/journey/nav/journey-dock')
  const btn = (label: string) => createElement('span', { className: 'btn sm', key: label }, label)
  const el = createElement(
    'div',
    { className: 'ap-main', style: { maxWidth: 1200, margin: '0 auto', padding: '32px 24px' } },
    createElement(JourneyBody, {
      plan: { slug: 'x', title: f.plan.title, summary: f.plan.summary, adoptCount: 14, coverImage: null },
      tree: f.tree, unit: 'week', tracked: !visitor, inside: !visitor, offerLabel: visitor ? '$40' : null,
      credits: createElement('span', { className: 't2' }, 'By Daniel Tyack'),
      actions: visitor ? [btn('Share')] : [btn('Manage'), btn('Share')],
      notice: null,
      enrol: createElement('div', { className: 'panel', style: { padding: 24 } }, createElement('span', { className: 'h2' }, visitor ? 'Get access · $40' : 'You are on this Journey')),
      details: null, more: [{ slug: 'a', title: 'Morning light', coverImage: null, adoptCount: 22 }], friends: [],
    } as never),
    createElement(JourneyDock, { slug: 'x', active: 'about', percent: f.tree.percent }),
  )
  await writePage(`journey-about-${visitor ? 'visitor' : done}`, el)
})
