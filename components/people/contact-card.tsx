import Link from 'next/link'
import Image from 'next/image'
import { MapPin } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import type { RoleChipKey } from '@/lib/community-roles'
import { DemoBadge } from '@/components/ui/demo-badge'
import { BAND_LABEL, type ProximityBand } from '@/lib/connections/location'
import { PersonCard } from '@/components/cards/person-card'
import { MemberTierMarks } from '@/components/people/member-tier-marks'
import { SITE_DESIGN } from '@/lib/theme/design'

// FREQUENCY (LIVE-1086): the members kit's `.card`, the same <PersonCard> Friends and the suggestions draw,
// so a person reads identically on all three Network pages (role and proximity band as `.tag` chips).
// Inlined at build; DAWN's portrait tile below is unchanged.
const FREQUENCY = SITE_DESIGN === 'frequency'

// Portrait contact card for the Community directory — a vertical, browse-first
// card: a prominent centered avatar, then the name, @handle, a role badge and
// (optionally) a location. Reads as a "person tile" you scan a grid of, vs. the
// landscape <PersonCard> rows used in dense lists.
//
// Presentational + server-friendly (no hooks). The whole card is the link.
export function ContactCard({
  handle,
  displayName,
  avatarUrl,
  role,
  location,
  online = false,
  isDemo = false,
  band,
  crew = false,
  founding = false,
}: {
  handle: string
  displayName: string
  avatarUrl?: string | null
  role: RoleChipKey
  /** Region / city line under the role badge. */
  location?: string | null
  online?: boolean
  isDemo?: boolean
  /** Coarse proximity band (privacy-safe) — renders a small chip, never a distance.
   *  Omit (or 'unknown') to hide the chip. */
  band?: ProximityBand
  /** On the paid Crew membership (resolve with isEndorsed(membership_tier)). */
  crew?: boolean
  /** Holds Founding Member status (profiles.is_founding_member). */
  founding?: boolean
}) {
  const showBand = band != null && band !== 'unknown'
  if (FREQUENCY) {
    return (
      <PersonCard
        handle={handle}
        displayName={displayName}
        avatarUrl={avatarUrl}
        online={online}
        isDemo={isDemo}
        context={`@${handle}`}
        meta={
          <>
            <MemberTierMarks role={role} crew={crew} founding={founding} />
            {showBand && <span className="tag">{BAND_LABEL[band]}</span>}
            {location && <span>{location}</span>}
          </>
        }
      />
    )
  }
  return (
    <Link
      href={`/people/${handle}`}
      className={`group flex h-full flex-col items-center rounded-card border border-border bg-surface p-5 text-center lift-2 transition-all hover:border-primary-bg motion-reduce:transition-none ${
        isDemo ? 'dimmed' : ''
      }`}
    >
      <div className="relative">
        {avatarUrl ? (
          <Image
            src={avatarSrc(avatarUrl)}
            alt={displayName}
            width={72}
            height={72}
            sizes="72px"
            className="h-18 w-18 rounded-pill object-cover ring-2 ring-surface-elevated"
            style={avatarFocusStyle(avatarUrl)}
          />
        ) : (
          <div className="flex h-18 w-18 items-center justify-center rounded-pill bg-primary-bg text-lead font-semibold text-primary-strong select-none ring-2 ring-surface-elevated">
            {getInitials(displayName)}
          </div>
        )}
        {online && (
          <span
            aria-label="Online now"
            className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-pill bg-success ring-2 ring-surface"
          />
        )}
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <h3 className="truncate text-body-sm font-bold leading-tight text-text">{displayName}</h3>
        {isDemo && <DemoBadge />}
      </div>
      <p className="mt-0.5 truncate text-meta text-subtle">@{handle}</p>

      {showBand && (
        <span className="mt-2 inline-flex items-center gap-1 rounded-pill bg-primary-bg px-2 py-0.5 text-2xs font-semibold text-primary-strong">
          <MapPin className="h-2.5 w-2.5 shrink-0" />
          {BAND_LABEL[band]}
        </span>
      )}

      <div className="mt-3 flex flex-col items-center gap-1.5">
        <MemberTierMarks role={role} crew={crew} founding={founding} />
        {location && (
          <span className="inline-flex items-center gap-1 text-meta text-muted">
            <MapPin className="h-3 w-3 shrink-0 text-subtle" />
            <span className="truncate">{location}</span>
          </span>
        )}
      </div>
    </Link>
  )
}
