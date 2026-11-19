// FIXTURE RENDER: the Library (/journeys/library) on three Journeys at different places, written to
// $RENDER_OUT/journey-library.html. The page is the real one; only its reads are stood in.
import { createElement } from 'react'
import { it, vi } from 'vitest'
import { writePage } from './journey-fixture'
import type { MemberJourneyProgress } from '@/lib/journeys/progress'

const j = (o: Partial<MemberJourneyProgress> & { slug: string; title: string; phasePercents: number[] }): MemberJourneyProgress => {
  const done = o.phasePercents.filter((p) => p === 100).length
  const percent = Math.round(o.phasePercents.reduce((a, b) => a + b, 0) / o.phasePercents.length)
  return {
    planId: o.slug, emoji: null, accent: null, percent, phasesComplete: done, phasesTotal: o.phasePercents.length, complete: percent === 100,
    nextLesson: percent === 100 ? null : { id: 'n', title: 'Lesson · Run a room people come back to', href: '#' },
    inCohort: false, coverImage: null, ongoing: false, coverFocus: null, unit: 'week', lessonsLeft: percent === 100 ? 0 : 9, ...o,
  }
}
const JOURNEYS = [
  j({ slug: 'boc', title: 'The Business of Community 101', phasePercents: [100, 67, 0, 0, 0, 0], inCohort: true }),
  j({ slug: 'light', title: 'Morning light', phasePercents: [0, 0, 0, 0], lessonsLeft: 12, nextLesson: { id: 'n', title: 'Overview · Why the first hour matters', href: '#' } }),
  j({ slug: 'cold', title: 'Cold water, twelve months', phasePercents: [100, 100, 100, 33, 0, 0, 0, 0, 0, 0, 0, 0], unit: 'month', ongoing: true, lessonsLeft: 26 }),
  j({ slug: 'done', title: 'Host your first gathering', phasePercents: [100, 100, 100] }),
]

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => createElement('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => createElement('a', { href: p.href as string, className: p.className as string, 'aria-current': p['aria-current'] as never }, p.children as never) }))
vi.mock('next/navigation', () => ({ redirect() {}, useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/journeys/library', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/app/themes/active/members-c', () => ({}))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => 'me' }))
vi.mock('@/lib/journeys/progress', () => ({ getMemberJourneyProgress: async () => JOURNEYS }))
vi.mock('@/lib/layout/index-hero', () => ({ resolveIndexHero: async () => ({}) }))

it('renders the Library', async () => {
  const { default: Page } = await import('@/app/(main)/journeys/library/page')
  const page = await Page({ searchParams: Promise.resolve({}) })
  await writePage('journey-library', createElement('div', { className: 'ap-main', style: { maxWidth: Number(process.env.RENDER_MAX ?? 1200), margin: '0 auto', padding: '32px 24px' } }, page))
})
