import { Gift, Sparkles, Stamp } from 'lucide-react'
import { cardLine, formatCode, formatRewardValue, standingLine, type LoyaltyReward, type LoyaltyStanding } from '@/lib/loyalty/program'

// THE STAMP CARD (LIVE-940, docs/LOYALTY.md). One presentational card, no hooks, rendered by the check-in
// result (client) and the /rewards page (server). It always counts DOWN ("2 more visits to your free
// coffee"), never shows a raw balance, and prints an earned reward as a six-character counter code the
// member shows at the till. DAWN and Frequency tokens only; no hardcoded hex. Copy obeys CONTENT-VOICE.

export function StampCard({
  spaceName,
  stamps,
  required,
  rewardTitle,
  rewardValueCents,
  openRewards = [],
  justEarnedCode = null,
  compact = false,
  surprise = false,
  standing = null,
  surpriseOdds = 0,
}: {
  spaceName?: string | null
  stamps: number
  required: number
  rewardTitle: string
  rewardValueCents?: number
  openRewards?: LoyaltyReward[]
  /** The code earned by the tap that just happened, shown first and loud. */
  justEarnedCode?: string | null
  compact?: boolean
  /** The tap that just happened rolled the surprise stamp (LIVE-943). */
  surprise?: boolean
  /** The Regular badge and streak, when known. */
  standing?: LoyaltyStanding | null
  /** The stated odds, printed on the card; 0 prints nothing. */
  surpriseOdds?: number
}) {
  const value = formatRewardValue(rewardValueCents ?? 0)
  const standingText = standing ? standingLine(standing) : null
  const filled = Math.min(stamps, required)
  const codes = [
    ...(justEarnedCode ? [{ code: justEarnedCode, fresh: true }] : []),
    ...openRewards.filter((r) => r.code !== justEarnedCode).map((r) => ({ code: r.code, fresh: false })),
  ]

  return (
    <div className="rounded-card border border-border bg-surface p-4 text-left lift-1">
      {spaceName && (
        <p className="flex items-center gap-1.5 text-meta font-semibold text-muted">
          <Stamp className="h-3.5 w-3.5" aria-hidden /> {spaceName}
        </p>
      )}
      <div
        className={`mt-2 flex flex-wrap gap-1.5 ${compact ? '' : 'sm:gap-2'}`}
        role="img"
        aria-label={`${filled} of ${required} stamps`}
      >
        {Array.from({ length: required }).map((_, i) => (
          <span
            key={i}
            className={`flex h-7 w-7 items-center justify-center rounded-pill border text-meta font-bold ${
              i < filled ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface-elevated text-subtle'
            }`}
            aria-hidden
          >
            {i < filled ? '⚡' : i + 1}
          </span>
        ))}
      </div>
      <p className="mt-2 text-body-sm font-semibold text-text">
        {cardLine(stamps, required, rewardTitle)}
        {value ? <span className="font-normal text-muted"> ({value} value)</span> : null}
      </p>
      {surprise && (
        <p className="mt-1 flex items-center gap-1.5 text-body-sm font-semibold text-success">
          <Sparkles className="h-4 w-4" aria-hidden /> Surprise stamp. One in ten visits earns a second one.
        </p>
      )}
      {standingText && <p className="mt-1 text-meta font-semibold text-primary-strong">{standingText}</p>}
      {!surprise && surpriseOdds > 0 && !compact && (
        <p className="mt-1 text-meta text-subtle">One visit in ten earns a surprise stamp.</p>
      )}
      {codes.length > 0 && (
        <ul className="mt-3 space-y-2">
          {codes.map(({ code, fresh }) => (
            <li
              key={code}
              className={`flex items-center justify-between gap-3 rounded-control px-3 py-2 ${
                fresh ? 'bg-success-bg text-success' : 'bg-primary-bg text-primary-strong'
              }`}
            >
              <span className="flex items-center gap-2 text-body-sm font-semibold">
                <Gift className="h-4 w-4" aria-hidden />
                {fresh ? `You earned your ${rewardTitle || 'reward'}` : `${rewardTitle || 'Reward'} ready`}
              </span>
              <span className="font-mono text-body-sm font-bold tracking-wider">{formatCode(code)}</span>
            </li>
          ))}
          <li className="text-meta text-muted">Show the code at the counter to collect it.</li>
        </ul>
      )}
    </div>
  )
}
