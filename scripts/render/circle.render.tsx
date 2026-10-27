// FIXTURE RENDER: the Circle page shell (cover, Meetups, tabs, side column) with fixture data, to
// $RENDER_OUT/circle-<view>.html. Run: node scripts/render/build-css.mjs $RENDER_OUT/app.css, then
// RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/circle.render.tsx
import { createElement } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => createElement('img', { src: p.src as string, alt: p.alt as string }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => createElement('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/circles/bird-rock-sunrise', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))
vi.mock('@/app/(main)/events/actions', () => ({ setRsvpStatus: async () => undefined }))
vi.mock('@/app/(main)/circles/remix-actions', () => ({ seedSisterCircleAction: async () => ({ slug: 'x' }) }))

const out = process.env.RENDER_OUT
const P = '/brand/frequency/photos/'

async function html(el: unknown): Promise<string> {
  const { prelude } = await prerenderToNodeStream(el as never)
  const chunks: Buffer[] = []
  for await (const c of prelude) chunks.push(Buffer.from(c))
  return Buffer.concat(chunks).toString()
}
const page = (body: string) =>
  `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"></head><body><div data-kit="members" data-energy="still"><div class="fq-members" style="max-width:1040px;margin:0 auto;padding:16px">${body}</div></div></body></html>`

const picks = [
  { id: 'e1', slug: 'sunrise-sit', title: 'Sunrise sit', startsAt: '2026-10-28T06:15:00Z', weekday: 'Wed', day: 28, time: '6:15am', when: 'Tomorrow · Wed, Oct 28', location: 'Bird Rock steps', note: 'Ten minutes facing the water, then coffee for whoever can stay', going: 9, faces: [{ name: 'Marcus Reed', avatarUrl: `${P}gathering-02.jpg` }, { name: 'Priya Shah', avatarUrl: `${P}gathering-03.jpg` }, { name: 'Lena Cruz', avatarUrl: `${P}gathering-04.jpg` }], mine: null },
  { id: 'e2', slug: 'beach-walk', title: 'Beach walk at dusk', startsAt: '2026-10-30T18:30:00Z', weekday: 'Fri', day: 30, time: '6:30pm', when: 'Fri, Oct 30', location: 'Windansea', note: null, going: 6, faces: [], mine: 'going' },
  { id: 'e3', slug: 'sunrise-sit-2', title: 'Sunrise sit', startsAt: '2026-11-03T06:15:00Z', weekday: 'Tue', day: 3, time: '6:15am', when: 'Tue, Nov 3', location: 'Bird Rock steps', note: null, going: 3, faces: [], mine: 'not_going' },
  { id: 'e4', slug: 'sunrise-sit-3', title: 'Sunrise sit', startsAt: '2026-11-06T06:15:00Z', weekday: 'Fri', day: 6, time: '6:15am', when: 'Fri, Nov 6', location: 'Bird Rock steps', note: null, going: 0, faces: [], mine: null },
]

it('renders the circle page shell', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { FqCircleShell } = await import('@/components/frequency/members/circle/circle-shell')
  const { FqMeetups } = await import('@/components/frequency/members/circle/circle-meetups')
  const { FqCircleHealthPanel } = await import('@/components/frequency/members/circle/circle-health-panel')
  const channels = [{ id: 'c1', name: 'Breathwork', slug: 'breathwork', primary: true }, { id: 'c2', name: 'Ocean', slug: 'ocean', primary: false }, { id: 'c3', name: 'Movement', slug: 'movement', primary: false }]
  const faces = ['02', '03', '04', '05', '06', '07'].map((n, i) => ({ id: `f${i}`, name: `Member ${i}`, avatarUrl: `${P}gathering-${n}.jpg` }))
  for (const view of ['member', 'visitor', 'host'] as const) {
    const shell = createElement(
      FqCircleShell,
      {
        notices: null,
        coverImage: `${P}day-meditation-circle.jpg`,
        statusLabel: 'Active',
        live: true,
        badge: { text: '6 here this week', live: true },
        channels,
        name: 'Bird Rock Sunrise Circle',
        subline: '42 members · In Person · Bird Rock',
        rhythm: 'Tue and Fri mornings',
        hostedBy: 'Hosted by Audrey Lin',
        invite: createElement('button', { className: 'btn' }, 'Invite'),
        primary: view === 'visitor' ? createElement('button', { className: 'btn pa' }, 'Join') : null,
        admin: view === 'host' ? createElement('button', { className: 'btn' }, 'Manage') : null,
        sister: view === 'host' ? createElement('div', { className: 'fqc-nearly' }, createElement('p', null, 'Your Circle is nearly full. Start a sister Circle so nobody gets turned away.'), createElement('button', { className: 'btn sm ink' }, 'Start a sister Circle')) : null,
        meetups: createElement(FqMeetups, { picks, view: view === 'member' ? 'member' : view, signedIn: true, hostFirstName: 'Audrey', attendance: { made: 9, of: 10 } } as never),
        tabs: [{ href: '/circles/bird-rock-sunrise', label: 'Feed' }, { href: '/circles/bird-rock-sunrise/whats-on', label: "What's Happening", count: 3 }, { href: '/circles/bird-rock-sunrise/members', label: 'Members', count: 42 }, { href: '/circles/bird-rock-sunrise/stats', label: 'Circle Stats' }],
        tabBase: '/circles/bird-rock-sunrise',
        tabTools: null,
        about: 'Ten minutes of quiet at first light, facing the water. Then coffee for whoever can stay. No experience needed.',
        agreements: ['Arrive by 6:10. We start on time.', 'Phones away until coffee.', 'Leave the steps cleaner than we found them.'],
        hostLine: null,
        memberCount: 42,
        memberCap: 46,
        faces,
        place: 'Bird Rock',
        meetLine: 'In person, Tue and Fri mornings.',
        hostPanel: view === 'host' ? createElement(FqCircleHealthPanel, { label: 'Circle health', earnedZaps: 2140, activeStreaks: 18, newThisWeek: 2 }) : null,
        children: createElement('div', { className: 'panel' }, 'Tab body goes here'),
      } as never,
    )
    writeFileSync(`${out}/circle-${view}.html`, page(await html(shell)))
  }
})

vi.mock('@/lib/circles/active-circle', () => ({
  getCircleContext: () => ({
    circle: { id: 'c', slug: 'bird-rock-sunrise', name: 'Bird Rock Sunrise Circle' },
    members: [
      { id: 'm1', joined_at: '2026-10-25T00:00:00Z', profile: { id: 'p1', display_name: 'Sunny Ortega', handle: 'sunny', avatar_url: '/brand/frequency/photos/gathering-05.jpg' } },
      { id: 'm2', joined_at: '2026-10-26T00:00:00Z', profile: { id: 'p2', display_name: 'Jonah Park', handle: 'jonah', avatar_url: '/brand/frequency/photos/gathering-06.jpg' } },
      { id: 'me', joined_at: '2025-01-01T00:00:00Z', profile: { id: 'me', display_name: 'You', handle: 'you', avatar_url: null } },
    ],
    isMember: true, isCrew: false, canManage: false, myProfileId: 'me', justJoined: process.env.RENDER_NEW === '1',
  }),
}))
vi.mock('@/lib/feed/my-dispatch-scopes', () => ({ getMyDispatchScopes: async () => [] }))
vi.mock('@/lib/demo-preference', () => ({ viewerHidesDemo: async () => false }))
vi.mock('@/lib/feed/feed-page', () => ({
  loadFeedPage: async () => ({
    kind: 'ok',
    items: [
      { id: 'a', post_type: 'post', body: "Friday we're shifting to 6:30 for the tide. Same steps. Marcus is bringing the big thermos, so leave your cup at home if you like.", created_at: '2026-10-26T12:00:00Z', is_pinned: true, is_demo: false, media_urls: [], comment_count: 0, reactions: [], author: { id: 'p3', display_name: 'Audrey Lin', handle: 'audrey', avatar_url: '/brand/frequency/photos/gathering-02.jpg' } },
      { id: 'b', post_type: 'post', body: 'First time Tuesday. Didn’t know anyone and left knowing five names. The pelicans showed up right on cue. See you Friday.', created_at: '2026-10-26T13:00:00Z', is_pinned: false, is_demo: false, media_urls: ['/brand/frequency/photos/gathering-07.jpg', '/brand/frequency/photos/gathering-08.jpg', '/brand/frequency/photos/gathering-09.jpg'], comment_count: 2, reactions: [], author: { id: 'p1', display_name: 'Sunny Ortega', handle: 'sunny', avatar_url: '/brand/frequency/photos/gathering-05.jpg' } },
    ],
  }),
}))
vi.mock('@/components/feed/post-replies', () => ({ PostReplies: () => createElement('div', { className: 'fqc-fixture' }, 'High five · 14   Reply') }))
vi.mock('@/components/feed/post-poll', () => ({ PostPoll: () => null }))
vi.mock('@/components/context-actions', () => ({ ContextActions: () => null }))
vi.mock('@/components/feed/composer', () => ({ Composer: (p: { placeholder?: string }) => createElement('div', { className: 'fqc-fixture' }, createElement('textarea', { placeholder: p.placeholder, rows: 2 }), createElement('button', { className: 'btn sm ink' }, 'Post')) }))

it('renders the circle feed tab', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { FqCircleFeed } = await import('@/components/frequency/members/circle/circle-feed')
  const el = await FqCircleFeed()
  writeFileSync(`${out}/circle-feed${process.env.RENDER_NEW === '1' ? '-new' : ''}.html`, page(await html(el)))
})
