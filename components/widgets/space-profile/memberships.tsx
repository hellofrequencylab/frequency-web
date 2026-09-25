import { Suspense } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { decodeLegacyEntities } from '@/lib/entity-blocks/block-content'
import { Eyebrow } from '@/components/page-editor/blocks/kit'
import { MembershipJoin } from '@/components/spaces/membership-join'
import { MembershipJoinDialog } from '@/components/spaces/membership-join-dialog'
import { spaceHasActiveMembershipTiers } from '@/lib/spaces/memberships'
import { viewerManagesSpace } from '@/lib/spaces/operator'
import { getActiveSpace } from '@/lib/spaces/active-space'
import { getSpaceById } from '@/lib/spaces/store'
import { ModuleSection } from './section'

// MEMBERSHIPS — the call to action for joining this Space, and the plans behind it.
//
// 🔴 THIS IS A DOOR, LIKE THE TAB BESIDE IT (LIVE-509). The panel it opens is the SAME
// `MembershipJoin` server component the Memberships tab and `/book` both mount: the same tier read,
// the same capacity, included-event, waitlist and already-a-member states, the same checkout. There
// is exactly one membership surface on this platform and this block does not add a second one, it
// puts a button on the Home page that opens it without leaving the page.
//
// WHY A POP-UP AND NOT A GRID IN THE PAGE. The plans surface renders a free bar, a comparison grid
// and (at three or more paid tiers) a prestige band — Royal Temple's four rungs are most of a
// screen on a phone. Dropped inline it pushes everything an operator ordered below it off the
// fold; behind a button it is one tap and the page keeps its shape. The tab is still the linkable,
// crawlable version of the same thing, and this block links to it.
//
// FAIL-SAFE: no active tier, no section, unless the viewer manages the Space — the honest-empty
// rule every sibling block follows, with the manager carve-out the tab gate uses for the same
// reason (a manager at zero needs the way in to set tiers up).

/** The block header, composed from the same atoms every sibling block uses, so it re-skins with the
 *  Space's theme and brand accent exactly as the Events and Circles headers beside it do. */
// `text-page-title` with no `sm:text-3xl` step, which is where the sibling section headers (Circles,
// Events) go. Those head a full-width grid and earn the size; this one heads a bordered CARD, and a
// heading that outgrows its own card reads as a section that lost its container. It also keeps this
// file off the literal-display-type ratchet, which `text-3xl` would have raised.
function MembershipsHeader({ eyebrow, heading }: { eyebrow?: string; heading?: string }) {
  if (!eyebrow && !heading) return null
  return (
    <div className="mb-4">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      {heading && (
        <h2 className="font-display text-page-title uppercase tracking-tight text-balance text-text">
          {heading}
        </h2>
      )}
    </div>
  )
}

/** The band itself, resolved behind the block's own <Suspense> (renderSpaceBlock) so the tier read
 *  never blocks the sections above it — the same shape CirclesGrid uses. */
async function MembershipsBand({
  space,
  eyebrow,
  heading,
  body,
  ctaLabel,
}: {
  space: SpaceProfileContext
  eyebrow?: string
  heading?: string
  body?: string
  ctaLabel: string
}) {
  // SpaceProfileContext carries `entitlements` but NOT `ownerProfileId`, and the owner id is what
  // both the manager carve-out below and MembershipJoin's own operator prompt weigh. Resolving it
  // off the context alone would have silently failed the plain owner (who holds no space_members
  // row), so this takes the request-scoped Space the (main) layout already set, with the same
  // defensive re-resolve the profile chrome layout uses when the context is absent (the public
  // signed-out route renders these blocks through a different shell).
  const full = getActiveSpace() ?? (await getSpaceById(space.id))
  const ownerProfileId = full?.ownerProfileId ?? null
  const hasTiers = await spaceHasActiveMembershipTiers(space.id)
  // A manager keeps the band at zero tiers, because the panel is where the operator prompt
  // ("Your button opens memberships, but none are set up") lives, and that prompt is the way in.
  if (!hasTiers && !(await viewerManagesSpace({ id: space.id, ownerProfileId, entitlements: space.entitlements })))
    return null

  return (
    <div className="rounded-card border border-border bg-surface-elevated px-6 py-8 text-center sm:px-8 sm:py-10">
      <MembershipsHeader eyebrow={eyebrow} heading={heading} />
      {body && <p className="mx-auto max-w-prose text-body-sm leading-relaxed text-muted">{body}</p>}
      <div className="mt-6 flex flex-col items-center gap-3">
        <MembershipJoinDialog label={ctaLabel} heading="Become a member">
          <Suspense fallback={<PanelSkeleton />}>
            <MembershipJoin
              spaceId={space.id}
              slug={space.slug}
              ownerProfileId={ownerProfileId}
            />
          </Suspense>
        </MembershipJoinDialog>
        {/* The tab is the linkable, crawlable version of the same surface. Named by its
            DESTINATION rather than "See all", which would claim a quantity this band cannot know. */}
        <Link
          href={`/spaces/${space.slug}/memberships`}
          className="inline-flex items-center gap-1 text-body-sm font-semibold text-primary-strong hover:text-primary"
        >
          Membership details
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  )
}

/** Dimension-matched skeleton for the streamed tier fetch (no CLS, PAGE-FRAMEWORK §5.4). */
function PanelSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-4 w-64 animate-pulse rounded bg-surface-elevated/60" />
      <div className="grid gap-4 @lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-44 animate-pulse rounded-card bg-surface-elevated/60" />
        ))}
      </div>
    </div>
  )
}

export function MembershipsBlock({
  space,
  header,
  content,
}: {
  space: SpaceProfileContext
  header?: { eyebrow?: string; heading?: string }
  content?: Record<string, unknown>
}) {
  // Decoded on read for the same reason every other authored-string render site decodes: the
  // sanitizer escapes `'` and `"` on a content bag, and a plain render of an escaped string prints
  // the entity verbatim. A no-op on a value carrying no entities.
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? decodeLegacyEntities(v) : undefined)
  const bag = content ?? {}

  return (
    <ModuleSection anchor="memberships">
      <MembershipsBand
        space={space}
        eyebrow={header?.eyebrow ?? 'Join'}
        heading={header?.heading ?? 'Become a member'}
        body={
          str(bag.body) ??
          `Membership is how people belong to ${space.brandName} beyond a single visit. See what each one includes, and what it costs.`
        }
        ctaLabel={str(bag.ctaLabel) ?? 'See memberships'}
      />
    </ModuleSection>
  )
}
