import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Target } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOutcomeReport, type ChallengeOutcome, type QuestOutcome } from '@/lib/analytics/outcomes'

// Janitor-only: program/game outcomes (ENGAGEMENT-MARKETING-ENGINE.md Phase C).
// Where members complete vs stall in challenges, quests, and circles — "what's
// working / what isn't." A low completion rate with real starts is the signal.
export const dynamic = 'force-dynamic'

// A completion rate this low, with enough starts to matter, is a friction flag.
function needsAttention(rate: number | null, started: number): boolean {
  return rate !== null && rate < 25 && started >= 3
}

function RateCell({ rate, started }: { rate: number | null; started: number }) {
  if (rate === null) return <span className="text-subtle">—</span>
  const flag = needsAttention(rate, started)
  return <span className={flag ? 'font-bold text-danger' : 'text-text'}>{rate}%{flag ? ' ⚠️' : ''}</span>
}

export default async function OutcomesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile || profile.community_role !== 'janitor') notFound()

  const { challenges, quests, circles, circleStatus } = await getOutcomeReport()

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-text">
        <Target className="h-5 w-5 text-primary-strong" />
        Outcomes
      </h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Completion + stall points across the game and circles. A low rate with real starts (⚠️) is
        where a program isn&rsquo;t landing.{' '}
        <Link href="/admin" className="text-primary-strong hover:underline">Back to admin</Link>.
      </p>

      {/* Challenges */}
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-subtle">Challenges</h2>
        {challenges.length === 0 ? (
          <p className="text-sm text-muted">No challenge activity yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-elevated text-left text-xs text-subtle">
                <tr>
                  <th className="px-4 py-2 font-medium">Challenge</th>
                  <th className="px-4 py-2 text-right font-medium">Started</th>
                  <th className="px-4 py-2 text-right font-medium">Done</th>
                  <th className="px-4 py-2 text-right font-medium">Rate</th>
                </tr>
              </thead>
              <tbody>
                {challenges.map((c: ChallengeOutcome) => (
                  <tr key={c.name} className="border-t border-border">
                    <td className="px-4 py-2 text-text">
                      {c.name}
                      {c.difficulty && <span className="ml-2 text-xs text-subtle">{c.difficulty}</span>}
                    </td>
                    <td className="px-4 py-2 text-right text-muted">{c.started}</td>
                    <td className="px-4 py-2 text-right text-muted">{c.completed}</td>
                    <td className="px-4 py-2 text-right"><RateCell rate={c.rate} started={c.started} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Quests */}
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-subtle">Quests</h2>
        {quests.length === 0 ? (
          <p className="text-sm text-muted">No quest activity yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-elevated text-left text-xs text-subtle">
                <tr>
                  <th className="px-4 py-2 font-medium">Quest</th>
                  <th className="px-4 py-2 text-right font-medium">Started</th>
                  <th className="px-4 py-2 text-right font-medium">Done</th>
                  <th className="px-4 py-2 text-right font-medium">Rate</th>
                  <th className="px-4 py-2 text-right font-medium">Stuck at step</th>
                </tr>
              </thead>
              <tbody>
                {quests.map((q: QuestOutcome) => (
                  <tr key={q.name} className="border-t border-border">
                    <td className="px-4 py-2 text-text">{q.name}</td>
                    <td className="px-4 py-2 text-right text-muted">{q.started}</td>
                    <td className="px-4 py-2 text-right text-muted">{q.completed}</td>
                    <td className="px-4 py-2 text-right"><RateCell rate={q.rate} started={q.started} /></td>
                    <td className="px-4 py-2 text-right text-muted">{q.avgStallStep ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Circles */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-subtle">Circles</h2>
        {circleStatus.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {circleStatus.map((s) => (
              <span key={s.status} className="rounded-md bg-surface-elevated px-2 py-0.5 text-xs text-muted">
                {s.status}: <span className="font-semibold text-text">{s.n}</span>
              </span>
            ))}
          </div>
        )}
        {circles.length === 0 ? (
          <p className="text-sm text-muted">No member circles yet.</p>
        ) : (
          <ul className="space-y-1">
            {circles.map((c) => (
              <li key={c.name} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm">
                <span className="truncate text-text">{c.name}</span>
                <span className="flex shrink-0 items-center gap-3 text-muted">
                  {c.status && <span className="text-xs text-subtle">{c.status}</span>}
                  <span>{c.memberCount}{c.memberCap ? `/${c.memberCap}` : ''}{c.fillPct !== null ? ` · ${c.fillPct}%` : ''}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
