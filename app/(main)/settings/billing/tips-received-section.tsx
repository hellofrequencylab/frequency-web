import { HandCoins } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { listTipsReceived } from '@/lib/billing/tips-notify'
import { formatPriceCents } from '@/lib/commerce/types'
import { StatCard } from '@/components/ui/stat-card'

// "Tips received" (scan2 L9-05). Until 2026-09-05 a tip had no reader anywhere: the recipient
// found out from their Stripe payout, if at all. This is the one place a member can see what they
// were tipped: a total plus the most recent tips, newest first. Server component; renders nothing
// for a member who has never received a tip, so the plan section does not grow a blank card.

function whenLabel(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export async function TipsReceivedSection() {
  const me = await getCallerProfile()
  if (!me) return null
  const tips = await listTipsReceived(me.id)
  if (tips.count === 0) return null

  return (
    <div id="tips" className="mt-4 scroll-mt-24 rounded-card border border-border bg-surface p-5 lift-1">
      <div className="flex items-center gap-2">
        <HandCoins className="h-4 w-4 text-subtle" />
        <p className="text-meta font-semibold uppercase tracking-wide text-subtle">Tips received</p>
      </div>
      <div className="mt-3">
        <StatCard
          size="sm"
          label="Total tips"
          value={formatPriceCents(tips.totalCents)}
          detail={tips.count === 1 ? '1 tip' : `${tips.count} tips`}
          title="Every tip that reached your payout account. Frequency takes nothing from a tip."
        />
      </div>
      <ul className="mt-3 divide-y divide-border">
        {tips.recent.map((tip) => (
          <li key={tip.id} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="text-body-sm font-medium text-text">{tip.tipperName}</p>
              {tip.message && <p className="truncate text-meta text-muted">{tip.message}</p>}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-body-sm font-semibold text-text">{formatPriceCents(tip.amountCents, tip.currency)}</p>
              <p className="text-2xs text-muted">{whenLabel(tip.succeededAt)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
