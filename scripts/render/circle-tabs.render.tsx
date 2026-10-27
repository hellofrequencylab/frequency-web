// FIXTURE RENDER: the Circle page's What's happening, Members and Circle Stats bodies with fixture data, to
// $RENDER_OUT/circle-{whats,members,stats}.html. Run like circle.render.tsx.
import { createElement } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => createElement('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => createElement('a', { href: p.href as string, className: p.className as string, 'aria-current': p['aria-current'] as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))
vi.mock('@/app/(main)/events/actions', () => ({ setRsvpStatus: async () => undefined }))
vi.mock('@/app/(main)/crew/leaderboard/actions', () => ({ setLeaderboardVisibility: async () => ({ ok: true }) }))
vi.mock('@/app/(main)/crew/leaderboard/streak-actions', () => ({ nudgeStreakMate: async () => ({}) }))
vi.mock('@/lib/circles/page-facts', () => ({
  loadMeetupPicks: async (events: { id: string }[]) => events.map((e, i) => ({ id: e.id, going: 9 - i * 3, mine: i === 1 ? 'going' : null })),
}))
vi.mock('@/lib/circles/circle-weeks', () => ({
  loadCircleWeeks: async () => Array.from({ length: 10 }, (_, i) => ({ start: `2026-0${i}`, activeMembers: i < 7 ? 20 : 4, circleSize: 42, met: i < 7 })),
}))
vi.mock('@/lib/circles/challenges', () => ({ getCircleChallenges: async () => [{ id: 'a', name: 'Sunrise 30', membersCompleted: 18, memberCount: 42 }, { id: 'b', name: 'Bring one friend this season', membersCompleted: 9, memberCount: 42 }] }))
vi.mock('@/lib/connections/metrics', () => ({ getCircleMomentum: async () => ({ members: 42, newMembers7d: 2, newTies7d: 11, upcomingEvents: 3 }) }))
vi.mock('@/lib/circles/effort-board', () => ({
  loadCircleBoard: async () => ({ showsBoard: true, showing: 4, me: null, rows: ['Lena Cruz', 'Marcus Reed', 'Priya Shah', 'Sunny Ortega'].map((n, i) => ({ id: `r${i}`, handle: n.split(' ')[0].toLowerCase(), displayName: n, avatarUrl: `/brand/frequency/photos/gathering-0${i + 2}.jpg`, streak: 4 + i, effort: { band: 'steady', index: 100 + i * 12, daysThisWeek: 3, recent: 3 } })) }),
}))
vi.mock('@/lib/quest/effort', () => ({ MIN_BOARD_CONTRIBUTORS: 3 }))
vi.mock('@/components/quest/collective-goal', () => ({ nextMilestone: () => ({ target: 2500, pct: 86 }) }))
vi.mock('@/components/quest/leaderboard-list', () => ({ EFFORT_BAND_CHIP: { steady: { label: 'Steady' } } }))

const out = process.env.RENDER_OUT
const P = '/brand/frequency/photos/'
async function html(el: unknown): Promise<string> {
  const { prelude } = await prerenderToNodeStream(el as never)
  const chunks: Buffer[] = []
  for await (const c of prelude) chunks.push(Buffer.from(c))
  return Buffer.concat(chunks).toString()
}
const page = (body: string) =>
  `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"></head><body><div data-kit="members" data-energy="still"><div class="fq-members" style="max-width:760px;margin:0 auto;padding:16px">${body}</div></div></body></html>`

it('renders the circle tab bodies', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { FqWhatsOnPane } = await import('@/components/frequency/members/circle/whats-on-pane')
  const { FqMembersPane } = await import('@/components/frequency/members/circle/members-pane')
  const { FqCircleStatsPane } = await import('@/components/frequency/members/circle/stats-pane')
  const events = [
    { id: 'e1', slug: 's1', title: 'Sunrise sit', location: 'Bird Rock steps', starts_at: '2026-10-28T06:15:00Z' },
    { id: 'e2', slug: 's2', title: 'Beach walk at dusk', location: 'Windansea', starts_at: '2026-11-01T17:20:00Z' },
    { id: 'e3', slug: 's3', title: 'Ocean Mind closing breakfast', location: 'Wayfarer Bread', starts_at: '2026-11-14T08:00:00Z' },
  ]
  const whats = await FqWhatsOnPane({
    practice: { title: 'Ten breaths at the water line', description: "Wherever there's water. A sink counts.", log: createElement('button', { className: 'btn ink' }, 'Log today') },
    events: events as never, hasMore: false, empty: null,
    journey: createElement('div', { className: 'stack' }, createElement('div', { className: 'sec-h' }, createElement('span', { className: 'h2' }, 'Ocean Mind')), createElement('div', { className: 'panel' }, 'Week 3 of 6')),
    tasks: createElement('div', { className: 'panel' }, 'Bring the big thermos Friday'),
    viewerId: 'me',
  })
  writeFileSync(`${out}/circle-whats.html`, page(await html(whats)))

  const names = ['Audrey Lin', 'Marcus Reed', 'Priya Shah', 'Sunny Ortega', 'Jonah Park', 'Lena Cruz', 'Omar Haddad', 'Ines Duarte']
  const people = names.map((n, i) => ({ id: `m${i}`, handle: n.split(' ')[0].toLowerCase(), name: n, avatarUrl: `${P}gathering-0${(i % 8) + 2}.jpg`, role: i === 0 ? 'Host' : i === 1 ? 'Admin' : i === 2 ? 'Moderator' : i < 5 ? 'New' : 'Member', holding: i < 3, isNew: i === 3 || i === 4 }))
  const members = createElement(FqMembersPane, {
    people, seatsLine: '4 seats open', seatsOpen: 4, empty: null, legend: null, youAreHere: true,
    nudges: createElement('section', { className: 'panel fqc-nudges' }, createElement('h2', { className: 'h3' }, "Keep someone's streak going"), createElement('ul', null, createElement('li', null, createElement('span', null, createElement('span', { className: 't1 fqm-block' }, 'Lena Cruz'), createElement('span', { className: 't2' }, '12-day streak · not logged today')), createElement('button', { className: 'btn sm' }, 'Nudge')))),
    invite: createElement('button', { className: 'btn ink' }, 'Copy invite link'),
  } as never)
  writeFileSync(`${out}/circle-members.html`, page(await html(members)))

  const stats = createElement(FqCircleStatsPane, { circleId: 'c', slug: 'bird-rock', total: 2140, contributors: 31, seasonName: 'Autumn', canSeeRows: true, optedOut: false, track: 'effort', memberIds: ['a'], viewerId: 'me' } as never)
  writeFileSync(`${out}/circle-stats.html`, page(await html(stats)))
})
