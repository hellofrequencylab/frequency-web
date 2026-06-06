import { redirect } from 'next/navigation'
import Link from 'next/link'
import { GraduationCap, ArrowRight, Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { FocusTemplate } from '@/components/templates'
import { getActiveTraining } from '@/lib/onboarding/training'
import { CompleteButton } from './complete-button'

export const dynamic = 'force-dynamic'

// Role-advancement training (ADR-157 §7). Shows the member's active training Journey
// — the functions their newest role unlocked — as a curated path through the help
// center. Assigned on promotion; finished here for a one-time reward.
export default async function TrainingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')
  const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (!profile) redirect('/onboarding')

  const active = await getActiveTraining(profile.id)

  return (
    <FocusTemplate
      title="Training"
      description="As you grow into new roles, this walks you through what just became yours to do."
    >
      {!active ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-broadcast-bg text-broadcast-strong">
            <Trophy className="h-6 w-6" aria-hidden />
          </span>
          <p className="text-sm font-semibold text-text">You’re all caught up</p>
          <p className="mt-1 text-sm text-muted">No training assigned right now. New training appears when you take on a new role.</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-broadcast-bg text-broadcast-strong">
              <GraduationCap className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <h2 className="text-lg font-bold text-text">{active.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{active.blurb}</p>
            </div>
          </div>

          <ul className="space-y-2">
            {active.steps.map((s) => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className="group flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition-colors hover:border-broadcast hover:bg-broadcast-bg/30"
                >
                  <span className="text-sm font-semibold text-text">{s.label}</span>
                  <ArrowRight className="ml-auto h-4 w-4 text-subtle transition-colors group-hover:text-broadcast-strong" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>

          <CompleteButton reward={active.reward} />
        </div>
      )}
    </FocusTemplate>
  )
}
