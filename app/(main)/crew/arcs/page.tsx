import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Map, CheckCircle, Zap, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function ArcsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) notFound()

  const [{ data: chains }, { data: allSteps }, { data: allProgress }] = await Promise.all([
    admin.from('arc_chains').select('*').order('sort_order'),
    admin.from('arc_steps').select('*').order('step_order'),
    admin.from('arc_progress').select('*').eq('profile_id', profile.id),
  ])

  type Step = { id: string; chain_id: string; step_order: number; name: string; description: string; criteria: unknown; target: number; zaps_reward: number }
  type Progress = { id: string; profile_id: string; chain_id: string; current_step: number; step_progress: number; started_at: string; completed_at: string | null }

  const stepsByChain: Record<string, Step[]> = {}
  for (const step of (allSteps ?? []) as Step[]) {
    if (!stepsByChain[step.chain_id]) stepsByChain[step.chain_id] = []
    stepsByChain[step.chain_id].push(step)
  }

  const progressByChain: Record<string, Progress> = {}
  for (const p of (allProgress ?? []) as Progress[]) {
    progressByChain[p.chain_id] = p
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Link href="/crew" className="text-sm text-subtle hover:text-muted dark:hover:text-subtle transition-colors">Crew</Link>
          <span className="text-subtle">/</span>
          <h1 className="text-2xl font-bold text-text">Arcs</h1>
        </div>
        <p className="text-sm text-muted mt-1">
          Multi-step journeys that tell a story. Complete each step in order to earn bonus zaps.
        </p>
      </div>

      <div className="space-y-6">
        {(chains ?? []).map((chain) => {
          const steps: Step[] = stepsByChain[chain.id] ?? []
          const progress: Progress | undefined = progressByChain[chain.id]
          const isComplete = !!progress?.completed_at
          const currentStepOrder = progress?.current_step ?? 1
          const stepProgress = progress?.step_progress ?? 0
          const completedSteps = isComplete
            ? steps.length
            : steps.filter(s => s.step_order < currentStepOrder).length

          return (
            <div
              key={chain.id}
              className={`rounded-2xl border overflow-hidden transition-all ${
                isComplete
                  ? 'border-success bg-success-bg/30 dark:bg-success-bg/20'
                  : 'border-border bg-surface'
              } shadow-sm`}
            >
              {/* Chain header */}
              <div className="px-5 py-4 border-b border-border">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isComplete
                      ? 'bg-success-bg text-success'
                      : 'bg-primary-bg text-primary-strong'
                  }`}>
                    <Map className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-text">{chain.name}</h2>
                      {isComplete && (
                        <span className="text-xs px-1.5 py-0.5 rounded-md bg-success-bg text-success font-semibold">
                          Complete
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-0.5">{chain.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-subtle">{completedSteps}/{steps.length} steps</span>
                      <span className="text-xs text-primary flex items-center gap-0.5">
                        <Zap className="w-3 h-3" />+{chain.zaps_reward} on completion
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Steps */}
              <div className="divide-y divide-border/30">
                {steps.map((step: Step, i: number) => {
                  const isStepComplete = isComplete || step.step_order < currentStepOrder
                  const isCurrent = !isComplete && step.step_order === currentStepOrder
                  const isLocked = !isComplete && step.step_order > currentStepOrder

                  return (
                    <div
                      key={step.id}
                      className={`flex items-center gap-3 px-5 py-3 ${
                        isCurrent ? 'bg-primary-bg/50 dark:bg-primary-bg' : ''
                      }`}
                    >
                      {/* Step indicator */}
                      <div className="flex flex-col items-center shrink-0">
                        {isStepComplete ? (
                          <CheckCircle className="w-5 h-5 text-success" />
                        ) : isCurrent ? (
                          <div className="w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-primary" />
                          </div>
                        ) : (
                          <Lock className="w-4 h-4 text-subtle" />
                        )}
                        {i < steps.length - 1 && (
                          <div className={`w-0.5 h-4 mt-1 ${
                            isStepComplete ? 'bg-green-300 dark:bg-success' : 'bg-border-strong'
                          }`} />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-medium ${
                          isStepComplete ? 'text-success'
                          : isCurrent ? 'text-text'
                          : 'text-subtle'
                        }`}>
                          {step.name}
                        </span>
                        <p className={`text-xs mt-0.5 ${
                          isLocked ? 'text-subtle' : 'text-muted'
                        }`}>
                          {step.description}
                        </p>
                        {isCurrent && step.target > 1 && (
                          <div className="mt-1.5">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-xs text-subtle">{stepProgress} / {step.target}</span>
                            </div>
                            <div className="h-1 rounded-full bg-surface-elevated overflow-hidden w-32">
                              <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{ width: `${Math.min(100, Math.round((stepProgress / step.target) * 100))}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 flex items-center gap-1">
                        {step.zaps_reward > 0 && (
                          <span className={`text-xs font-medium flex items-center gap-0.5 ${
                            isStepComplete ? 'text-success' : 'text-subtle'
                          }`}>
                            <Zap className="w-3 h-3" />+{step.zaps_reward}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
