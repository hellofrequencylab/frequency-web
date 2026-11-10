import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { huntSwitchOn } from '@/lib/hunts/flags'

export function HuntConsentPanel({
  spaceName,
  disclosureVersion,
  state,
  enabled = false,
}: {
  spaceName: string
  disclosureVersion: string
  state: 'not-subscribed' | 'subscribed' | 'withdrawn'
  /** The owning surface supplies its independent activation decision after D4 approval. */
  enabled?: boolean
}) {
  if (!enabled || !huntSwitchOn('enabled')) return null

  return (
    <section aria-label="Hunt email choices" className="space-y-3 rounded-card border border-border bg-surface p-4">
      <h2 className="text-body font-semibold">Email updates from {spaceName}</h2>
      <p className="text-body-sm text-muted">
        Your choice doesn’t change your Hunt progress, access, rewards, or prices.
      </p>
      <p className="text-body-sm text-muted">Email permission version {disclosureVersion}</p>
      {state === 'subscribed' ? (
        <>
          <p className="text-body-sm">You’ve opted in to email updates from {spaceName}.</p>
          <Button type="button" variant="secondary" disabled>Withdraw email permission</Button>
        </>
      ) : (
        <>
          {state === 'withdrawn' && <p className="text-body-sm">You withdrew email permission for {spaceName}.</p>}
          <Checkbox label={`Email me updates and offers from ${spaceName}`} />
          <Button type="button" disabled>Save email choice</Button>
        </>
      )}
      <p className="text-body-sm text-muted">Changes are unavailable while email preferences are being set up.</p>
    </section>
  )
}
