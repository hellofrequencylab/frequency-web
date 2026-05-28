import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Map, CheckCircle, Circle, ChevronRight, Zap, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function QuestsPage() {
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
    admin.from('quest_chains').select('*').order('sort_order'),
    admin.from('quest_steps').select('*').order('step_order'),
    admin.from('quest_progress').select('*').eq('profile_id', profile.id),
  ])

  type Step = { id: string; chain_id: string; step_order: number; name: string; description: string; criteria: any; target: number; zaps_reward: number }
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
          <Link href="/crew" className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">Crew</Link>
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Quests</h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Multi-step journeys that tell a story. Complete each step in order to earn bonus zaps.
        </p>
      </div>

      <div className="space-y-6">
        {(chains ?? []).map((chain: any) => {
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
                  ? 'border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/20'
                  : 'border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900'
              } shadow-sm`}
            >
              {/* Chain header */}
              <div className="px-5 py-4 border-b border-gray-100/80 dark:border-gray-800/50">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isComplete
                      ? 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400'
                      : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
                  }`}>
                    <Map className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-gray-900 dark:text-gray-50">{chain.name}</h2>
                      {isComplete && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 font-semibold">
                          Complete
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{chain.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[11px] text-gray-400">{completedSteps}/{steps.length} steps</span>
                      <span className="text-[11px] text-amber-500 flex items-center gap-0.5">
                        <Zap className="w-3 h-3" />+{chain.zaps_reward} on completion
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Steps */}
              <div className="divide-y divide-gray-50 dark:divide-gray-800/30">
                {steps.map((step: Step, i: number) => {
                  const isStepComplete = isComplete || step.step_order < currentStepOrder
                  const isCurrent = !isComplete && step.step_order === currentStepOrder
                  const isLocked = !isComplete && step.step_order > currentStepOrder

                  return (
                    <div
                      key={step.id}
                      className={`flex items-center gap-3 px-5 py-3 ${
                        isCurrent ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''
                      }`}
                    >
                      {/* Step indicator */}
                      <div className="flex flex-col items-center shrink-0">
                        {isStepComplete ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : isCurrent ? (
                          <div className="w-5 h-5 rounded-full border-2 border-indigo-500 flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-indigo-500" />
                          </div>
                        ) : (
                          <Lock className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                        )}
                        {i < steps.length - 1 && (
                          <div className={`w-0.5 h-4 mt-1 ${
                            isStepComplete ? 'bg-green-300 dark:bg-green-700' : 'bg-gray-200 dark:bg-gray-700'
                          }`} />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-medium ${
                          isStepComplete ? 'text-green-700 dark:text-green-400'
                          : isCurrent ? 'text-gray-900 dark:text-gray-50'
                          : 'text-gray-400 dark:text-gray-500'
                        }`}>
                          {step.name}
                        </span>
                        <p className={`text-xs mt-0.5 ${
                          isLocked ? 'text-gray-300 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {step.description}
                        </p>
                        {isCurrent && step.target > 1 && (
                          <div className="mt-1.5">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[11px] text-gray-400">{stepProgress} / {step.target}</span>
                            </div>
                            <div className="h-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden w-32">
                              <div
                                className="h-full rounded-full bg-indigo-500 transition-all"
                                style={{ width: `${Math.min(100, Math.round((stepProgress / step.target) * 100))}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 flex items-center gap-1">
                        {step.zaps_reward > 0 && (
                          <span className={`text-[11px] font-medium flex items-center gap-0.5 ${
                            isStepComplete ? 'text-green-500' : 'text-gray-400'
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
