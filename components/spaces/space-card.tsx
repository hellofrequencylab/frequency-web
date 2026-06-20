import { Users, Building2 } from 'lucide-react'
import { EntityCard } from '@/components/cards/entity-card'
import { spaceTypeLabel } from './space-type'
import type { NetworkedSpace } from '@/lib/spaces/discovery'

// The directory card for one networked entity Space — a THIN composition of the shared EntityCard
// (ENTITY-SPACES-BUILD §A.2 D2: compose, never author). A Space reads identically to every other
// browse grid: logo -> anchor, brand name -> title, type -> badge, tagline -> description, member
// count -> meta. Links to the Space's profile at /spaces/<slug>.
//
// Tokens only, no hex (D6): the type badge + logo fallback sit on neutral DAWN surfaces. The per-
// Space brand_accent is deliberately NOT painted here (it is decorative/unwired in Phase 0.5.14 and,
// per D4, "the accent is a guest, not the host" — the directory canvas stays calm).

// The brand anchor: the operator's logo (a plain <img>, like BrandMark — an arbitrary operator URL,
// not a build-time asset, so it is not run through next/image), or a neutral icon chip fallback.
// The logo is decorative (alt=""): the card title already carries the Space name, so the anchor is
// not announced twice.
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
