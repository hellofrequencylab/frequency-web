import Link from 'next/link'
import { Users, UserPlus, CalendarDays, Building2, ArrowUpRight } from 'lucide-react'
import { EntityCard } from '@/components/cards/entity-card'
import { spaceCategoryLabel } from '@/lib/spaces/categories'
import type { NetworkedSpace } from '@/lib/spaces/discovery'

// The directory card for one networked entity Space — a COVER-LED composition of the shared EntityCard
// (ENTITY-SPACES-BUILD §A.2 D2: compose, never author). The cover leads the card and now carries three
// overlays: the CATEGORY pill (top-left — the browse subcategory: Studios / Shops / …), the brand LOGO
// (bottom-left), and the Space's own ACTION control (bottom-right). The category pill + logo are
// decorative (they sit inside the profile link but never take a click — `coverOverlay`,
// pointer-events-none); the action is a REAL navigational Link rendered as a sibling of the profile link
// (`coverAction`) and styled as an unfilled text link, so the two anchors are never nested. The body
// carries the tagline plus a compact stats row (members · followers · upcoming events).
//
// Tokens only, no hex (D6): overlays sit on neutral DAWN surfaces + an ink legibility scrim so the logo
// and action read over any operator cover. The per-Space brand_accent is deliberately NOT painted here
// (D4: "the accent is a guest, not the host"). Operator images (cover + logo) are arbitrary URLs, so
// they render via a plain <img> (like BrandMark), not next/image.

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

// The brand anchor overlaid bottom-left on the cover: the operator's logo, or a neutral icon chip.
// Decorative (alt=""): the card title already carries the Space name, so it is not announced twice.
function SpaceLogo({ logoUrl }: { logoUrl: string | null }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- operator-supplied Space logo URL, not a build-time asset (matches BrandMark / circle-cover)
      <img
        src={logoUrl}
        alt=""
        className="h-12 w-12 rounded-xl border border-border bg-surface object-contain shadow-sm"
      />
    )
  }
  return (
    <span
      className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface text-subtle shadow-sm"
      aria-hidden
    >
      <Building2 className="h-5 w-5" />
    </span>
  )
}

// One compact stat in the body meta row. Hidden by the caller when the value is null/0.
function Stat({ Icon, label }: { Icon: typeof Users; label: string }) {
  return (
    <span className="flex items-center gap-1 shrink-0">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  )
}

export function SpaceCard({ space }: { space: NetworkedSpace }) {
  // Cheap stats — each shows only when it carries a real, non-zero count (a 0 or null is noise here).
  const members = space.memberCount && space.memberCount > 0 ? space.memberCount : null
  const followers = space.followerCount && space.followerCount > 0 ? space.followerCount : null
  const events = space.upcomingEventCount && space.upcomingEventCount > 0 ? space.upcomingEventCount : null

  return (
    <EntityCard
      href={`/spaces/${space.slug}`}
      cover={<SpaceCover coverUrl={space.coverUrl} />}
      coverAspect="video"
      coverOverlay={
        <>
          {/* Bottom-heavy ink scrim so the logo + action read over any cover image. */}
          <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent" />
          {/* CATEGORY pill, top-left — the Space's browse subcategory (Studios / Shops / …) on a soft
              backdrop (legible over photo or gradient). */}
          <span className="absolute left-3 top-3 rounded-full bg-surface/90 px-2.5 py-0.5 text-2xs font-semibold text-text shadow-sm backdrop-blur-sm">
            {spaceCategoryLabel(space.category)}
          </span>
          {/* LOGO, bottom-left. */}
          <span className="absolute bottom-3 left-3">
            <SpaceLogo logoUrl={space.logoUrl} />
          </span>
        </>
      }
      coverAction={
        space.action ? (
          // A text LINK on the index card (the button treatment lives on the Space profile HEADER, not here).
          // It sits over the cover's ink scrim bottom-right; the backdrop-blur keeps it legible on any operator
          // cover. Rendered as a sibling anchor of the card's profile link, so the two are never nested.
          <Link
            href={space.action.href}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-on-ink underline decoration-1 underline-offset-2 backdrop-blur-sm hover:decoration-2"
          >
            {space.action.label}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : undefined
      }
      title={space.name}
      description={space.tagline ?? undefined}
      meta={
        <>
          {/* The category now lives in the top-left cover pill (#7), so the body meta is stats only. */}
          {members != null && (
            <Stat Icon={Users} label={`${members} ${members === 1 ? 'member' : 'members'}`} />
          )}
          {followers != null && (
            <Stat Icon={UserPlus} label={`${followers} ${followers === 1 ? 'follower' : 'followers'}`} />
          )}
          {events != null && (
            <Stat Icon={CalendarDays} label={`${events} ${events === 1 ? 'event' : 'events'}`} />
          )}
        </>
      }
    />
  )
}
