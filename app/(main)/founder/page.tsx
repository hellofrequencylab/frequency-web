import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Check, ArrowRight, Rocket, Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { FocusTemplate } from '@/components/templates'
import { getFounderTasks } from '@/lib/onboarding/founder-tasks'
import { FounderClaim } from './founder-claim'

export const dynamic = 'force-dynamic'

// Founder's First Week — the durable "go deeper" checklist (build item 1.4). The
// Vera coach hands off here once activation is done; this page is the persistent
// home. Reads real signals (lib/onboarding/founder-tasks.ts); FounderClaim handles
// reward-on-first + the badge on view.
export default async function FounderPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (!profile) redirect('/onboarding')

  const fw = await getFounderTasks(profile.id)

  return (
    <FocusTemplate
      title="Founder's First Week"
      description="Six moves that turn a sign-up into a Founder. Do them in any order — finish the set to earn the badge."
    >
      <FounderClaim />

      {/* Progress + badge state */}
      <div className="mb-5 flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
            fw.complete ? 'bg-signal-bg text-signal' : 'bg-broadcast-bg text-broadcast-strong'
          }`}
        >
          {fw.complete ? <Trophy className="h-6 w-6" aria-hidden /> : <Rocket className="h-6 w-6" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-text">
              {fw.complete ? 'First Week complete' : `${fw.doneCount} of ${fw.total} done`}
            </p>
            <span className="text-xs font-bold tabular-nums text-broadcast-strong">{fw.pct}%</span>
          </div>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-broadcast-bg">
            <span className="block h-full rounded-full bg-broadcast transition-all duration-500" style={{ width: `${fw.pct}%` }} />
          </span>
        </div>
      </div>

      {/* The six tasks */}
      <ul className="space-y-2">
        {fw.tasks.map((t) =>
          t.done ? (
            <li key={t.key} className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-broadcast text-on-broadcast">
                <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
              </span>
              <span className="flex-1 text-sm font-medium text-subtle line-through decoration-broadcast/40">{t.label}</span>
            </li>
          ) : (
            <li key={t.key}>
              <Link
                href={t.href}
                className="group flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition-colors hover:border-broadcast hover:bg-broadcast-bg/30"
              >
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-broadcast-bg text-broadcast-strong">
                  <span className="h-2 w-2 rounded-full bg-current" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text">{t.label}</span>
                  <span className="block text-xs text-muted">{t.nudge}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-broadcast-strong" aria-hidden />
              </Link>
            </li>
          ),
        )}
      </ul>
    </FocusTemplate>
  )
}
