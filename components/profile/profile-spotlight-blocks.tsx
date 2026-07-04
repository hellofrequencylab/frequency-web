import { getMemberProfileModules } from '@/lib/spotlight/data'
import { MemberProfileModules } from '@/components/widgets/member-profile/member-profile-modules'

// THE VISITOR'S VIEW OF A MEMBER'S IN-APP PROFILE BLOCKS (ADR-522).
//
// ONE in-app engine: a visitor now renders the member's freeform GRID — the exact arrangement / columns /
// hidden choices the OWNER designs in the in-rail builder and sees in OwnerProfileLayoutPreview — through
// the SAME MemberProfileModules grid path (member-profile-modules.tsx grid branch, resolveRows over
// meta.entityGrid). No more hardcoded flat order: owner-preview and visitor-view show the SAME page.
//
// DECOUPLED FROM THE PUBLISH GATE: reads through getMemberProfileModules, so the blocks render for EVERY
// member regardless of tier or meta.spotlight.published (the owner wants a uniform look). FAIL-SAFE: a
// missing / inactive member renders nothing; a member who never opened the builder gets the default
// starter layout (resolveRows falls back when `.grid` is null). The chrome the profile already shows (bio
// in the identity band, Zaps/Gems/Streak/Rank in the Standing card) is NOT duplicated: `about` and `stats`
// are held out of the member default starter + the builder palette, so the grid never re-renders them.
//
// The public `/spotlight/<handle>` mini-site keeps its OWN published gate + Puck render — unchanged here.

export async function ProfileSpotlightBlocks({ handle }: { handle: string }) {
  // A failed read must never break the profile; resolve inside the try, build JSX after.
  let data: Awaited<ReturnType<typeof getMemberProfileModules>> = null
  try {
    data = await getMemberProfileModules(handle)
  } catch {
    data = null
  }
  if (!data) return null

  // GRID mode (the `grid` prop is supplied — even when null): the visitor gets a STATIC render of the
  // member's resolved grid, identical to the owner's live preview. resolveRows falls back to the default
  // starter when the member has no saved layout, so a fresh member still shows a sensible default.
  return (
    <MemberProfileModules
      member={data}
      grid={data.grid}
      className="@container/profile space-y-6"
    />
  )
}
