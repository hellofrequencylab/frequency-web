import { BadgeCheck } from 'lucide-react'

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
