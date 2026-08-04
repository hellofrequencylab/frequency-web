import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LivePostsBlock, LiveEventsBlock, type LiveData, type LivePost, type LiveEvent } from './blocks'

// ─────────────────────────────────────────────────────────────────────────────
// SHAPE GATE — the live marketing blocks must not silently delete a section.
//
// `getLiveData` (lib/page-editor/live-data.ts) resolves six Supabase RPCs in one
// Promise.all and fails open to `null`; every marketing route then renders
// `metadata={live ? { live } : {}}`. The marketing routes also cache with ISR
// (`export const revalidate = 3600` on /spaces), so a block that returned `null`
// because its list was empty could freeze a whole missing section into the public
// cache for an hour off one transient RPC error. These tests pin the render so a
// future edit can't reintroduce the vanishing section.
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

const liveData = (over: Partial<LiveData> = {}): LiveData => ({
  memberCount: 1234,
  circleCount: 56,
  upcomingEvents: [],
  posts: [],
  postsCurated: false,
  ...over,
})

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
})
