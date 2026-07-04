import { getPublishedSpotlight } from '@/lib/spotlight/data'
import { MemberProfileModules } from '@/components/widgets/member-profile/member-profile-modules'
import { defaultMemberLayout } from '@/lib/entity-blocks/context'

// THE MEMBER'S SPOTLIGHT CONTENT, DECOMPOSED INTO INDIVIDUAL PROFILE BLOCKS (ADR-508 continuation).
//
// Replaces the old single "More about {name}" card (profile-links-section.tsx) that wrapped the whole
// Spotlight body in one box. Now each Spotlight block renders as its OWN block in the in-app profile,
// through the SAME unified member renderer the public /spotlight page uses (U3, MemberProfileModules) —
// one render, two surfaces. FAIL-SAFE: a member with no published Spotlight renders nothing.
//
// ARRANGED WITH THE PROFILE IN MIND: the profile already shows the member's bio (the identity band) and
// their gamification stats (the sidebar Standing card), so this DROPS the `about` and `stats` blocks to
// avoid rendering them twice, and leads with the member's authored narrative + media (heading, text,
// image, gallery, quote, embed) before their links and Top Friends. A lone `divider` is dropped too (it
// reads as a stray rule outside the Spotlight's own column). Blocks stack at the profile column's rhythm.

// The block ids hidden on the in-app profile because the profile chrome already renders them, plus the
// standalone-only divider. Everything else the member authored surfaces as its own block.
const PROFILE_HIDE = new Set(['about', 'stats', 'divider'])
// Lead with the member's authored story + media; links and Top Friends (and any future member block)
// follow. Built from the registry default so a new member block appears without editing this list.
const PROFILE_LEAD = ['heading', 'text', 'image', 'gallery', 'quote', 'embed']

function profileSpotlightLayout(): string[] {
  const shown = defaultMemberLayout().filter((id) => !PROFILE_HIDE.has(id))
  const lead = PROFILE_LEAD.filter((id) => shown.includes(id))
  const rest = shown.filter((id) => !lead.includes(id))
  return [...lead, ...rest]
}

export async function ProfileSpotlightBlocks({ handle, owner = false }: { handle: string; owner?: boolean }) {
  // A failed read must never break the profile; resolve inside the try, build JSX after.
  let data: Awaited<ReturnType<typeof getPublishedSpotlight>> = null
  try {
    data = await getPublishedSpotlight(handle)
  } catch {
    data = null
  }
  if (!data) return null

  // The FLAT layout path (each id -> its own <section>), at the profile column's tighter rhythm rather
  // than the standalone Spotlight's generous spacing. `@container/profile` keeps blocks sizing to the
  // column, not the viewport.
  //
  // OWNER click-to-edit (Spaces item 6): when the viewer owns this profile, hand the renderer an editHref
  // so each block overlays a hover pencil that deep-links to the member's existing layout editor. A
  // visitor / non-owner passes nothing, so their render stays byte-identical.
  return (
    <MemberProfileModules
      member={data}
      layout={profileSpotlightLayout()}
      className="@container/profile space-y-6"
      editHref={owner ? () => `/people/${handle}/profile-preview/edit` : undefined}
    />
  )
}
