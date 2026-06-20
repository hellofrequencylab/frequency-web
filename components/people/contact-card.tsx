import Link from 'next/link'
import Image from 'next/image'
import { MapPin } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { RoleBadge } from '@/lib/community-roles'
import type { RoleChipKey } from '@/lib/community-roles'
import { DemoBadge } from '@/components/ui/demo-badge'
import { BAND_LABEL, type ProximityBand } from '@/lib/connections/location'

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
}) {
  const showBand = band != null && band !== 'unknown'
  return (
    <Link
      href={`/people/${handle}`}
      className={`group flex h-full flex-col items-center rounded-2xl border border-border bg-surface p-5 text-center shadow-sm transition-all hover:border-primary-bg hover:shadow-md motion-reduce:transition-none ${
        isDemo ? 'dimmed' : ''
      }`}
    >
      <div className="relative">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={displayName}
            width={72}
            height={72}
            className="h-18 w-18 rounded-full object-cover ring-2 ring-surface-elevated"
          />
        ) : (
          <div className="flex h-18 w-18 items-center justify-center rounded-full bg-primary-bg text-xl font-semibold text-primary-strong select-none ring-2 ring-surface-elevated">
            {getInitials(displayName)}
          </div>
        )}
        {online && (
          <span
            aria-label="Online now"
            className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-surface"
          />
        )}
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <h3 className="truncate text-sm font-bold leading-tight text-text">{displayName}</h3>
        {isDemo && <DemoBadge />}
      </div>
      <p className="mt-0.5 truncate text-xs text-subtle">@{handle}</p>

      {showBand && (
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary-bg px-2 py-0.5 text-2xs font-semibold text-primary-strong">
          <MapPin className="h-2.5 w-2.5 shrink-0" />
          {BAND_LABEL[band]}
        </span>
      )}

      <div className="mt-3 flex flex-col items-center gap-1.5">
        <RoleBadge role={role} className="text-3xs leading-tight" />
        {location && (
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <MapPin className="h-3 w-3 shrink-0 text-subtle" />
            <span className="truncate">{location}</span>
          </span>
        )}
      </div>
    </Link>
  )
}
