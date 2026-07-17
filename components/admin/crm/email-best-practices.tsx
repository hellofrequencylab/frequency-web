import { CircleCheck, TriangleAlert, CircleHelp, Type, AlignLeft, UserRound, Clock, Target, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { MarketingEmailOverview } from '@/lib/email-studio/analytics'

// EMAIL BEST PRACTICES — a coaching dashboard for the CRM Marketing tab. Two halves:
//   1. HEALTH CHECKS derived from the live email_events ledger (bounce / complaint / engagement /
//      list-health), each graded against the industry threshold, so an operator sees at a glance
//      whether deliverability is safe.
//   2. An OPEN-RATE PLAYBOOK: the durable levers that move opens (subject, preheader, from-name,
//      timing, one CTA, list hygiene). Static guidance, always shown.
// Server component, no hooks. Semantic tokens only. No em dashes (voice canon).

type Grade = 'good' | 'watch' | 'na'

interface HealthCheck {
  label: string
  value: string
  target: string
  grade: Grade
  note: string
}

const pct1 = (n: number): string => `${(n * 100).toFixed(n < 0.01 ? 2 : 1)}%`

function buildChecks(o: MarketingEmailOverview): HealthCheck[] {
  const hasDelivery = o.delivered > 0
  const hasSent = o.sent > 0
  return [
    {
      label: 'Bounce rate',
      value: hasSent ? pct1(o.bounceRate) : 'No data',
      target: 'Under 2%',
      grade: !hasSent ? 'na' : o.bounceRate < 0.02 ? 'good' : 'watch',
      note:
        o.bounceRate < 0.02
          ? 'Your list is clean. Hard bounces are auto-suppressed so they never resend.'
          : 'High bounces hurt your sender reputation. Remove dead addresses and avoid old lists.',
    },
    {
      label: 'Spam complaints',
      value: hasDelivery ? pct1(o.complaintRate) : 'No data',
      target: 'Under 0.1%',
      grade: !hasDelivery ? 'na' : o.complaintRate < 0.001 ? 'good' : 'watch',
      note:
        o.complaintRate < 0.001
          ? 'People are not marking you as spam. Keep sending to folks who asked to hear from you.'
          : 'Complaints above 0.1% risk your inbox placement. Only email engaged, opted-in people.',
    },
    {
      label: 'Click rate',
      value: hasDelivery ? pct1(o.clickRate) : 'No data',
      target: 'Aim above 2%',
      grade: !hasDelivery ? 'na' : o.clickRate >= 0.02 ? 'good' : 'watch',
      note:
        o.clickRate >= 0.02
          ? 'Clicks are the real engagement signal (opens are inflated by Apple Mail privacy).'
          : 'Lift clicks with one clear call to action and a subject the body actually delivers on.',
    },
    {
      label: 'Unsubscribe rate',
      value: hasDelivery ? pct1(o.unsubscribeRate) : 'No data',
      target: 'Under 0.5%',
      grade: !hasDelivery ? 'na' : o.unsubscribeRate < 0.005 ? 'good' : 'watch',
      note:
        o.unsubscribeRate < 0.005
          ? 'Opt-outs are healthy. A few every send is normal list hygiene.'
          : 'A spike in opt-outs means the content or cadence missed. Send less, or more relevant.',
    },
  ]
}

const GRADE_STYLE: Record<Grade, { icon: LucideIcon; ring: string; tone: string; chip: string }> = {
  good: { icon: CircleCheck, ring: 'border-success/40', tone: 'text-success', chip: 'On track' },
  watch: { icon: TriangleAlert, ring: 'border-warning/50', tone: 'text-warning', chip: 'Needs a look' },
  na: { icon: CircleHelp, ring: 'border-border', tone: 'text-subtle', chip: 'No data yet' },
}

interface Practice {
  icon: LucideIcon
  title: string
  body: string
}

const PLAYBOOK: Practice[] = [
  { icon: Type, title: 'Write the subject like a text', body: 'Keep it under ~50 characters, specific, and human. Curiosity plus a clear benefit beats hype and spammy words.' },
  { icon: AlignLeft, title: 'Use the preheader', body: 'The preheader is a second subject line in the inbox. Extend the hook, do not repeat the subject or leave it blank.' },
  { icon: UserRound, title: 'Send from a real person', body: 'A named human (like Daniel Tyack) opens better than a brand or a noreply. Replies reaching a real inbox builds trust.' },
  { icon: Clock, title: 'Time it well', body: 'Mid-morning on Tuesday through Thursday tends to open best. Watch your own numbers and repeat what works.' },
  { icon: Target, title: 'One clear call to action', body: 'Give each email a single job. One primary button, repeated if needed, beats a wall of competing links.' },
  { icon: Sparkles, title: 'Keep the list warm', body: 'Email people who asked to hear from you, on a steady cadence. A warm, engaged list is the biggest lever on open rate.' },
]

export function EmailBestPractices({ overview }: { overview: MarketingEmailOverview }) {
  const checks = buildChecks(overview)
  return (
    <div className="space-y-5">
      {/* Live health checks */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {checks.map((c) => {
          const s = GRADE_STYLE[c.grade]
          const Icon = s.icon
          return (
            <div key={c.label} className={`rounded-2xl border bg-surface p-3.5 ${s.ring}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-text">{c.label}</p>
                <Icon className={`h-4 w-4 shrink-0 ${s.tone}`} aria-hidden />
              </div>
              <p className="mt-1.5 text-xl font-extrabold leading-none tabular-nums text-text">{c.value}</p>
              <p className={`mt-1 text-2xs font-medium ${s.tone}`}>
                {s.chip} · target {c.target.toLowerCase()}
              </p>
              <p className="mt-1.5 text-2xs leading-relaxed text-muted">{c.note}</p>
            </div>
          )
        })}
      </div>

      {/* Open-rate playbook */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Open-rate playbook</p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {PLAYBOOK.map((p) => {
            const Icon = p.icon
            return (
              <div key={p.title} className="flex gap-3 rounded-2xl border border-border bg-surface p-3.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text">{p.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{p.body}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
