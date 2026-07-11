import { BadgeCheck, Gem } from 'lucide-react'

// The member verification badge (Resonance Feed Phase 4, ADR-418). Renders ONLY when a
// member is actually verified (verified_at set) — the verification flow itself is a
// future phase, so today this is the reusable surface waiting for it. Reads as a calm
// trust signal next to a name, never a status symbol.
export function VerifiedBadge({
  verified,
  className = '',
  withLabel = false,
}: {
  verified: boolean | null | undefined
  className?: string
  withLabel?: boolean
}) {
  if (!verified) return null
  return (
    <span
      className={`inline-flex items-center gap-1 text-success ${className}`}
      title="Verified member"
    >
      <BadgeCheck className="h-3.5 w-3.5" aria-label="Verified member" />
      {withLabel && <span className="text-2xs font-semibold">Verified</span>}
    </span>
  )
}

// The charter badge (Founding cohort, ADR-599). The VerifiedBadge sibling: renders ONLY when a
// member or Space is an ACTIVE Founder (a founding_members row, read-only via
// lib/founding/status.ts foundingActiveFor). Reads as a calm charter mark next to a name or on a
// storefront card, never a status symbol. `founding` is resolved by the caller (like VerifiedBadge's
// `verified`), so this component performs no data read of its own.
export function CharterBadge({
  founding,
  className = '',
  withLabel = false,
}: {
  founding: boolean | null | undefined
  className?: string
  withLabel?: boolean
}) {
  if (!founding) return null
  return (
    <span
      className={`inline-flex items-center gap-1 text-primary-strong ${className}`}
      title="Founding member"
    >
      <Gem className="h-3.5 w-3.5" aria-label="Founding member" />
      {withLabel && <span className="text-2xs font-semibold">Founding</span>}
    </span>
  )
}
