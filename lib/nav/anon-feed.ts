// ── THE SIGNED-OUT FEED RULE (SCAN-889) ───────────────────────────────────────────────────────────
//
// Owner, 2026-10-14: "When a visitor goes to the feed, I want them to see the actual feed with their
// account as Anonymous." So a signed-out /feed is two different things by design system:
//
//   · Frequency: the REAL member Feed, inside the real member shell (header, left rail, right rail),
//     with the viewer drawn as an "Anonymous" stand-in and every read public-only. The proxy lets the
//     request through to app/(main)/layout.tsx, which renders that shell for exactly this path.
//   · DAWN: unchanged. The proxy rewrites to the public preview at app/(public)/feed-preview.
//
// ONLY the bare path. Every /feed/* stays protected exactly as before. Pure, so anon-feed.test.ts drives
// it without a NextRequest, and proxy.ts and the (main) layout ask the same question the same way.

import type { DesignId } from '@/lib/theme/design'

const ANON_FEED_PATH = '/feed'

/** Does this design render the signed-out Feed in the member shell (rather than the public preview)? */
export function anonFeedInShell(design: DesignId): boolean {
  return design === 'frequency'
}

/** Is this request a signed-out view of the Feed that the member shell renders as Anonymous? */
export function isAnonShellFeed(pathname: string | null | undefined, design: DesignId): boolean {
  return pathname === ANON_FEED_PATH && anonFeedInShell(design)
}

/**
 * What the proxy does with a request for the Feed: 'shell' lets a signed-out request through to the
 * member layout (Frequency), 'preview' rewrites it to the public preview (DAWN), and null leaves it to
 * the ordinary rules (a member, or any path that is not the bare Feed).
 */
export function anonFeedRoute({
  pathname,
  signedIn,
  design,
}: {
  pathname: string
  signedIn: boolean
  design: DesignId
}): 'shell' | 'preview' | null {
  if (signedIn || pathname !== ANON_FEED_PATH) return null
  return anonFeedInShell(design) ? 'shell' : 'preview'
}
