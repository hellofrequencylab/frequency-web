import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// THE CIRCLE FEED RENDERS STRAIGHT, FOR EVERY VIEWER (LIVE-680, ADR-1659).
//
// The feed used to sit inside `TeaserGate`, a switched-off wrapper that would have given a
// below-tier viewer a 30-second peek, then blurred the feed behind an upgrade prompt. The owner
// retired it. These renders pin what the retirement promised: the feed is the same `<section>` it
// was with the flag off, and the viewer the gate was built to tease (signed in, not a member, not
// Crew) sees no countdown, no upgrade prompt and no blur, just the feed and the join nudge.

let ctx: Record<string, unknown> | null = null

vi.mock('@/lib/circles/active-circle', () => ({ getCircleContext: () => ctx }))
vi.mock('@/components/feed/composer', () => ({
  Composer: ({ placeholder }: { placeholder: string }) => <div data-stub="composer">{placeholder}</div>,
}))
vi.mock('@/components/feed/feed-list', () => ({
  FeedList: ({ emptyMessage }: { emptyMessage: string }) => <div data-stub="feed">{emptyMessage}</div>,
}))

const { CircleFeed } = await import('./circle-feed')

function viewer(over: Record<string, unknown>) {
  return {
    circle: { id: 'c1', name: 'Dawn Patrol', slug: 'dawn-patrol' },
    members: [],
    myProfileId: 'p-visitor',
    isMember: false,
    isHost: false,
    isCrew: false,
    justJoined: false,
    canManage: false,
    ...over,
  }
}

async function render() {
  const el = await CircleFeed()
  return el ? renderToStaticMarkup(el) : ''
}

beforeEach(() => {
  ctx = null
})

describe('CircleFeed after the teaser gate was retired', () => {
  it('shows a signed-in non-member the feed with no preview timer, upgrade prompt or blur', async () => {
    ctx = viewer({})
    const html = await render()
    expect(html.startsWith('<section>')).toBe(true)
    expect(html).toContain('Circle feed')
    expect(html).toContain('Join this circle to post')
    expect(html).toContain('data-stub="feed"')
    expect(html).not.toMatch(/Preview ·|Upgrade|blur-\[6px\]|role="dialog"/)
  })

  it('shows a member the composer inside the same plain section', async () => {
    ctx = viewer({ isMember: true, myProfileId: 'p-member' })
    const html = await render()
    expect(html.startsWith('<section>')).toBe(true)
    expect(html).toContain('data-stub="composer"')
    expect(html).not.toContain('Join this circle to post')
  })

  it('renders nothing off a circle route', async () => {
    expect(await CircleFeed()).toBeNull()
  })
})
