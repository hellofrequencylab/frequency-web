// FIXTURE RENDER: a Space's Community wall page body (ADR-1938, LIVE-2077) with fixture data, to
// $RENDER_OUT/community-<state>.html. Run: node scripts/render/build-css.mjs $RENDER_OUT/app.css, then
// RENDER_OUT=<dir> pnpm exec vitest run -c scripts/render/vitest.render.config.ts scripts/render/community-wall.render.tsx
// then node scripts/render/builder-roles-themes-shots.mjs <dir> for 390, 1280, 1440, 1920 and 2000.
import { createElement } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

type State = 'member' | 'signed-out' | 'closed' | 'empty-manager' | 'follower' | 'team'
const state: { v: State } = { v: 'member' }
const P = '/brand/frequency/photos/'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => createElement('img', { src: p.src as string, alt: p.alt as string, className: p.className as string, width: p.width as number, height: p.height as number, style: p.fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', ...((p.style as object) ?? {}) } : (p.style as object) }) }))
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => createElement('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/spaces/bird-rock-yoga/community', useSearchParams: () => new URLSearchParams(), notFound: () => { throw new Error('404') }, redirect: () => { throw new Error('redirect') } }))
vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => (state.v === 'signed-out' || state.v === 'closed' ? null : { id: 'me' }) }))
vi.mock('@/lib/spaces/store', () => ({
  getVisibleSpaceBySlug: async () => ({ id: 's1', slug: 'bird-rock-yoga', name: 'Bird Rock Yoga', brandName: 'Bird Rock Yoga', type: 'business', ownerProfileId: 'owner' }),
  getSpaceVisibility: async () => 'network',
}))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: async () => ({ canEditProfile: state.v === 'empty-manager' || state.v === 'team', isOwner: state.v === 'empty-manager', role: state.v === 'team' ? 'moderator' : state.v === 'empty-manager' ? 'admin' : null }) }))
vi.mock('@/lib/spaces/active-space', () => ({ setActiveSpace: () => undefined }))
vi.mock('@/lib/spaces/profile-metadata', () => ({ spaceProfileMetadata: async () => ({}) }))
vi.mock('@/lib/spaces/community-wall', async (orig) => ({
  ...(await orig<object>()),
  readWallSettings: async () => ({ readAccess: state.v === 'closed' ? 'members' : 'anyone', postAccess: 'members', followersInteract: false }),
  readWallStanding: async () => (state.v === 'signed-out' || state.v === 'closed' ? (state.v === 'closed' ? 'signed-out' : 'signed-out') : state.v === 'follower' ? 'follower' : state.v === 'empty-manager' ? 'owner' : state.v === 'team' ? 'team' : 'member'),
  // LIVE-2095: the arrivals strip. Two faces for the member view, one for the team view, none on an empty wall.
  readWallArrivals: async () =>
    state.v === 'empty-manager' || state.v === 'follower'
      ? []
      : [
          { profileId: 'a1', displayName: 'Sunny Alvarez', handle: 'sunny', avatarUrl: `${P}gathering-06.jpg`, joinedAt: '2026-11-07T18:00:00Z' },
          { profileId: 'a2', displayName: 'Jonah Park', handle: 'jonah', avatarUrl: `${P}gathering-04.jpg`, joinedAt: '2026-11-06T18:00:00Z' },
        ],
}))
vi.mock('@/lib/calendar/public-month', () => ({ loadSpaceUpcomingFeed: async () => state.v === 'empty-manager' ? [] : [
  { id: 'e1', slug: 'sunrise-flow-nov-8', title: 'Sunrise flow in the courtyard', starts_at: '2026-11-08T08:00:00', location: 'Bird Rock courtyard' },
  { id: 'e2', slug: 'breathwork-nov-12', title: 'Breathwork night', starts_at: '2026-11-12T19:00:00', location: 'Studio B' },
] }))
vi.mock('@/lib/spaces/tagline', () => ({ readTagline: async () => 'Slow flow by the sea. Come as you are, leave a little lighter.' }))
vi.mock('@/lib/spaces/memberships', () => ({ countActiveMembersByTier: async () => new Map([['t1', 38], ['t2', 12]]) }))
vi.mock('@/lib/spaces/follows', () => ({ listSpaceFollowerIds: async () => Array.from({ length: 124 }, (_, i) => `f${i}`) }))
vi.mock('@/lib/circles/store', () => ({
  listPublicSpaceCircles: async () => [
    { id: 'c1', slug: 'sunrise-flow', name: 'Sunrise flow', member_count: 41 },
    { id: 'c2', slug: 'breathwork-nights', name: 'Breathwork nights', member_count: 18 },
    { id: 'c3', slug: 'teachers-circle', name: 'Teachers circle', member_count: 9 },
  ],
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: async () => ({
      error: null,
      data: state.v === 'empty-manager' ? [] : [
        { id: 'p1', body: 'Saturday’s flow moves to the courtyard because of the marine layer. Bring a layer, we start at 8.', post_type: 'feed', is_pinned: true, created_at: '2026-11-02T16:00:00Z', media_urls: [], is_demo: false, reaction_count: 14, comment_count: 3, engagement_score: 20, scope_id: 's1', visibility: 'cluster', author: { id: 'owner', display_name: 'Maya Torres', handle: 'maya', avatar_url: `${P}gathering-02.jpg`, community_role: 'host', membership_tier: null, is_system: false }, reactions: [] },
        { id: 'p2', body: 'New member intro: I moved here in September and this is the first place that felt like a room I could walk into alone.', post_type: 'feed', is_pinned: false, created_at: '2026-11-01T19:30:00Z', media_urls: [`${P}gathering-03.jpg`], is_demo: false, reaction_count: 9, comment_count: 5, engagement_score: 12, scope_id: 's1', visibility: 'cluster', author: { id: 'u2', display_name: 'Jonah Park', handle: 'jonah', avatar_url: `${P}gathering-04.jpg`, community_role: 'member', membership_tier: null, is_system: false }, reactions: [] },
        { id: 'p3', body: 'Thank you to everyone who came to the sunset sit. Same time next month.', post_type: 'feed', is_pinned: false, created_at: '2026-10-30T02:10:00Z', media_urls: [], is_demo: false, reaction_count: 6, comment_count: 1, engagement_score: 7, scope_id: 's1', visibility: 'cluster', author: { id: 'u3', display_name: 'Priya Shah', handle: 'priya', avatar_url: `${P}gathering-05.jpg`, community_role: 'member', membership_tier: null, is_system: false }, reactions: [] },
      ],
    }),
  }),
}))
vi.mock('@/app/(main)/spaces/[slug]/(profile)/community/actions', () => ({ createWallPost: async () => ({ data: undefined }) }))
vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('@/app/(main)/feed/actions', () => ({ createPost: async () => ({ data: undefined }), uploadPostImage: async () => null }))
vi.mock('@/components/feed/post-replies', () => ({ PostReplies: () => createElement('div', { className: 'px-4 pb-3 text-meta text-muted' }, 'High five · 14   Reply') }))
vi.mock('@/components/feed/post-poll', () => ({ PostPoll: () => null }))
vi.mock('@/components/context-actions', () => ({ ContextActions: () => null }))

const out = process.env.RENDER_OUT
async function html(el: unknown): Promise<string> {
  const { prelude } = await prerenderToNodeStream(el as never)
  const chunks: Buffer[] = []
  for await (const c of prelude) chunks.push(Buffer.from(c))
  return Buffer.concat(chunks).toString()
}
const page = (body: string) =>
  `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"></head><body><div data-kit="members" data-energy="still"><div class="fq-members" style="max-width:1100px;margin:0 auto;padding:16px">${body}</div></div></body></html>`

it('renders the Community wall states', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const mod = await import('@/app/(main)/spaces/[slug]/(profile)/community/page')
  const states: State[] = ['member', 'signed-out', 'closed', 'empty-manager', 'follower', 'team']
  for (const s of states) {
    state.v = s
    const el = await mod.default({ params: Promise.resolve({ slug: 'bird-rock-yoga' }) })
    writeFileSync(`${out}/community-${s}.html`, page(await html(el)))
  }
})
