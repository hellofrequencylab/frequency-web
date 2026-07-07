import { Users, Building2 } from 'lucide-react'
import { EntityCard } from '@/components/cards/entity-card'
import { spaceTypeLabel } from './space-type'
import type { NetworkedSpace } from '@/lib/spaces/discovery'

// The directory card for one networked entity Space — a COVER-LED composition of the shared EntityCard
// (ENTITY-SPACES-BUILD §A.2 D2: compose, never author). A cover/banner image leads the card (falling
// back to a calm branded gradient when the operator hasn't set one), the logo anchors beside the brand
// name, the type is a pill, the tagline is the description, and the active member count is the footer
// meta. Reads like a modern business-directory card and links to /spaces/<slug>.
//
// Tokens only, no hex (D6): the placeholder + badge + logo fallback sit on neutral DAWN surfaces. The
// per-Space brand_accent is deliberately NOT painted here (D4: "the accent is a guest, not the host" —
// the directory canvas stays calm). Operator-supplied images (cover + logo) are arbitrary URLs, so they
// render via a plain <img> (like BrandMark), not next/image.

// The full-bleed banner: the operator's cover image, or a calm DAWN gradient placeholder so a Space
// without a cover still reads as a finished card (never a blank grey box). Decorative (alt="").
function SpaceCover({ coverUrl }: { coverUrl: string | null }) {
  if (coverUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- operator-supplied cover URL, not a build-time asset (matches BrandMark / logo)
      <img src={coverUrl} alt="" className="h-full w-full object-cover" />
    )
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-bg via-surface-elevated to-signal-bg">
      <Building2 className="h-7 w-7 text-primary-strong/40" aria-hidden />
    </div>
  )
}

// The brand anchor: the operator's logo, or a neutral icon chip. Decorative (alt=""): the card title
// already carries the Space name, so the anchor is not announced twice.
function SpaceAnchor({ logoUrl }: { logoUrl: string | null }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- operator-supplied Space logo URL, not a build-time asset (matches BrandMark / circle-cover)
      <img
        src={logoUrl}
        alt=""
        className="h-11 w-11 rounded-xl border border-border bg-surface object-contain"
      />
    )
  }
  return (
    <span
      className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-elevated text-subtle"
      aria-hidden
    >
      <Building2 className="h-5 w-5" />
    </span>
  )
}

export function SpaceCard({ space }: { space: NetworkedSpace }) {
  const memberLabel =
    space.memberCount != null
      ? `${space.memberCount} ${space.memberCount === 1 ? 'member' : 'members'}`
      : null

  return (
    <EntityCard
      href={`/spaces/${space.slug}`}
      cover={<SpaceCover coverUrl={space.coverUrl} />}
      coverAspect="video"
      anchor={<SpaceAnchor logoUrl={space.logoUrl} />}
      title={space.name}
      badge={
        <span className="shrink-0 rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-muted">
          {spaceTypeLabel(space.type)}
        </span>
      }
      description={space.tagline ?? undefined}
      meta={
        memberLabel ? (
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {memberLabel}
          </span>
        ) : undefined
      }
    />
  )
}
