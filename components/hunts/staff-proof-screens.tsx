import type { ReactNode } from 'react'
import { FocusTemplate } from '@/components/templates/focus-template'
import { StreamTemplate } from '@/components/templates/stream-template'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, Input } from '@/components/ui/field'

export function HuntStaffScanScreen({ venueName, controls }: { venueName: string; controls?: ReactNode }) {
  return (
    <FocusTemplate
      eyebrow="Frequency Hunts"
      title="Check a player’s proof"
      description={`Verify a player’s visit at ${venueName}.`}
      adminBar={false}
    >
      <section aria-label="Player proof" className="space-y-4 rounded-card border border-border bg-surface p-4">
        <p className="text-body-sm text-muted">Ask the player to show their one-time code. Scan it or enter it by hand.</p>
        {controls ?? (
          <>
            <Button type="button" disabled>Scan player code</Button>
            <Field label="Player code">
              <Input disabled autoComplete="off" />
            </Field>
            <Button type="button" variant="secondary" disabled>Check code</Button>
            <p className="text-body-sm text-muted">Proof checks are unavailable until the venue is connected.</p>
          </>
        )}
      </section>
    </FocusTemplate>
  )
}

type HeldClaim = Readonly<{
  reference: string
  reason: string
  ageLabel: string
  controls?: ReactNode
}>

export function HuntHeldClaimsScreen({ claims }: { claims: readonly HeldClaim[] }) {
  return (
    <StreamTemplate
      eyebrow="Frequency Hunts"
      title="Review held claims"
      description="Check claims that need a staff decision."
    >
      {claims.length === 0 ? (
        <EmptyState variant="cleared" title="No claims to review" description="New claims that need a decision will appear here." />
      ) : (
        <ul aria-label="Held claims" className="space-y-3">
          {claims.map((claim) => (
            <li key={claim.reference} className="rounded-card border border-border bg-surface p-4">
              <h2 className="text-body font-semibold">Claim {claim.reference}</h2>
              <p className="mt-1 text-body-sm text-muted">{claim.reason} · {claim.ageLabel}</p>
              <div className="mt-3">
                {claim.controls ?? <Button type="button" variant="secondary" disabled>Review claim</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </StreamTemplate>
  )
}
