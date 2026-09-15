import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CommunityBoard as Board } from '@/lib/feed/community-board'

// THE FEED HERO IS A COMMUNITY BOARD (LIVE-248 · CORE-MODEL §5 Phase 7.5.3 · ADR-1294).
//
// Two halves, because each catches what the other cannot:
//
//   1. BEHAVIOUR. The board's body is a pure function of the read, so every state renders here
//      without a database: a member with a Circle and a Space sees the gathering FIRST and their
//      Space activity under it, and a member with nothing sees ONE EmptyState with the next step
//      rather than two empty groups.
//   2. SOURCE SHAPE. The order of modules on a page is not something a render test can assert
//      from the outside (the page is an async Server Component fanning out five reads behind
//      three Suspense boundaries), and "the game is no longer in the hero" is a statement about
//      what the file does NOT contain. Both are read off the source, comment-stripped so a
//      mention in a comment cannot satisfy them — which matters here precisely because the
//      comments in these files DO name JourneyBoard, to say where it went.

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))

const { CommunityBoardBody } = await import('./community-board')

const FEED = 'app/(main)/feed/page.tsx'
const RAIL_MAP = 'lib/layout/rail-panels.ts'
const RAIL_REGISTRY = 'components/sidebar/rail-registry.tsx'
const READER = 'lib/feed/community-board.ts'

/** Strip comments so a count can never be satisfied by the documentation above the code. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n')
}

const GATHERING: NonNullable<Board['gathering']> = {
  id: 'e1',
  title: 'Thursday sit',
  slug: 'thursday-sit',
  startsAt: '2026-09-17T18:30:00.000Z',
  location: 'Encinitas',
  circleName: 'North County Mornings',
  circleSlug: 'north-county-mornings',
}

const POST: Board['activity'][number] = {
  id: 'p1',
  body: 'Doors open at six, coffee is on.',
  createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  authorName: 'Dana',
  spaceName: 'Meld Coworking',
  spaceSlug: 'meld',
}

const render = (board: Board) => renderToStaticMarkup(<CommunityBoardBody board={board} />)

describe('the board renders community first', () => {
  it('leads with the Circle gathering, then the Space activity, for a member with both', () => {
    const html = render({ gathering: GATHERING, activity: [POST], circleCount: 1, spaceCount: 1 })

    // Both halves are there, and each names its noun rather than the word "community".
    expect(html).toContain('Next in your Circles')
    expect(html).toContain('In your Spaces')
    expect(html).toContain('Thursday sit')
    expect(html).toContain('North County Mornings')
    expect(html).toContain('Encinitas')
    expect(html).toContain('Meld Coworking')
    expect(html).toContain('Doors open at six, coffee is on.')
    expect(html).toContain('Dana')

    // THE ORDER IS THE ROW. The gathering module opens the board; the Spaces module follows.
    expect(html.indexOf('Next in your Circles')).toBeLessThan(html.indexOf('In your Spaces'))
    // Each row links at its entity, so the board is a door and not a readout.
    expect(html).toContain('href="/events/thursday-sit"')
    expect(html).toContain('href="/spaces/meld"')
    // The populated board is masked for the visual suite: all of it is a database reading.
    expect(html).toContain('data-visual-mask="feed-community-board"')
  })

  it('says so in a line, not a second panel, when only the Spaces half has anything', () => {
    const html = render({ gathering: null, activity: [POST], circleCount: 1, spaceCount: 1 })
    expect(html).toContain('In your Spaces')
    expect(html).not.toContain('Next in your Circles')
    expect(html).toContain('Nothing on in your Circles yet.')
  })

  it('renders ONE EmptyState for a member with no Circles and no Spaces, pointing at a Circle', () => {
    const html = render({ gathering: null, activity: [], circleCount: 0, spaceCount: 0 })
    expect(html).toContain('Find your people')
    expect(html).toContain('href="/circles"')
    expect(html).toContain('Find a Circle')
    // One state, not two half-empty groups, and no module chrome behind it.
    expect(html).not.toContain('Next in your Circles')
    expect(html).not.toContain('In your Spaces')
    // An empty state is design surface, not a reading, so it is NOT masked.
    expect(html).not.toContain('data-visual-mask')
  })

  it('tells a member who does belong that the week is quiet, and points at what is on', () => {
    const html = render({ gathering: null, activity: [], circleCount: 2, spaceCount: 1 })
    expect(html).toContain('Quiet week')
    expect(html).toContain('href="/events"')
    expect(html).not.toContain('Find a Circle')
  })
})

describe('the game modules are out of the hero and in the rail', () => {
  const feed = code(FEED)

  it('the feed page renders the community board and neither practice board', () => {
    expect(feed).toMatch(/<CommunityBoard profileId=/)
    expect(feed).not.toMatch(/<JourneyBoard\b/)
    expect(feed).not.toMatch(/<PracticePrompt\b/)
    // Not imported either: a module the page cannot name is a module the hero cannot regrow.
    expect(feed).not.toMatch(/from '@\/components\/feed\/journey-board'/)
    expect(feed).not.toMatch(/from '@\/components\/practice\/practice-prompt'/)
  })

  it('the community board is the FIRST module above the composer', () => {
    const board = feed.indexOf('<CommunityBoard profileId')
    const composer = feed.indexOf('<CaptureBar')
    expect(board).toBeGreaterThan(-1)
    expect(composer).toBeGreaterThan(-1)
    expect(board, 'the board must sit above the composer').toBeLessThan(composer)
    // And nothing else in the hero is a module: the only things above it are the activation
    // guide and the page heading, both of which the board is allowed to follow.
    const above = feed.slice(0, board)
    expect(above).not.toMatch(/<LocalCornerCard\b/)
    expect(above).not.toMatch(/<HostPromptCard\b/)
    expect(above).not.toMatch(/<RomanceStrip\b/)
  })

  it('streams behind its own Suspense so neither read blocks the shell (PAGE-FRAMEWORK §5)', () => {
    const board = feed.indexOf('<CommunityBoard profileId')
    const suspense = feed.lastIndexOf('<Suspense', board)
    expect(suspense).toBeGreaterThan(-1)
    expect(feed.slice(suspense, board)).toContain('CommunityBoardSkeleton')
  })

  it('the rail leads /feed with the practice board, and drops the panel the hero now owns', () => {
    const map = code(RAIL_MAP)
    // The key exists on the union, so an unregistered string cannot pass as one.
    expect(map).toMatch(/\|\s*'practice'/)
    const rule = map.match(/\{ test: \(p\) => p === '\/feed', panels: \[([^\]]+)\] \}/)
    expect(rule, `the /feed rail rule is gone from ${RAIL_MAP}`).toBeTruthy()
    const panels = rule![1].split(',').map((k) => k.trim().replace(/'/g, ''))
    expect(panels[0]).toBe('practice')
    // The community board names the next gathering on the page, so the rail does not repeat it.
    expect(panels).not.toContain('events')
    // /nearby keeps the events panel: that page owns no gathering of its own.
    expect(map).toMatch(/p === '\/nearby'[^\n]*panels: \['events'/)
  })

  it('the registry renders the panel, so the key is not a dead string', () => {
    const registry = code(RAIL_REGISTRY)
    expect(registry).toMatch(/practice: \{\s*render: \(\{ profileId \}\) => <PracticeBoardPanel profileId=\{profileId\} \/>,/)
    expect(registry).toMatch(/from '@\/components\/sidebar\/practice-panel'/)
  })
})

describe('the reader is the gate (it runs through the admin client)', () => {
  const reader = code(READER)

  it('only ever reads ACTIVE memberships and insider-listable Circle events', () => {
    expect(reader).toMatch(/\.eq\('status', 'active'\)/)
    // Insider visibilities come from the one shared list, never a hand-typed array here.
    expect(reader).toMatch(/circleEventVisibilities\(true\)/)
    // Precise on purpose: the circles read carries a legitimate `.eq('unlisted', false)`, so the
    // guard is that no hand-typed visibility ARRAY names it.
    expect(reader).not.toMatch(/\[[^\]]*'unlisted'/)
    expect(reader).toMatch(/\.eq\('is_cancelled', false\)/)
    expect(reader).toMatch(/\.is\('removed_at', null\)/)
    expect(reader).toMatch(/\.eq\('status', 'published'\)/)
  })

  it('reaches Space activity through the Circles a Space OWNS, never by scoping a post to a Space', () => {
    // `posts.scope_id` is always a CIRCLE id: there is no scope_type column and no writer in the
    // repo stamps a Space, so `.in('scope_id', spaceIds)` could only ever return nothing. This
    // is the shape that regression would take, so it is asserted absent.
    expect(reader).not.toMatch(/\.in\('scope_id', spaceIds\)/)
    expect(reader).toMatch(/\.from\('circles'\)/)
    expect(reader).toMatch(/\.in\('space_id', spaceIds\)/)
    expect(reader).toMatch(/\.in\('scope_id', \[\.\.\.spaceOfCircle\.keys\(\)\]\)/)
  })

  it('never surfaces a circle-members-only post, and skips a Circle a Space has hidden', () => {
    // Belonging to a Space is not belonging to its Circles, so `group` is out. Scoped to the
    // activity reader: `'group'` is a legitimate SCOPE TYPE in the events read above it.
    const activity = reader.slice(
      reader.indexOf('async function spaceActivity'),
      reader.indexOf('export const getCommunityBoard'),
    )
    expect(activity.length).toBeGreaterThan(200)
    expect(activity).toMatch(/\.in\('visibility', \['public', 'cluster'\]\)/)
    expect(activity).not.toMatch(/'group'/)
    expect(activity).toMatch(/\.not\('status', 'in', '\(draft,archived\)'\)/)
    expect(activity).toMatch(/\.eq\('unlisted', false\)/)
  })

  it('reads top-level, unhidden posts only, and the member’s own Space as well', () => {
    expect(reader).toMatch(/\.is\('parent_id', null\)/)
    expect(reader).toMatch(/\.is\('hidden_at', null\)/)
    // The owner of a Space holds no space_members row, so their own Space is read too.
    expect(reader).toMatch(/\.eq\('owner_profile_id', profileId\)/)
  })

  it('is memoised per request, so the page and the rail do not pay twice', () => {
    expect(reader).toMatch(/export const getCommunityBoard = cache\(/)
  })
})
