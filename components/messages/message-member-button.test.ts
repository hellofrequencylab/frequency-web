import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ── Drift guard: chat consolidation (ADR-896) ─────────────────────────────────────────────
// The owner's report was that "Reconnect with …" navigated to a chat page. Three separate call
// sites each owned a copy of that navigation (`<form action={startConversation.bind(...)}>`),
// and the last time this behaviour changed only some of them moved. These are source-level
// assertions for the same reason the series fold has them (components/events/series-wiring.test.ts):
// a regression here is SILENT — the button still works, it just navigates again — so no runtime
// test would fail and no error would be logged.

const connectionPanel = readFileSync('components/people/connection-panel.tsx', 'utf8')
const profilePage = readFileSync('app/(main)/people/[handle]/page.tsx', 'utf8')
const circleMembers = readFileSync('components/circles/circle-members-list.tsx', 'utf8')
const dockChat = readFileSync('components/messages/dock-chat.tsx', 'utf8')
const launcher = readFileSync('components/vera/vera-launcher.tsx', 'utf8')
const actions = readFileSync('app/(main)/messages/actions.ts', 'utf8')

const CALLERS: Array<[string, string]> = [
  ['the profile Reconnect panel', connectionPanel],
  ['the profile header Message chip', profilePage],
  ['the circle roster row', circleMembers],
]

describe('every member-to-member message entry point opens the dock', () => {
  for (const [name, src] of CALLERS) {
    it(`${name} is non-trivial (guards a vacuous pass)`, () => {
      expect(src.length).toBeGreaterThan(1000)
    })

    it(`${name} uses the shared MessageMemberButton`, () => {
      expect(src).toContain('MessageMemberButton')
    })

    it(`${name} no longer submits a navigating form`, () => {
      // This is the regression itself: a bound form action redirects into /messages/<id>.
      expect(src).not.toContain('startConversation.bind')
      expect(src).not.toContain("from '@/app/(main)/messages/actions'")
    })
  }
})

describe('the dock can be opened at a named conversation', () => {
  it('DockChat accepts a programmatic request and keys it on requestId', () => {
    // Keying on the thread id instead would make a second press of the same button do nothing.
    expect(dockChat).toContain('requested')
    expect(dockChat).toContain('requested.requestId')
    expect(dockChat).toContain('onThreadOpenChange')
  })

  it('the launcher reads the event detail and the URL channel', () => {
    expect(launcher).toContain('parseDockRequest')
    expect(launcher).toContain('stripDockParams')
    // Keyed on BOTH, or a query-only change on the current page never fires the effect.
    expect(launcher).toContain('}, [pathname, search])')
    // replaceState, not router.replace: the page does not read these params.
    expect(launcher).toContain('window.history.replaceState')
  })

  it('the dock stays non-modal', () => {
    expect(launcher).toContain('aria-modal="false"')
  })
})

// ── Phase 2: the DM route retires behind a flag, and nothing points at it by hand ─────────
// These are source-level for the same reason as the block above: with the flag OFF (the
// shipped default) every one of these paths behaves exactly as it did, so a regression here
// costs nothing today and everything on the day the owner flips the row. Nothing would fail
// loudly at that moment either — a stale `/messages/<id>` just double-redirects, or worse,
// renders a page that was supposed to be gone.

const dmPage = readFileSync('app/(main)/messages/[id]/page.tsx', 'utf8')
const flags = readFileSync('lib/platform-flags.ts', 'utf8')
const dmDestination = readFileSync('lib/messages/dm-destination.ts', 'utf8')

const REDIRECTORS: Array<[string, string]> = [
  ['messages/actions.ts', actions],
  ['the circle CRM', readFileSync('app/(main)/circles/[slug]/crm/actions.ts', 'utf8')],
  ['the event manage action', readFileSync('app/(main)/events/[slug]/manage/actions.ts', 'utf8')],
  ['the event CRM', readFileSync('app/(main)/events/[slug]/manage/crm/actions.ts', 'utf8')],
  ['the hub CRM', readFileSync('app/(main)/hubs/[slug]/crm/actions.ts', 'utf8')],
  ['the nexus CRM', readFileSync('app/(main)/nexuses/[slug]/crm/actions.ts', 'utf8')],
]

describe('the DM route retires behind a flag, not a deletion', () => {
  it('the route file still exists and still answers', () => {
    // /messages/* is a registered iOS universal-link path
    // (public/.well-known/apple-app-site-association), so deleting the file breaks links
    // already in the wild. The gate must be a render-time redirect.
    expect(dmPage.length).toBeGreaterThan(1000)
    expect(dmPage).toContain('export default async function ConversationPage')
  })

  it('gates on the flag and hands the conversation over in the URL', () => {
    expect(dmPage).toContain('chatDmRoutesRetiredFlag')
    // The URL channel, not an event: after a full page load the launcher has not mounted, so
    // a dispatched event is lost with no trace.
    expect(dmPage).toContain('dockThreadPath(DOCK_DEFAULT_PATH')
  })

  it('the flag defaults FALSE on a missing row and on a read error', () => {
    const body = flags.slice(flags.indexOf('export const chatDmRoutesRetiredFlag'))
    const decl = body.slice(0, body.indexOf('})\n') + 3)
    // A transient DB hiccup must never make a member's messages unreachable.
    expect(decl).toContain('data?.value ?? false')
    expect(decl).toContain('return false')
  })
})

describe('nothing hand-builds a DM thread URL', () => {
  for (const [name, src] of REDIRECTORS) {
    it(`${name} redirects through dmThreadHref`, () => {
      expect(src).toContain('dmThreadHref')
      // The literal is what rots: it survives the flag flip and double-redirects.
      expect(src).not.toContain('redirect(`/messages/${conversationId}`)')
      expect(src).not.toContain('redirect(`/messages/${conv.id}`)')
    })
  }

  it('dmThreadHref reads the flag rather than assuming either answer', () => {
    expect(dmDestination).toContain('chatDmRoutesRetiredFlag')
    expect(dmDestination).toContain('dockThreadPath')
    expect(dmDestination).toContain('`/messages/${conversationId}`')
  })
})

describe('member-facing links into a thread open the dock instead', () => {
  const SITES: Array<[string, string]> = [
    ['the marketplace contact dialog', readFileSync('components/marketplace/listing-contact-dialog.tsx', 'utf8')],
    ['the event host message dialog', readFileSync('components/widgets/events/host-person-credit.tsx', 'utf8')],
    ['the service enquiry picker', readFileSync('components/marketplace/service-booking-picker.tsx', 'utf8')],
  ]

  for (const [name, src] of SITES) {
    it(`${name} calls openDockThread and builds no DM thread href`, () => {
      expect(src.length).toBeGreaterThan(1000)
      expect(src).toContain('openDockThread')
      // Narrow on purpose: these files legitimately import from `@/lib/messages/…`, so the
      // thing to forbid is a BUILT thread URL, not the substring.
      expect(src).not.toContain('`/messages/${')
      expect(src).not.toContain('href="/messages/')
      expect(src).not.toContain("href='/messages/")
    })
  }

  it('the service enquiry action returns an id, not a URL', () => {
    const src = readFileSync('app/(main)/market/service-actions.ts', 'utf8')
    expect(src).toContain('conversationId?: string')
    expect(src).not.toContain('url: `/messages/')
  })
})

describe('openDirectConversation keeps every gate startConversation has', () => {
  const body = actions.slice(actions.indexOf('export async function openDirectConversation'))

  it('establishes the caller first, then refuses self, blocked, and non-friends', () => {
    expect(body).toContain('await getMyProfileId()')
    expect(body).toContain('You cannot message yourself.')
    expect(body).toContain('isBlockedBetween')
    expect(body).toContain('You cannot message this member.')
    expect(body).toContain("status: 'accepted'")
    expect(body).toContain('You need to be friends before you can message.')
  })

  it('returns a refusal instead of throwing (a throw reaches the browser as a digest)', () => {
    expect(body).toContain('{ ok: false, error:')
  })
})
