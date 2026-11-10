import { Button } from '@/components/ui/button'
import { huntSwitchOn } from '@/lib/hunts/flags'

export function HuntDonationAsk({
  beneficiaryName,
  purpose,
  enabled = false,
}: {
  beneficiaryName: string
  purpose: string
  /** The owning surface supplies its independent activation decision after D8 approval. */
  enabled?: boolean
}) {
  if (!enabled || !huntSwitchOn('enabled')) return null

  return (
    <section aria-label="Optional donation" className="space-y-3 rounded-card border border-border bg-surface p-4">
      <h2 className="text-body font-semibold">Support {beneficiaryName}</h2>
      <p className="text-body-sm text-muted">{purpose}</p>
      <p className="text-body-sm text-muted">
        Playing is free. Giving is optional and won’t change your progress or rewards.
      </p>
      <p className="text-body-sm text-muted">Donations have their own receipt. Sponsor pledges are reported separately.</p>
      <Button type="button" disabled>Donate to {beneficiaryName}</Button>
      <p className="text-body-sm text-muted">Donations aren’t open yet.</p>
    </section>
  )
}
