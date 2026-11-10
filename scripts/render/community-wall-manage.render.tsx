// FIXTURE RENDER: the owner's Community wall console (ADR-1938, LIVE-2077) to $RENDER_OUT/community-manage-<state>.html.
// Run like community-wall.render.tsx (build-css, then this file under vitest.render.config.ts, then the shots script).
import { createElement } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

const state: { v: 'posts' | 'empty' } = { v: 'posts' }

vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => createElement('a', { href: p.href as string, className: p.className as string }, p.children as never) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => '/spaces/bird-rock-yoga/manage/community', useSearchParams: () => new URLSearchParams(), notFound: () => { throw new Error('404') } }))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'owner' }) }))
vi.mock('@/lib/spaces/store', () => ({ getVisibleSpaceBySlug: async () => ({ id: 's1', slug: 'bird-rock-yoga', name: 'Bird Rock Yoga', brandName: 'Bird Rock Yoga', type: 'business', ownerProfileId: 'owner' }) }))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: async () => ({ canEditProfile: true, canModerateWall: true, isOwner: true, role: 'admin' }) }))
vi.mock('@/lib/spaces/community-wall', async (orig) => ({
  ...(await orig<object>()),
  readWallSettings: async () => ({ readAccess: 'anyone', postAccess: 'members', followersInteract: false }),
  // LIVE-2095: one banned person on the posts state, nobody on the empty state.
  listWallBans: async () => (state.v === 'posts' ? [{ profileId: 'u9', displayName: 'Sam Lee', handle: 'samlee', avatarUrl: null, reason: null, createdAt: '2026-11-08T10:00:00Z' }] : []),
}))
vi.mock('@/app/(main)/spaces/[slug]/manage/community/actions', () => ({ saveWallSettings: async () => ({ data: undefined }), moderateWallPost: async () => ({ data: undefined }), banWallMember: async () => ({ data: undefined }), liftWallBanAction: async () => ({ data: undefined }), reviewWallReport: async () => ({ data: undefined }) }))
// LIVE-2095: the report queue reads on the service role: two open reports on the posts state.
vi.mock('@/lib/supabase/admin', () => {
  const table = (name: string) => {
    const q: Record<string, unknown> = {}
    for (const k of ['select', 'eq', 'is', 'in', 'order']) q[k] = () => q
    q.limit = async () => ({
      error: null,
      data:
        state.v !== 'posts'
          ? []
          : name === 'posts'
            ? rows.map((r) => ({ id: r.id, body: r.body, author: r.author }))
            : [
                { id: 'r1', reason: 'spam', details: 'Selling gear on the wall again.', created_at: '2026-11-08T21:00:00Z', target_id: 'p3' },
                { id: 'r2', reason: 'harassment', details: null, created_at: '2026-11-07T09:30:00Z', target_id: 'p2' },
              ],
    })
    return q
  }
  return { createAdminClient: () => ({ from: table }) }
})
const rows = [
  { id: 'p1', body: 'Saturday’s flow moves to the courtyard because of the marine layer. Bring a layer, we start at 8.', created_at: '2026-11-02T16:00:00Z', is_pinned: true, hidden_at: null, author_id: 'owner', author: { display_name: 'Maya Torres' } },
  { id: 'p2', body: 'New member intro: I moved here in September and this is the first place that felt like a room I could walk into alone.', created_at: '2026-11-01T19:30:00Z', is_pinned: false, hidden_at: null, author_id: 'u2', author: { display_name: 'Jonah Park' } },
  { id: 'p3', body: 'Selling my old mat, DM me.', created_at: '2026-10-30T02:10:00Z', is_pinned: false, hidden_at: '2026-10-30T03:00:00Z', author_id: 'u9', author: { display_name: 'Sam Lee' } },
]
vi.mock('@/lib/supabase/server', () => {
  const q: Record<string, unknown> = {}
  for (const k of ['select', 'eq', 'is', 'order']) q[k] = () => q
  q.limit = async () => ({ data: state.v === 'posts' ? rows : [], error: null })
  return { createClient: async () => ({ from: () => q }) }
})

const out = process.env.RENDER_OUT
async function html(el: unknown): Promise<string> {
  const { prelude } = await prerenderToNodeStream(el as never)
  const chunks: Buffer[] = []
  for await (const c of prelude) chunks.push(Buffer.from(c))
  return Buffer.concat(chunks).toString()
}
const page = (body: string) =>
  `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"></head><body><div data-kit="members" data-energy="still"><div class="fq-members" style="max-width:1100px;margin:0 auto;padding:16px">${body}</div></div></body></html>`

it('renders the Community wall console', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const mod = await import('@/app/(main)/spaces/[slug]/manage/community/page')
  for (const s of ['posts', 'empty'] as const) {
    state.v = s
    const el = await mod.default({ params: Promise.resolve({ slug: 'bird-rock-yoga' }) })
    writeFileSync(`${out}/community-manage-${s}.html`, page(await html(el)))
  }
})
