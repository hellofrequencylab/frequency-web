'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkles, LoaderCircle } from 'lucide-react'
import { Select } from '@/components/ui/select'
import { TrendArea } from '@/components/admin/spark-charts'
import {
  campaignMetricsAction,
  campaignTimelineAction,
  campaignCoachAction,
} from '@/app/(main)/admin/email-studio/panel-actions'
import type { CampaignMetrics, CampaignTimeline } from '@/lib/email-studio/analytics'
import type { CampaignCoachResult, CampaignCoachGoal } from '@/lib/ai/campaign-coach'

// The deep-stats panel that unfolds under a SENT campaign row in the Marketing table. Loads exact
// per-campaign engagement (delivered / opens / clicks / bounces / complaints / unsubscribes) plus a
// daily click sparkline, then offers outcome coaching on demand. Recorded events are not
// verified people or real-world conversions. Semantic tokens only, no hex. No em dashes (voice canon).

const pct = (n: number): string => `${Math.round(n * 100)}%`

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-card bg-surface-elevated/60 px-3 py-2">
      <p className="text-body font-extrabold leading-none tabular-nums text-text">{value}</p>
      <p className="mt-1 text-2xs font-medium text-muted">{label}</p>
      {hint && <p className="mt-0.5 text-2xs text-muted">{hint}</p>}
    </div>
  )
}

export function CampaignAnalyticsExpansion({ campaignId }: { campaignId: string }) {
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null)
  const [timeline, setTimeline] = useState<CampaignTimeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [coach, setCoach] = useState<CampaignCoachResult | null>(null)
  const [coachLoading, setCoachLoading] = useState(false)
  const [goal, setGoal] = useState<CampaignCoachGoal>('attendance')
  const coachRequest = useRef(0)

  useEffect(() => {
    let active = true
    coachRequest.current += 1
    async function run() {
      setCoach(null)
      setCoachLoading(false)
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
      coachRequest.current += 1
    }
  }, [campaignId])

  async function runCoach() {
    const request = ++coachRequest.current
    setCoachLoading(true)
    try {
      const result = await campaignCoachAction(campaignId, goal)
      if (request === coachRequest.current) setCoach(result)
    } catch {
      if (request === coachRequest.current) setCoach({ ok: false, reason: 'Vera could not run the analysis just now. The stats above are still live.' })
    } finally {
      if (request === coachRequest.current) setCoachLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-4 text-body-sm text-muted">
        <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
        Loading stats...
      </div>
    )
  }
  if (!metrics || !metrics.hasSent) {
    return <p className="px-4 py-4 text-body-sm text-muted">No engagement stats for this campaign yet.</p>
  }

  const legacy = metrics.attributionMode === 'legacy'
  const spark = timeline && timeline.clicks.length > 1 ? timeline.clicks : null

  return (
    <div className="space-y-4 border-t border-border bg-surface-elevated/30 px-4 py-4">
      {legacy ? (
        <div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Recipients" value={metrics.attributedRecipients.toLocaleString()} />
          </div>
          <p className="mt-2 text-2xs text-muted">Campaign-tagged engagement is unavailable for this send. Tagged sends can show recorded email events.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Delivered" value={metrics.delivered.toLocaleString()} hint={`of ${metrics.sent.toLocaleString()} sent`} />
            <Stat label="Opens / deliveries" value={pct(metrics.openRate)} hint={`${metrics.opened.toLocaleString()} opens`} />
            <Stat label="Clicks / deliveries" value={pct(metrics.clickRate)} hint={`${metrics.clicked.toLocaleString()} clicks`} />
            <Stat label="Bounce rate" value={pct(metrics.bounceRate)} hint={`${metrics.bounced.toLocaleString()} bounced`} />
            <Stat label="Complaints" value={metrics.complained.toLocaleString()} />
            <Stat label="Unsubscribes" value={metrics.unsubscribed.toLocaleString()} />
          </div>
          <p className="text-2xs text-muted">These ratios count recorded events, not verified people. Privacy tools affect opens, and repeat or automated clicks can affect clicks. Unsubscribe recording is incomplete.</p>

          {spark && (
            <div>
              <p className="mb-1 text-2xs font-medium text-muted">Recorded clicks per day since send</p>
              <div className="h-10">
                <TrendArea points={spark} height={40} />
              </div>
            </div>
          )}
        </>
      )}

      {/* On-demand coaching. The operator remains the author. */}
      <div className="rounded-card border border-border bg-surface p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-meta font-semibold text-text">
            <Sparkles className="h-3.5 w-3.5 text-primary-strong" aria-hidden /> Vera on your next step
          </p>
          {!coach && (
            <button
              type="button"
              onClick={runCoach}
              disabled={coachLoading}
              className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 py-1 text-meta font-semibold text-primary-strong transition-colors hover:bg-surface-elevated disabled:opacity-50 motion-reduce:transition-none"
            >
              {coachLoading ? (
                <>
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> Analyzing...
                </>
              ) : (
                'Review my next step'
              )}
            </button>
          )}
        </div>
        <p className="mt-2 text-meta text-muted">Choose what you want people to do. Vera asks questions; you write the message.</p>
        <label className="mt-3 block text-meta font-medium text-text">
          Campaign outcome
          <Select
            value={goal}
            disabled={coachLoading}
            onChange={(event) => {
              coachRequest.current += 1
              setGoal(event.target.value as CampaignCoachGoal)
              setCoach(null)
            }}
            wrapperClassName="mt-1"
            className="text-meta"
          >
            <option value="attendance">Attend a gathering</option>
            <option value="return_visits">Come back again</option>
            <option value="bookings">Complete a booking</option>
            <option value="replies">Send a useful reply</option>
          </Select>
        </label>
        <p className="mt-2 text-2xs text-muted">Outcome attribution is not available in these email stats. A click does not prove attendance, a booking or a return visit.</p>
        {legacy && !coach && (
          <p className="mt-1.5 text-2xs text-muted">Campaign-tagged engagement is unavailable here. Choose an outcome and decide how you will measure it before your next send.</p>
        )}
        {coach && (
          <div className="mt-3 space-y-2" role="status">
            <p className="text-2xs font-medium text-muted">{!coach.ok ? 'Coaching unavailable' : coach.source === 'checklist' ? 'Guided checklist. AI analysis was not used.' : 'Coaching questions'}</p>
            <p className="whitespace-pre-line text-meta leading-relaxed text-text">{coach.ok ? coach.analysis : coach.reason}</p>
            {coach.observedThrough && <p className="text-2xs text-muted">Email evidence: {coach.observedFrom ? new Date(coach.observedFrom).toLocaleString() : 'send date unavailable'} through {new Date(coach.observedThrough).toLocaleString()}. This is not a conversion window.</p>}
            {coach.limitations && <details className="text-2xs text-muted"><summary className="cursor-pointer font-medium">What these stats cannot tell us</summary><ul className="mt-2 list-disc space-y-1 pl-4">{coach.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></details>}
          </div>
        )}
      </div>
    </div>
  )
}
