'use client'

import { useEffect, useState } from 'react'
import { Sparkles, LoaderCircle } from 'lucide-react'
import { TrendArea } from '@/components/admin/spark-charts'
import {
  campaignMetricsAction,
  campaignTimelineAction,
  campaignCoachAction,
} from '@/app/(main)/admin/email-studio/panel-actions'
import type { CampaignMetrics, CampaignTimeline } from '@/lib/email-studio/analytics'
import type { CampaignCoachResult } from '@/lib/ai/campaign-coach'

// The deep-stats panel that unfolds under a SENT campaign row in the Marketing table. Loads exact
// per-campaign engagement (delivered / opens / clicks / bounces / complaints / unsubscribes) plus a
// daily open+click sparkline, then offers Vera's open-rate analysis on demand (one gated AI call, not
// on every expand). Clicks are the trustworthy signal; opens are flagged approximate (Apple Mail
// privacy). Semantic tokens only, no hex. No em dashes (voice canon).

const pct = (n: number): string => `${Math.round(n * 100)}%`

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl bg-surface-elevated/60 px-3 py-2">
      <p className="text-base font-extrabold leading-none tabular-nums text-text">{value}</p>
      <p className="mt-1 text-2xs font-medium text-muted">{label}</p>
      {hint && <p className="mt-0.5 text-2xs text-subtle">{hint}</p>}
    </div>
  )
}

export function CampaignAnalyticsExpansion({ campaignId }: { campaignId: string }) {
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null)
  const [timeline, setTimeline] = useState<CampaignTimeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [coach, setCoach] = useState<CampaignCoachResult | null>(null)
  const [coachLoading, setCoachLoading] = useState(false)

  useEffect(() => {
    let active = true
    async function run() {
      setLoading(true)
      try {
        const [m, t] = await Promise.all([campaignMetricsAction(campaignId), campaignTimelineAction(campaignId)])
        if (!active) return
        setMetrics(m)
        setTimeline(t)
      } catch {
        if (!active) return
        setMetrics(null)
        setTimeline(null)
      } finally {
        if (active) setLoading(false)
      }
    }
    void run()
    return () => {
      active = false
    }
  }, [campaignId])

  async function runCoach() {
    setCoachLoading(true)
    try {
      setCoach(await campaignCoachAction(campaignId))
    } catch {
      setCoach({ ok: false, reason: 'Vera could not run the analysis just now. The stats above are still live.' })
    } finally {
      setCoachLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted">
        <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
        Loading stats...
      </div>
    )
  }
  if (!metrics || !metrics.hasSent) {
    return <p className="px-4 py-4 text-sm text-muted">No engagement stats for this campaign yet.</p>
  }

  const legacy = metrics.attributionMode === 'legacy'
  const spark = timeline && timeline.opens.length > 1 ? timeline.opens : null

  return (
    <div className="space-y-4 border-t border-border bg-surface-elevated/30 px-4 py-4">
      {legacy ? (
        <div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Recipients" value={metrics.attributedRecipients.toLocaleString()} />
          </div>
          <p className="mt-2 text-2xs text-subtle">This send predates open and click tracking. Your next send has full stats.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Delivered" value={metrics.delivered.toLocaleString()} hint={`of ${metrics.sent.toLocaleString()} sent`} />
            <Stat label="Open rate" value={pct(metrics.openRate)} hint={`${metrics.opened.toLocaleString()} opens`} />
            <Stat label="Click rate" value={pct(metrics.clickRate)} hint={`${metrics.clicked.toLocaleString()} clicks`} />
            <Stat label="Bounce rate" value={pct(metrics.bounceRate)} hint={`${metrics.bounced.toLocaleString()} bounced`} />
            <Stat label="Complaints" value={metrics.complained.toLocaleString()} />
            <Stat label="Unsubscribes" value={metrics.unsubscribed.toLocaleString()} />
          </div>
          <p className="text-2xs text-subtle">Opens are approximate (Apple Mail privacy inflates them). Weight clicks as the real signal.</p>

          {spark && (
            <div>
              <p className="mb-1 text-2xs font-medium text-muted">Opens per day since send</p>
              <div className="h-10">
                <TrendArea points={spark} height={40} />
              </div>
            </div>
          )}
        </>
      )}

      {/* Vera open-rate analysis (on demand, one gated AI call) */}
      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-text">
            <Sparkles className="h-3.5 w-3.5 text-primary-strong" aria-hidden /> Vera on your open rate
          </p>
          {!coach && (
            <button
              type="button"
              onClick={runCoach}
              disabled={coachLoading || legacy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-primary-strong transition-colors hover:bg-surface-elevated disabled:opacity-50 motion-reduce:transition-none"
            >
              {coachLoading ? (
                <>
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> Analyzing...
                </>
              ) : (
                'Analyze my opens'
              )}
            </button>
          )}
        </div>
        {legacy && !coach && (
          <p className="mt-1.5 text-2xs text-subtle">Analysis needs open and click data, which starts with your next send.</p>
        )}
        {coach && (
          <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-muted">
            {coach.ok ? coach.analysis : coach.reason}
          </p>
        )}
      </div>
    </div>
  )
}
