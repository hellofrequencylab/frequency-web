import { getCommunityBoard } from '@/lib/feed/community-board'
import { CommunityBoardBody } from '@/components/feed/community-board'

// THE COMMUNITY BOARD, IN THE RAIL (ADR-1362).
//
// LIVE-248 built this board and made it the first module above the composer on /feed, moving the
// practice board to this column. The owner reverted that placement: the rail is `hidden lg:flex`,
// so a desktop-only column is the wrong home for the practice board — it carries the one-tap
// Start Practice button, and a phone lost it entirely. The two swapped back.
//
// The board itself was never the problem, so none of its code was thrown away. Its reader, its
// two groups (Next in your Circles, In your Spaces) and its empty state are unchanged; only the
// host column is. A gathering and a few Space posts are exactly what a rail panel is for, and
// this one degrades honestly when there is nothing to show.
//
// Its own async Server Component behind the rail's <Suspense>, so these reads never block the
// rest of the rail (PAGE-FRAMEWORK §5).
export async function CommunityBoardPanel({ profileId }: { profileId: string }) {
  const board = await getCommunityBoard(profileId)

  return (
    // Masked like every rail panel: the gathering, its date and the Space posts are live
    // readings (test/e2e/surfaces.ts, VISUAL_MASK_SITES). The board brings its own card chrome,
    // so this is a bare masked section rather than a WidgetCard around a second box — the same
    // shape ActivityPanel and SignaturePanel take in right-sidebar.tsx.
    <section data-visual-mask="rail-panel">
      <CommunityBoardBody board={board} />
    </section>
  )
}
