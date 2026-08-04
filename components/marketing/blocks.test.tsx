import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LivePostsBlock, LiveEventsBlock, LiveStatsBlock, readLive, type LiveData, type LivePost, type LiveEvent } from './blocks'

// ─────────────────────────────────────────────────────────────────────────────
// SHAPE GATE — the live marketing blocks must not silently delete a section, and
// must not report a failed read as an empty community.
//
// `getLiveData` (lib/page-editor/live-data.ts) resolves six Supabase RPCs in one
// Promise.all and fails soft; every marketing route then renders
// `metadata={live ? { live } : {}}`. The marketing routes also cache with ISR
// (`export const revalidate = 3600` on /spaces), so a wrong render sticks on a public
// page for an hour off one transient RPC error: a section that returned `null` on an
// empty list would stay gone, and "no posts" would stand as a claim about the community
// rather than about the query. These tests pin both halves — the section survives, and
// the copy matches which thing actually happened.
// ─────────────────────────────────────────────────────────────────────────────

const post = (id: string, body: string): LivePost => ({
  id,
  body,
  created_at: '2026-07-01T12:00:00.000Z',
  media_urls: [],
  author: { display_name: 'Rae Fields', handle: 'rae', avatar_url: null, community_role: 'host' },
})

const event = (id: string, title: string): LiveEvent => ({
  id,
  title,
  starts_at: '2026-09-12T18:00:00.000Z',
  city: 'Encinitas',
  slug: `evt-${id}`,
})

/** Visible text only, so digit assertions can't trip over Tailwind class names. */
const textOf = (html: string) => html.replace(/<[^>]*>/g, ' ')

const OK: LiveData['status'] = { memberCount: 'ok', circleCount: 'ok', upcomingEvents: 'ok', posts: 'ok' }

/** A `live` whose reads all delivered. Override `status` to fail one source. */
const liveData = (over: Partial<LiveData> = {}): LiveData => ({
  memberCount: 1234,
  circleCount: 56,
  upcomingEvents: [],
  posts: [],
  postsCurated: false,
  status: OK,
  ...over,
})

/** A `live` where exactly one read failed, everything else delivered. */
const failing = (field: keyof LiveData['status'], over: Partial<LiveData> = {}): LiveData =>
  liveData({ ...over, status: { ...OK, [field]: 'error' } })

describe('LivePostsBlock keeps its section when there are no posts', () => {
  it('renders the section (not null) when live data resolved with zero posts', () => {
    const html = renderToStaticMarkup(
      <LivePostsBlock heading="People showing up for each other" live={liveData({ posts: [] })} />,
    )
    expect(html).not.toBe('')
    expect(html).toContain('<section')
    expect(html).toContain('People showing up for each other')
    expect(html).toContain('No posts to show right now. Check back soon.')
  })

  // THE BUG THIS CLOSES: `supabase.rpc()` resolves with `{ data: null, error }` instead of
  // rejecting, so one failed RPC used to arrive here as a defined `live` holding `posts: []`.
  // The block then published "No posts to show right now" as a statement about the community,
  // and ISR held it for an hour. The status map is what tells the two apart.
  it('says loading, not empty, when the posts read failed inside an otherwise fine payload', () => {
    const html = renderToStaticMarkup(
      <LivePostsBlock heading="People showing up for each other" live={failing('posts')} />,
    )
    expect(html).toContain('People showing up for each other')
    expect(html).toContain('Posts are taking a moment to load.')
    expect(html).not.toContain('No posts to show right now')
  })

  it('a failed posts read does not disturb the other fields', () => {
    // Only the broken source changes its story. A stats block on the same page still counts.
    const html = renderToStaticMarkup(<LiveStatsBlock live={failing('posts')} />)
    expect(textOf(html)).toContain('1,234')
  })

  it('renders the section (not null) when the live data call failed and `live` is absent', () => {
    const html = renderToStaticMarkup(<LivePostsBlock heading="People showing up for each other" />)
    expect(html).not.toBe('')
    expect(html).toContain('People showing up for each other')
    expect(html).toContain('Posts are taking a moment to load.')
  })

  it('still renders the section with no heading authored', () => {
    const html = renderToStaticMarkup(<LivePostsBlock live={liveData()} />)
    expect(html).toContain('<section')
    expect(html).toContain('No posts to show right now.')
    expect(html).not.toContain('<h2')
  })

  it('invents no posts and no counts in the fallback', () => {
    const failed = renderToStaticMarkup(<LivePostsBlock heading="People showing up for each other" />)
    const empty = renderToStaticMarkup(<LivePostsBlock heading="People showing up for each other" live={liveData()} />)
    for (const html of [failed, empty]) {
      expect(html).not.toContain('<article')
      expect(textOf(html)).not.toMatch(/\d/) // no fabricated counts or dates
    }
  })

  it('renders the posts when there are posts', () => {
    const html = renderToStaticMarkup(
      <LivePostsBlock
        heading="People showing up for each other"
        live={liveData({ posts: [post('p1', 'Brought oranges to the Thursday Circle.'), post('p2', 'Six of us walked at 6am.')] })}
      />,
    )
    expect(html).toContain('Brought oranges to the Thursday Circle.')
    expect(html).toContain('Six of us walked at 6am.')
    expect(html).toContain('Rae Fields')
    expect(html).toContain('<article')
    // The fallback note must not ride along with real posts.
    expect(html).not.toContain('taking a moment to load')
    expect(html).not.toContain('Check back soon')
  })

  it('honours the layout props on the fallback render, like the populated one', () => {
    const html = renderToStaticMarkup(<LivePostsBlock heading="Heading" pad="py-4" vis="hidden sm:block" />)
    expect(html).toContain('py-4')
    expect(html).toContain('hidden sm:block')
  })

  it('uses semantic tokens only in the fallback (no raw hex, no arbitrary type)', () => {
    const html = renderToStaticMarkup(<LivePostsBlock heading="Heading" />)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(html).not.toMatch(/text-\[\d/)
    expect(html).toContain('text-subtle')
    expect(html).toContain('rounded-card')
  })
})

describe('LiveEventsBlock', () => {
  it('renders the events when there are events', () => {
    const html = renderToStaticMarkup(<LiveEventsBlock live={liveData({ upcomingEvents: [event('e1', 'Sunrise breathwork')] })} />)
    expect(html).toContain('Sunrise breathwork')
    expect(html).toContain('Encinitas')
    expect(html).not.toContain('taking a moment to load')
  })

  it('keeps the section when the live data call failed and `live` is absent', () => {
    const html = renderToStaticMarkup(<LiveEventsBlock />)
    expect(html).not.toBe('')
    expect(html).toContain('<section')
    expect(html).toContain('Events are taking a moment to load.')
    expect(textOf(html)).not.toMatch(/\d/) // no fabricated dates or counts
  })

  // Deliberate asymmetry with LivePostsBlock: this block carries no heading of its
  // own, so a "no events" card would be a contextless box. When the data resolved and
  // there genuinely are no upcoming events, hiding is the honest render.
  it('still hides when live data resolved with genuinely zero events', () => {
    expect(renderToStaticMarkup(<LiveEventsBlock live={liveData({ upcomingEvents: [] })} />)).toBe('')
  })

  it('does NOT hide when the events read failed inside an otherwise fine payload', () => {
    // Hiding here would delete the section from a cached page for an hour on a transient error,
    // and nothing on the page would show that anything was missing.
    const html = renderToStaticMarkup(<LiveEventsBlock live={failing('upcomingEvents')} />)
    expect(html).not.toBe('')
    expect(html).toContain('Events are taking a moment to load.')
  })
})

describe('LiveStatsBlock only prints counts it actually measured', () => {
  it('prints the counts when every count read delivered', () => {
    const html = renderToStaticMarkup(<LiveStatsBlock live={liveData()} />)
    expect(textOf(html)).toContain('1,234')
    expect(textOf(html)).toContain('56')
    expect(html).not.toContain('taking a moment to load')
  })

  it('prints a measured zero, because that is data and not absence', () => {
    const html = renderToStaticMarkup(<LiveStatsBlock live={liveData({ memberCount: 0, circleCount: 0 })} />)
    expect(html).not.toContain('taking a moment to load')
    expect(html).toContain('Members')
  })

  it('prints no counts at all when one count read failed', () => {
    // `getLiveData` fills a failed count with 0. One placeholder 0 standing next to two real
    // figures reads as measured, so the whole trio waits rather than half-lying.
    const html = renderToStaticMarkup(<LiveStatsBlock live={failing('circleCount')} />)
    expect(html).toContain('These numbers are taking a moment to load.')
    expect(textOf(html)).not.toMatch(/\d/) // 1,234 must not survive next to a fake 0
  })

  it('prints no counts when the whole call failed and `live` is absent', () => {
    const html = renderToStaticMarkup(<LiveStatsBlock />)
    expect(html).toContain('These numbers are taking a moment to load.')
  })
})

describe('readLive is the only sanctioned way to read a live field', () => {
  it('reports ok with the value when the read delivered', () => {
    expect(readLive(liveData(), 'memberCount')).toEqual({ ok: true, value: 1234 })
  })

  it('reports not-ok and NO value when that field errored', () => {
    const read = readLive(failing('memberCount'), 'memberCount')
    expect(read.ok).toBe(false)
    expect(read.value).toBeUndefined() // the fail-soft 0 must not leak through as a fact
  })

  it('reports not-ok for every field when the whole call failed', () => {
    for (const field of ['memberCount', 'circleCount', 'upcomingEvents', 'posts'] as const) {
      expect(readLive(undefined, field).ok).toBe(false)
    }
  })

  it('treats a status-less payload as delivered, so an older `live` still renders', () => {
    // `puck.metadata` is `any`-typed, so a hand-built or older object can reach a block at
    // runtime. The pre-existing contract was that a present `live` had delivered; keep it,
    // rather than flipping every such page to "taking a moment to load".
    const legacy = { memberCount: 7, circleCount: 2, upcomingEvents: [], posts: [], postsCurated: false }
    expect(readLive(legacy as unknown as LiveData, 'memberCount')).toEqual({ ok: true, value: 7 })
  })
})
